import { screen, within } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { formatFact } from "@/features/findings/FindingCard";
import { validateFindingsSearch } from "@/features/findings/FindingsPage";
import { validateOperationSearch } from "@/features/workload/search";
import { count } from "@/lib/numbers";
import {
  ADMIN_USER,
  backend,
  capturedPlan,
  DEMO_USER,
  makeFinding,
  makeOperation,
  makeSource,
  SEQ_SCAN_PLAN,
  server,
} from "./fake-backend";
import { renderApp } from "./render-app";

function seed() {
  backend.session = ADMIN_USER;
  backend.sources = [makeSource({ id: 1, name: "Orders DB" })];
  backend.operations = [
    makeOperation({ id: 11, query: "SELECT id, status, total FROM orders WHERE customer_id = $1" }),
  ];
  backend.findings = [
    makeFinding({ id: 1 }),
    makeFinding({
      id: 2,
      rule_id: "PG-UNUSED-INDEX",
      rule_title: "Unused index",
      target_kind: "index",
      target_key: "index:public.idx_orders_legacy_lookup",
      fingerprint_id: null,
      query: null,
      relation: "public.idx_orders_legacy_lookup",
      title: "Index public.idx_orders_legacy_lookup is never used",
      confidence: "medium",
      evidence_strength: "statistics",
      action_sql: "DROP INDEX CONCURRENTLY public.idx_orders_legacy_lookup;",
      facts: [{ key: "size_bytes", label: "Index size (bytes)", value: 9 * 1024 * 1024 }],
      evidence: [
        {
          kind: "relation_stat",
          label: "public.idx_orders_legacy_lookup: 0 scans",
          available: true,
          relation_stat_id: 9,
        },
      ],
    }),
    makeFinding({
      id: 3,
      status: "dismissed",
      title: "An old, dismissed finding",
      status_changed_by: "user",
    }),
  ];
}

function cards() {
  return screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
}

describe("search params", () => {
  it("findings: open is the default, invalid values fall back", () => {
    expect(
      validateFindingsSearch({ status: "open", source: "2", rule: "PG-UNUSED-INDEX" }),
    ).toEqual({
      status: undefined,
      source: 2,
      rule: "PG-UNUSED-INDEX",
    });
    expect(validateFindingsSearch({ status: "gone", source: "-1", rule: "<script>" })).toEqual({
      status: undefined,
      source: undefined,
      rule: undefined,
    });
  });

  it("operation: a cited node needs a cited plan and a valid path", () => {
    expect(validateOperationSearch({ plan: "7", node: "0.1" })).toMatchObject({
      plan: 7,
      node: "0.1",
    });
    expect(validateOperationSearch({ node: "0.1" })).toMatchObject({
      plan: undefined,
      node: undefined,
    });
    expect(validateOperationSearch({ plan: "7", node: "0;1" })).toMatchObject({
      plan: 7,
      node: undefined,
    });
  });

  it("formats facts by what they are", () => {
    expect(formatFact({ key: "share_of_total_time", label: "", value: 0.54 })).toBe(
      new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 2 }).format(0.54),
    );
    expect(formatFact({ key: "size_bytes", label: "", value: 9 * 1024 * 1024 })).toBe("9.0 MB");
    expect(formatFact({ key: "pattern_visible", label: "", value: false })).toBe("No");
    expect(formatFact({ key: "sort_key", label: "", value: "orders.created_at DESC" })).toBe(
      "orders.created_at DESC",
    );
  });
});

describe("findings page", () => {
  it("lists open findings with confidence, evidence kind, facts, fix and evidence links", async () => {
    seed();
    renderApp("/findings");
    expect(
      await screen.findByText("Sequential scan on public.orders in a hot query"),
    ).toBeInTheDocument();
    expect(cards()).toEqual([
      "Sequential scan on public.orders in a hot query",
      "Index public.idx_orders_legacy_lookup is never used",
    ]);
    const p1 = screen
      .getByRole("heading", { name: /Sequential scan/ })
      .closest("div.rounded-xl") as HTMLElement;
    const scope = within(p1);
    expect(scope.getByText("high confidence")).toBeInTheDocument();
    expect(scope.getByText("Plan evidence")).toBeInTheDocument();
    expect(scope.getByText(count(200_000))).toBeInTheDocument(); // locale-formatted
    expect(
      scope.getByText("CREATE INDEX CONCURRENTLY ON public.orders (customer_id);"),
    ).toBeInTheDocument();
    expect(scope.getByText(/never runs it for you/)).toBeInTheDocument();

    const evidence = within(scope.getByRole("list", { name: "Evidence" }));
    const plan = evidence.getByRole("link", { name: /Plan #7/ });
    // The router JSON-encodes search values, so "0" (a string that looks like a number) is
    // quoted in the URL; it decodes back to the same string.
    const href = new URL(plan.getAttribute("href") ?? "", "http://x");
    expect(href.pathname).toBe("/operations/11");
    expect(href.searchParams.get("plan")).toBe("7");
    expect(JSON.parse(href.searchParams.get("node") ?? "")).toBe("0");
    expect(href.hash).toBe("#plan");
    const window = evidence.getByRole("link", { name: /1,000 calls/ });
    expect(window.getAttribute("href")).toContain("/operations/11?from=");
    expect(evidence.getByText("public.orders: 200,000 live rows").closest("a")).toBeNull();

    const p4 = screen
      .getByRole("heading", { name: /never used/ })
      .closest("div.rounded-xl") as HTMLElement;
    expect(within(p4).getByText("Statistics heuristic")).toBeInTheDocument();
    expect(within(p4).getByText("9.0 MB")).toBeInTheDocument();

    const tabs = screen.getByRole("tablist", { name: "Status" });
    expect(within(tabs).getByRole("tab", { name: /Open\s*2/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(tabs).getByRole("tab", { name: /Dismissed\s*1/ })).toBeInTheDocument();
  });

  it("keeps the status, source and rule filters in the URL", async () => {
    seed();
    const { user, router } = renderApp("/findings");
    await screen.findByText("Sequential scan on public.orders in a hot query");

    await user.click(screen.getByRole("tab", { name: /Dismissed/ }));
    expect(await screen.findByText("An old, dismissed finding")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Open/ }));
    await user.selectOptions(await screen.findByLabelText("Rule"), "PG-UNUSED-INDEX");
    expect(router.state.location.search).toEqual({ rule: "PG-UNUSED-INDEX" });
    await screen.findByText("Index public.idx_orders_legacy_lookup is never used");
    expect(cards()).toEqual(["Index public.idx_orders_legacy_lookup is never used"]);
  });

  it("lets the admin dismiss and reopen a finding", async () => {
    seed();
    const { user } = renderApp("/findings");
    const card = (await screen.findByRole("heading", { name: /Sequential scan/ })).closest(
      "div.rounded-xl",
    ) as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "Dismiss" }));
    expect(backend.findingUpdates).toEqual([{ id: 1, status: "dismissed" }]);
    await screen.findByText("No open findings.", { exact: false }).catch(() => undefined);
    expect(cards()).toEqual(["Index public.idx_orders_legacy_lookup is never used"]);

    await user.click(screen.getByRole("tab", { name: /Dismissed/ }));
    const dismissed = (await screen.findByRole("heading", { name: /Sequential scan/ })).closest(
      "div.rounded-xl",
    ) as HTMLElement;
    await user.click(within(dismissed).getByRole("button", { name: "Reopen" }));
    expect(backend.findingUpdates.at(-1)).toEqual({ id: 1, status: "open" });
  });

  it("shows no status buttons to the read-only demo user", async () => {
    seed();
    backend.session = DEMO_USER;
    renderApp("/findings");
    await screen.findByText("Sequential scan on public.orders in a hot query");
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark resolved" })).not.toBeInTheDocument();
  });

  it("says when evidence has aged out", async () => {
    seed();
    backend.findings = [
      makeFinding({
        id: 1,
        evidence: [
          {
            kind: "plan",
            label: "Plan #7: Seq Scan on orders",
            available: false,
            plan_id: 7,
            fingerprint_id: 11,
            node_path: "0",
          },
        ],
      }),
    ];
    renderApp("/findings");
    expect(await screen.findByText("(no longer stored)")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Plan #7/ })).not.toBeInTheDocument();
  });

  it("explains an empty list and shows errors", async () => {
    backend.session = ADMIN_USER;
    renderApp("/findings");
    expect(
      await screen.findByText(/No open findings. The rules run after each collection/),
    ).toBeInTheDocument();

    server.use(
      http.get("/api/findings", () => HttpResponse.json({ detail: "Boom" }, { status: 400 })),
    );
    renderApp("/findings?status=resolved");
    expect(await screen.findByText("Couldn't load findings: Boom")).toBeInTheDocument();
  });

  it("veils the list while another tab loads, but not on the quiet refresh", async () => {
    seed();
    const { user } = renderApp("/findings");
    await screen.findByText("Sequential scan on public.orders in a hot query");
    expect(screen.queryByText("Updating findings…")).not.toBeInTheDocument();

    server.use(
      http.get("/api/findings", async () => {
        await delay(400);
        return HttpResponse.json({
          findings: [
            makeFinding({ id: 3, status: "dismissed", title: "An old, dismissed finding" }),
          ],
          counts: { open: 2, dismissed: 1, resolved: 0 },
        });
      }),
    );
    await user.click(screen.getByRole("tab", { name: /Dismissed/ }));
    expect(await screen.findByText("Updating findings…")).toBeInTheDocument();
    expect(await screen.findByText("An old, dismissed finding")).toBeInTheDocument();
    expect(screen.queryByText("Updating findings…")).not.toBeInTheDocument();
  });

  it("opens the operation from the finding's title, on the cited plan when there is one", async () => {
    seed();
    renderApp("/findings");
    const title = await screen.findByRole("heading", { name: /Sequential scan/ });
    const link = within(title).getByRole("link", { name: /Sequential scan/ });
    expect(link.getAttribute("href")).toMatch(/\/operations\/11\?.*plan=7.*#plan$/);

    // An index finding has no page of its own: its title is plain text.
    const index = await screen.findByRole("heading", { name: /never used/ });
    expect(within(index).queryByRole("link")).not.toBeInTheDocument();
  });

  it("offers to clear the filters only while some are set", async () => {
    seed();
    const { user, router } = renderApp("/findings?source=1");
    const clear = await screen.findByRole("button", { name: "Clear filters" });
    await user.click(clear);
    await screen.findByText("Sequential scan on public.orders in a hot query");
    expect(router.state.location.search).toEqual({});
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("counts open findings in the navigation", async () => {
    seed();
    renderApp("/");
    expect(await screen.findByLabelText("2 open")).toBeInTheDocument();
  });
});

describe("findings on the operation page", () => {
  it("lists the operation's findings and opens the exact plan a finding cites", async () => {
    seed();
    backend.plans.set(
      11,
      capturedPlan(11, {
        ...SEQ_SCAN_PLAN,
        node_type: "Index Scan",
        relation_name: "orders",
        index_name: "idx_new",
      }),
    );
    backend.storedPlans.set(7, { ...capturedPlan(11), plan_id: 7 });
    const { user } = renderApp("/operations/11");

    const section = await screen.findByRole("region", { name: "Findings" });
    expect(
      within(section).getByText("Sequential scan on public.orders in a hot query"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Index Scan")).toBeInTheDocument(); // the latest plan

    const [firstPlanLink] = within(section).getAllByRole("link", { name: /Plan #7/ });
    await user.click(firstPlanLink as HTMLElement);
    expect(await screen.findByText(/Showing plan #7, the one a finding cites/)).toBeInTheDocument();
    const tree = await screen.findByRole("list", { name: "Plan nodes" });
    expect(within(tree).getByText("Seq Scan")).toBeInTheDocument();
    expect(within(tree).getByText("Cited by the finding")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-capture" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Show the latest plan" }));
    expect(await screen.findByText("Index Scan")).toBeInTheDocument();
  });

  it("shows no findings section when the operation has none", async () => {
    seed();
    backend.findings = [];
    renderApp("/operations/11");
    expect(await screen.findByRole("heading", { name: "Operation" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Findings" })).not.toBeInTheDocument();
  });
});
