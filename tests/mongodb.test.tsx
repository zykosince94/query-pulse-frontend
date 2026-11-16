import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { count } from "@/lib/numbers";
import {
  ADMIN_USER,
  backend,
  capturedMongoPlan,
  M1_SHAPE,
  makeFinding,
  makeMongoOperation,
  makeMongoSource,
  makeOperation,
  makeServerMetrics,
  makeSource,
  PROFILER_FIX,
  planOf,
  REGEX_STAGES,
  server,
} from "./fake-backend";
import { renderApp } from "./render-app";

const M3_SHAPE = '{"find": "products", "filter": {"sku": {"$regex": "?"}}}';

/** A PostgreSQL source and a MongoDB source (profiler on unless said otherwise). */
function seed(profiler = true) {
  backend.session = ADMIN_USER;
  backend.sources = [
    makeSource({ id: 1, name: "Orders DB" }),
    makeMongoSource({ id: 2 }, profiler),
  ];
  backend.operations = profiler
    ? [
        makeOperation({ id: 11, total_exec_time_ms: 9000 }),
        makeMongoOperation({ id: 21, source_id: 2, total_exec_time_ms: 5000 }),
        makeMongoOperation({
          id: 23,
          source_id: 2,
          query: M3_SHAPE,
          namespace: "shop.products",
          total_exec_time_ms: 2000,
          docs_examined: 47,
          keys_examined: 380_000,
          rows: 47,
        }),
      ]
    : [makeOperation({ id: 11 })];
}

describe("MongoDB in the explorer (QP-AC-25)", () => {
  it("ranks both engines in one list, each with its engine badge", async () => {
    seed();
    renderApp("/");
    const table = await screen.findByRole("table", { name: /Operations ranked/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0] as HTMLElement).getByText("PostgreSQL")).toBeInTheDocument();
    const m1 = rows[1] as HTMLElement;
    expect(within(m1).getByText("MongoDB")).toBeInTheDocument();
    expect(within(m1).getByText("shop.orders")).toBeInTheDocument();
    expect(within(m1).getByRole("link", { name: M1_SHAPE })).toHaveAttribute(
      "href",
      expect.stringContaining("/operations/21"),
    );
  });
});

describe("profiling off (QP-AC-24)", () => {
  it("shows the capability gap and its fix instead of an empty list", async () => {
    seed(false);
    renderApp("/?source=2");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Operations from Shop MongoDB aren't collected");
    expect(alert).toHaveTextContent("Profiling is off on database 'shop'.");
    expect(within(alert).getByText(PROFILER_FIX)).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Copy the fix" })).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Nothing to rank from this source until its profiler is on (see above).",
      ),
    ).toBeInTheDocument();
  });

  it("flags the gap above the list when all sources are shown", async () => {
    seed(false);
    renderApp("/");
    expect(await screen.findByRole("table", { name: /Operations ranked/ })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Shop MongoDB");
  });

  it("says nothing when every MongoDB source can be profiled", async () => {
    seed(true);
    renderApp("/");
    expect(await screen.findByRole("table", { name: /Operations ranked/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("a MongoDB shape's page", () => {
  it("shows the shape, examined vs returned, and the winning plan's stages", async () => {
    seed();
    backend.plans.set(21, capturedMongoPlan(21));
    renderApp("/operations/21");
    expect(await screen.findByRole("heading", { name: "Query shape" })).toBeInTheDocument();
    expect(screen.getByText(/"customerId": "\?"/)).toBeInTheDocument(); // indented JSON
    expect(screen.getByText(/find on shop.orders/)).toBeInTheDocument();
    expect(screen.getByText("Examined per returned")).toBeInTheDocument();
    expect(screen.getByText(count(5_000_000 / 250))).toBeInTheDocument();
    expect(screen.getByText("Documents returned")).toBeInTheDocument();
    expect(screen.queryByText("Cache hit ratio")).not.toBeInTheDocument();

    const stages = await screen.findByRole("list", { name: "Plan stages" });
    expect(within(stages).getByText("COLLSCAN")).toBeInTheDocument();
    expect(within(stages).getByText("Reads the whole collection")).toBeInTheDocument();
    expect(within(stages).getByText('{"customerId": {"$eq": "?"}}')).toBeInTheDocument();
    expect(
      screen.getByText(/MongoDB considered 1 other plan and chose this one/),
    ).toBeInTheDocument();
    expect(screen.getByText(/explain at queryPlanner verbosity/)).toBeInTheDocument();
    // Plans come from the collector's in-memory commands: no on-demand capture, even for admins.
    expect(screen.queryByRole("button", { name: "Re-capture" })).not.toBeInTheDocument();
  });

  it("explains a missing plan without offering a capture", async () => {
    seed();
    renderApp("/operations/21");
    expect(await screen.findByText(/explains the busiest shapes/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Capture plan now" })).not.toBeInTheDocument();
  });

  it("says why MongoDB couldn't explain a shape", async () => {
    seed();
    backend.plans.set(
      21,
      planOf({
        operation_id: 21,
        engine: "mongodb",
        status: "failed",
        plan_id: 4,
        reason: "Plans are captured for reads only (find, aggregate, count, distinct).",
      }),
    );
    renderApp("/operations/21");
    expect(await screen.findByText("MongoDB couldn't explain this operation.")).toBeInTheDocument();
    expect(screen.getByText(/captured for reads only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("opens the plan an M3 finding cites, with the whole-index scan outlined", async () => {
    seed();
    backend.storedPlans.set(31, { ...capturedMongoPlan(23, REGEX_STAGES), plan_id: 31 });
    renderApp("/operations/23?plan=31&node=%220.0%22");
    const stages = await screen.findByRole("list", { name: "Plan stages" });
    expect(screen.getByText(/Showing plan #31, the one a finding cites/)).toBeInTheDocument();
    const ixscan = within(stages).getByText("IXSCAN").closest("[data-stage]") as HTMLElement;
    expect(within(ixscan).getByText("Cited by the finding")).toBeInTheDocument();
    expect(within(ixscan).getByText("Scans the whole index")).toBeInTheDocument();
    expect(within(ixscan).getByText("sku_1")).toBeInTheDocument();
    expect(within(ixscan).getByText(/sku: \["", \{\}\), \?/)).toBeInTheDocument();
  });
});

describe("a MongoDB finding", () => {
  it("labels its fix as a mongosh command and shows the engine", async () => {
    seed();
    backend.findings = [
      makeFinding({
        id: 5,
        source_id: 2,
        source_name: "Shop MongoDB",
        engine: "mongodb",
        rule_id: "MDB-COLLSCAN",
        rule_title: "Collection scan",
        fingerprint_id: 21,
        query: M1_SHAPE,
        relation: "shop.orders",
        title: "Collection scan on shop.orders",
        action_sql:
          'db.getSiblingDB("shop").getCollection("orders").createIndex({ "customerId": 1 })',
      }),
    ];
    renderApp("/findings");
    const card = (await screen.findByText("Collection scan on shop.orders")).closest(
      "[aria-labelledby]",
    ) as HTMLElement;
    expect(within(card).getByText("MongoDB")).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: "Copy the mongosh command" }),
    ).toBeInTheDocument();
    expect(within(card).getByText("Plan evidence")).toHaveAttribute(
      "title",
      "Read from a captured query plan: what MongoDB will do",
    );
  });
});

describe("a MongoDB source's page", () => {
  it("shows serverStatus: rates, connections and cache", async () => {
    seed();
    backend.serverMetrics.set(2, makeServerMetrics(2));
    renderApp("/sources/2");
    const table = await screen.findByRole("table", { name: "Operations per second, by type" });
    const query = within(table).getByText("query").closest("tr") as HTMLElement;
    expect(within(query).getByText("10.1")).toBeInTheDocument();
    expect(screen.getByText("primary")).toBeInTheDocument();
    expect(screen.getByText(/\(838 available\)/)).toBeInTheDocument();
    expect(screen.getByText("1 d 2 h")).toBeInTheDocument();
    expect(screen.getByText("Profiled operations per minute")).toBeInTheDocument();
  });

  it("says when there's no sample yet, and when rates need another one", async () => {
    seed();
    renderApp("/sources/2");
    expect(await screen.findByText(/No sample yet/)).toBeInTheDocument();
  });

  it("shows rates as unknown right after a restart", async () => {
    seed();
    backend.serverMetrics.set(
      2,
      makeServerMetrics(2, { rates_per_second: null, rate_seconds: null }),
    );
    renderApp("/sources/2");
    expect(await screen.findByText(/Rates need two samples/)).toBeInTheDocument();
  });

  it("shows an error when the metrics can't be loaded", { timeout: 10_000 }, async () => {
    seed();
    server.use(
      http.get("/api/sources/:id/server", () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 }),
      ),
    );
    renderApp("/sources/2");
    // Server errors are retried twice (with backoff) before the error is shown.
    expect(
      await screen.findByText(/Couldn't load server metrics: boom/, {}, { timeout: 6000 }),
    ).toBeInTheDocument();
  });
});
