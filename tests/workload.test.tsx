import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ADMIN_USER, backend, makeSource, makeTrend } from "./fake-backend";
import { renderApp } from "./render-app";

describe("health strip (home)", () => {
  it("shows each source's status, last-hour totals and a labelled sparkline", async () => {
    backend.session = ADMIN_USER;
    backend.sources = [
      makeSource({ id: 1, name: "Orders DB", last_collected_at: new Date().toISOString() }),
    ];
    backend.trends.set(1, makeTrend([100, 250, 400]));
    renderApp("/");

    const card = (await screen.findByRole("link", { name: "Orders DB" })).closest("div.rounded-xl");
    expect(card).not.toBeNull();
    const scope = within(card as HTMLElement);
    expect(scope.getByText("750")).toBeInTheDocument(); // calls in the last hour
    expect(scope.getByText("1.5 s")).toBeInTheDocument(); // 750 calls × 2 ms
    expect(scope.getByText("Healthy")).toBeInTheDocument();
    expect(scope.getByText(/Collected just now|Collected .* ago/)).toBeInTheDocument();
    expect(
      await scope.findByRole("figure", {
        name: /calls per minute over the last hour, 750 in total/,
      }),
    ).toBeInTheDocument();
  });

  it("flags incomplete results from pg_stat_statements evictions", async () => {
    backend.session = ADMIN_USER;
    backend.sources = [
      makeSource({ id: 1, warnings: ["pg_stat_statements evicted 12 statement(s)…"] }),
    ];
    renderApp("/");
    expect(await screen.findByText("Incomplete")).toBeInTheDocument();
  });

  it("explains MongoDB sources aren't collected yet", async () => {
    backend.session = ADMIN_USER;
    backend.sources = [makeSource({ id: 2, name: "Events", engine: "mongodb", port: 27017 })];
    renderApp("/");
    expect(
      await screen.findByText("MongoDB workload collection arrives in Phase 6."),
    ).toBeInTheDocument();
  });

  it("warns when the collector isn't running", async () => {
    backend.session = ADMIN_USER;
    backend.collectorRunning = false;
    backend.sources = [makeSource({ id: 1 })];
    renderApp("/");
    expect(await screen.findByText(/Charts won't update until it's running/)).toBeInTheDocument();
    expect(screen.getByText("not running")).toBeInTheDocument();
  });

  it("invites adding a source when there are none", async () => {
    backend.session = ADMIN_USER;
    renderApp("/");
    expect(await screen.findByText(/No data sources yet/)).toBeInTheDocument();
  });
});

describe("collection panel (source detail)", () => {
  it("shows last collection, both trend charts, and a table view of the data", async () => {
    backend.session = ADMIN_USER;
    backend.sources = [makeSource({ id: 3, last_collected_at: new Date().toISOString() })];
    backend.trends.set(3, makeTrend([10, 0, 30]));
    const { user } = renderApp("/sources/3");

    expect(await screen.findByText(/Last collected/)).toBeInTheDocument();
    expect(await screen.findByText("40 in the last hour")).toBeInTheDocument();
    expect(screen.getByText("80 ms in the last hour")).toBeInTheDocument();
    expect(await screen.findByRole("figure", { name: /Calls per minute/ })).toBeInTheDocument();
    expect(
      await screen.findByRole("figure", { name: /Execution time per minute/ }),
    ).toBeInTheDocument();

    const [callsTable] = screen.getAllByText("Show data");
    await user.click(callsTable as HTMLElement);
    const table = screen.getAllByRole("table")[0] as HTMLElement;
    const values = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.lastElementChild?.textContent);
    expect(values).toEqual(["10", "0", "30"]);
  });

  it("shows the eviction warning with what to do", async () => {
    backend.session = ADMIN_USER;
    backend.sources = [
      makeSource({
        id: 3,
        warnings: [
          "pg_stat_statements evicted 12 statement(s) because its table is full. Raise pg_stat_statements.max.",
        ],
      }),
    ];
    renderApp("/sources/3");
    expect(await screen.findByText(/Raise pg_stat_statements.max/)).toBeInTheDocument();
  });

  it("says when the first collection hasn't happened yet", async () => {
    backend.session = ADMIN_USER;
    backend.sources = [makeSource({ id: 3, last_collected_at: null })];
    renderApp("/sources/3");
    expect(await screen.findByText(/Waiting for the first collection/)).toBeInTheDocument();
  });

  it("explains a disabled source isn't collected", async () => {
    backend.session = ADMIN_USER;
    backend.sources = [makeSource({ id: 3, enabled: false })];
    renderApp("/sources/3");
    expect(await screen.findByText(/This source is disabled/)).toBeInTheDocument();
  });
});
