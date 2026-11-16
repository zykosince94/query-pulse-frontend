import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { lockWindow, validateExplorerSearch, windowParams } from "@/features/workload/search";
import { count } from "@/lib/numbers";
import {
  ADMIN_USER,
  backend,
  capturedPlan,
  DEMO_USER,
  makeOperation,
  makeSource,
  server,
} from "./fake-backend";
import { renderApp } from "./render-app";

function seedWorkload() {
  backend.session = ADMIN_USER;
  backend.sources = [
    makeSource({ id: 1, name: "Orders DB" }),
    makeSource({ id: 2, name: "Billing" }),
  ];
  backend.operations = [
    makeOperation({
      id: 11,
      query: "SELECT id, status, total FROM orders WHERE customer_id = $1",
      total_exec_time_ms: 5600,
      calls: 1000,
      share_of_total_time: 0.54,
    }),
    makeOperation({
      id: 12,
      query: "SELECT id FROM orders ORDER BY created_at DESC LIMIT $1",
      total_exec_time_ms: 4200,
      calls: 300,
      share_of_total_time: 0.4,
    }),
    makeOperation({
      id: 13,
      source_id: 2,
      source_name: "Billing",
      query: "SELECT id FROM invoices WHERE id = $1",
      total_exec_time_ms: 30,
      calls: 9000,
      share_of_total_time: 1,
    }),
  ];
}

async function rows() {
  const table = await screen.findByRole("table", { name: /Operations ranked by/ });
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getByRole("link").textContent ?? "");
}

function lastRequest(): URLSearchParams {
  const request = backend.operationRequests.at(-1);
  if (!request) throw new Error("no /api/operations request");
  return request;
}

describe("URL search params", () => {
  it("drops defaults and invalid values instead of erroring", () => {
    expect(
      validateExplorerSearch({ range: "1h", sort: "total_time", source: "x", q: "  ", junk: 1 }),
    ).toEqual({
      range: undefined,
      from: undefined,
      to: undefined,
      sort: undefined,
      source: undefined,
      q: undefined,
    });
    expect(validateExplorerSearch({ range: "forever", sort: "random" })).toMatchObject({
      range: undefined,
      sort: undefined,
    });
  });

  it("keeps an absolute window and ignores the relative one beside it", () => {
    const search = validateExplorerSearch({
      range: "15m",
      from: "2026-11-16T10:00:00Z",
      to: "2026-11-16T11:00:00Z",
    });
    expect(search.range).toBeUndefined();
    expect(windowParams(search)).toEqual({
      start: "2026-11-16T10:00:00.000Z",
      end: "2026-11-16T11:00:00.000Z",
    });
  });

  it("rejects an absolute window that ends before it starts", () => {
    const search = validateExplorerSearch({
      from: "2026-11-16T11:00:00Z",
      to: "2026-11-16T10:00:00Z",
    });
    expect(search.from).toBeUndefined();
    expect(windowParams(search)).toEqual({ minutes: 60 });
  });

  it("locks a relative range into the absolute one it covers now", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    expect(lockWindow({ range: "15m" }, now)).toEqual({
      range: undefined,
      from: "2026-11-16T11:45:00.000Z",
      to: "2026-11-16T12:00:00.000Z",
    });
  });
});

describe("workload explorer", () => {
  it("ranks operations by total time over the last hour by default", async () => {
    seedWorkload();
    renderApp("/");
    expect(await rows()).toEqual([
      "SELECT id, status, total FROM orders WHERE customer_id = $1",
      "SELECT id FROM orders ORDER BY created_at DESC LIMIT $1",
      "SELECT id FROM invoices WHERE id = $1",
    ]);
    expect(lastRequest().get("minutes")).toBe("60");
    expect(lastRequest().get("sort")).toBe("total_time");
    expect(screen.getByText("54%")).toBeInTheDocument();
    expect(screen.getByText("5.6 s")).toBeInTheDocument();
    expect(screen.getByText(/3 operations/)).toBeInTheDocument();
  });

  it("reopens a copied URL with the same filters and time range (QP-AC-16)", async () => {
    seedWorkload();
    const from = "2026-11-16T10:00:00.000Z";
    const to = "2026-11-16T10:15:00.000Z";
    renderApp(`/?from=${from}&to=${to}&sort=calls&source=1&q=orders`);

    expect(await rows()).toEqual([
      "SELECT id, status, total FROM orders WHERE customer_id = $1",
      "SELECT id FROM orders ORDER BY created_at DESC LIMIT $1",
    ]);
    const request = lastRequest();
    expect(Object.fromEntries(request)).toMatchObject({
      start: from,
      end: to,
      sort: "calls",
      source_id: "1",
      q: "orders",
    });
    expect(screen.getByLabelText("Rank by")).toHaveValue("calls");
    expect(screen.getByLabelText("Source")).toHaveValue("1");
    expect(screen.getByLabelText("Statement contains")).toHaveValue("orders");
    expect(screen.getByLabelText("Time range")).toHaveValue("custom");
  });

  it("writes every control into the URL", async () => {
    seedWorkload();
    const { user, router } = renderApp("/");
    await rows();

    await user.selectOptions(screen.getByLabelText("Rank by"), "calls");
    await user.selectOptions(screen.getByLabelText("Time range"), "15m");
    await user.selectOptions(screen.getByLabelText("Source"), "2");
    await user.type(screen.getByLabelText("Statement contains"), "invoices{Enter}");

    expect(router.state.location.search).toEqual({
      sort: "calls",
      range: "15m",
      source: 2,
      q: "invoices",
    });
    expect(await rows()).toEqual(["SELECT id FROM invoices WHERE id = $1"]);
    expect(Object.fromEntries(lastRequest())).toMatchObject({
      minutes: "15",
      sort: "calls",
      source_id: "2",
      q: "invoices",
    });
  });

  it("locks the range so a shared link shows fixed data", async () => {
    seedWorkload();
    const { user, router } = renderApp("/?range=15m");
    await rows();
    await user.click(screen.getByRole("button", { name: "Lock range" }));
    const search = router.state.location.search as Record<string, string | undefined>;
    expect(search.range).toBeUndefined();
    expect(Date.parse(search.to ?? "") - Date.parse(search.from ?? "")).toBe(15 * 60_000);
    expect(screen.queryByRole("button", { name: "Lock range" })).not.toBeInTheDocument();
  });

  it("explains an empty window", async () => {
    backend.session = ADMIN_USER;
    renderApp("/");
    expect(
      await screen.findByText(/No operations were collected in this time range/),
    ).toBeInTheDocument();
  });

  it("says when filters match nothing", async () => {
    seedWorkload();
    renderApp("/?q=nothing-like-this");
    expect(
      await screen.findByText("No operations match these filters in this time range."),
    ).toBeInTheDocument();
  });

  it("shows an error when the list can't load", async () => {
    seedWorkload();
    server.use(
      http.get("/api/operations", () => HttpResponse.json({ detail: "Boom" }, { status: 400 })),
    );
    renderApp("/");
    expect(await screen.findByText("Couldn't load operations: Boom")).toBeInTheDocument();
  });
});

describe("operation detail", () => {
  it("shows the statement, window metrics and history, keeping the time range", async () => {
    seedWorkload();
    const start = Date.now() - 3 * 60_000;
    backend.history.set(
      11,
      [0, 1, 2].map((i) => ({
        start: new Date(start + i * 60_000).toISOString(),
        calls: [400, 0, 600][i] ?? 0,
        total_exec_time_ms: [2000, 0, 3600][i] ?? 0,
        mean_exec_time_ms: i === 1 ? null : 5,
        rows: 1,
      })),
    );
    const { user } = renderApp("/?range=15m");
    await user.click(await screen.findByRole("link", { name: /customer_id = \$1/ }));

    expect(await screen.findByRole("heading", { name: "Operation" })).toBeInTheDocument();
    expect(
      screen.getByText("SELECT id, status, total FROM orders WHERE customer_id = $1", {
        selector: "pre",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("54% of the source's total")).toBeInTheDocument();
    expect(screen.getByText("90.0%")).toBeInTheDocument(); // cache hit ratio 90 / 100
    expect(screen.getByLabelText("Time range")).toHaveValue("15m");
    expect(
      await screen.findByRole("figure", {
        name: /Calls per minute, last 15 minutes: 1,000 in total/,
      }),
    ).toBeInTheDocument();

    const [, callsTable] = screen.getAllByText("Show data");
    await user.click(callsTable as HTMLElement);
    const table = screen.getAllByRole("table")[1] as HTMLElement;
    expect(
      within(table)
        .getAllByRole("row")
        .map((r) => r.lastChild?.textContent),
    ).toEqual(["calls", "400", "0", "600"]);
  });

  it("says when an operation doesn't exist", async () => {
    backend.session = ADMIN_USER;
    renderApp("/operations/999");
    expect(await screen.findByText(/This operation doesn't exist/)).toBeInTheDocument();
  });

  it("treats a non-numeric id as not found", async () => {
    backend.session = ADMIN_USER;
    renderApp("/operations/abc");
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });
});

describe("plan viewer", () => {
  it("draws the node tree with cost and rows, flagging the sequential scan", async () => {
    seedWorkload();
    backend.plans.set(
      11,
      capturedPlan(11, {
        path: "0",
        node_type: "Limit",
        startup_cost: 7250.02,
        total_cost: 7252.32,
        plan_rows: 20,
        plan_width: 30,
        sort_key: [],
        details: {},
        children: [
          {
            path: "0.0",
            node_type: "Sort",
            startup_cost: 7250.02,
            total_cost: 7750,
            plan_rows: 200000,
            plan_width: 30,
            sort_key: ["orders.created_at DESC"],
            details: {},
            children: [
              {
                path: "0.0.0",
                node_type: "Seq Scan",
                relation_name: "orders",
                alias: "orders",
                startup_cost: 0,
                total_cost: 4443,
                plan_rows: 200000,
                plan_width: 30,
                sort_key: [],
                details: {},
                children: [],
              },
            ],
          },
        ],
      }),
    );
    renderApp("/operations/11");

    const tree = await screen.findByRole("list", { name: "Plan nodes" });
    const nodes = within(tree)
      .getAllByText(/^(Limit|Sort|Seq Scan)$/)
      .map((n) => n.textContent);
    expect(nodes).toEqual(["Limit", "Sort", "Seq Scan"]);
    expect(within(tree).getByText("Reads the whole table")).toBeInTheDocument();
    expect(within(tree).getByText("orders.created_at DESC")).toBeInTheDocument();
    expect(within(tree).getByText("7,250.02..7,252.32")).toBeInTheDocument();
    expect(within(tree).getAllByText(count(200_000))).toHaveLength(2); // estimated rows, in this machine's locale
    expect(screen.getByText("Raw plan (EXPLAIN JSON)")).toBeInTheDocument();
  });

  it("explains why a source can't produce plans, with the fix", async () => {
    seedWorkload();
    backend.plans.set(11, {
      operation_id: 11,
      status: "unavailable",
      reason: "Generic plans need PostgreSQL 16 or later.",
      fix: "Upgrade to PostgreSQL 16 or later.",
    });
    renderApp("/operations/11");
    expect(await screen.findByText("Plans aren't available for this source.")).toBeInTheDocument();
    expect(screen.getByText("Upgrade to PostgreSQL 16 or later.")).toBeInTheDocument();
  });

  it("shows why planning failed", async () => {
    seedWorkload();
    backend.plans.set(11, {
      operation_id: 11,
      status: "failed",
      plan_id: 3,
      reason: "The monitoring user can't read a table in this statement.",
    });
    renderApp("/operations/11");
    expect(await screen.findByText("PostgreSQL couldn't plan this statement.")).toBeInTheDocument();
    expect(screen.getByText(/can't read a table/)).toBeInTheDocument();
  });

  it("lets the admin capture a plan that isn't there yet", async () => {
    seedWorkload();
    const { user } = renderApp("/operations/11");
    expect(await screen.findByText(/No plan captured yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Capture plan now" }));
    expect(await screen.findByText("Reads the whole table")).toBeInTheDocument();
    expect(backend.captures).toBe(1);
  });

  it("hides capture from the read-only demo user", async () => {
    seedWorkload();
    backend.session = DEMO_USER;
    renderApp("/operations/11");
    expect(await screen.findByText(/No plan captured yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Capture plan now" })).not.toBeInTheDocument();
  });
});
