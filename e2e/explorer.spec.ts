import { expect, type Page, test } from "@playwright/test";

/**
 * QP-AC-16 and QP-AC-17 against the backend's full Docker stack (`make demo`), with the demo
 * workload running. The demo PostgreSQL is registered as a source if it isn't already, and
 * the tests wait for the collector to have observed P1 (cycles are 15 s in the demo).
 */

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin-demo-password";
const P1 = "SELECT id, status, total FROM orders WHERE customer_id = $1";
const COLLECTION_WAIT_MS = 4 * 60_000;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(ADMIN_USERNAME);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Workload", exact: true })).toBeVisible();
}

/** Register the demo PostgreSQL (reached by its compose service name) unless it exists. */
async function ensureDemoSource(page: Page) {
  const sources = (await (await page.request.get("/api/sources")).json()) as {
    host: string;
    database: string;
  }[];
  if (sources.some((s) => s.host === "demo-postgres" && s.database === "shop")) return;
  const created = await page.request.post("/api/sources", {
    data: {
      name: "Demo shop (PostgreSQL)",
      engine: "postgres",
      host: "demo-postgres",
      port: 5432,
      database: "shop",
      username: "querypulse_monitor",
      password: "monitor",
      tls_mode: "disable",
    },
  });
  expect(created.status()).toBe(201);
}

/** Wait until P1 is in the explorer (reloading as the collector catches up). */
async function waitForP1(page: Page) {
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("link", { name: P1 }).first()).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: COLLECTION_WAIT_MS, intervals: [5_000] });
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await ensureDemoSource(page);
});

test("a copied explorer URL reopens the same filters and time range (QP-AC-16)", async ({
  page,
  browser,
}) => {
  test.setTimeout(COLLECTION_WAIT_MS + 60_000);
  await waitForP1(page);

  await page.getByLabel("Time range").selectOption("15m");
  await page.getByLabel("Rank by").selectOption("calls");
  await page.getByLabel("Statement or shape contains").fill("orders");
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("button", { name: "Lock range" }).click();
  await expect(page).toHaveURL(/from=/);

  const url = page.url();
  const range = await page.getByLabel("Time range").locator("option:checked").textContent();
  // The list keeps showing the previous results while the filtered ones load: wait for them.
  const links = page.getByRole("table").getByRole("link");
  let statements: string[] = [];
  await expect(async () => {
    statements = await links.allTextContents();
    expect(statements.length).toBeGreaterThan(0);
    expect(statements.every((s) => s.toLowerCase().includes("orders"))).toBe(true);
  }).toPass({ timeout: 15_000 });

  // Open the copied link in a fresh browser context (a different person, signed in).
  const context = await browser.newContext();
  const other = await context.newPage();
  await signIn(other);
  await other.goto(url);
  await expect(other.getByLabel("Rank by")).toHaveValue("calls");
  await expect(other.getByLabel("Statement or shape contains")).toHaveValue("orders");
  await expect(other.getByLabel("Time range")).toHaveValue("custom");
  await expect(other.getByLabel("Time range").locator("option:checked")).toHaveText(range ?? "");
  // A locked range is fixed in time, so the same link shows the same operations.
  await expect(other.getByRole("table").getByRole("link")).toHaveText(statements);
  await context.close();
});

test("journey: home → P1 → plan viewer shows the sequential scan (QP-AC-17)", async ({ page }) => {
  test.setTimeout(COLLECTION_WAIT_MS + 60_000);
  await waitForP1(page);

  // P1 is the most expensive operation of its source by total time (the default ranking).
  // Filtered to that source: with MongoDB also collected, another engine can top the list.
  const sources = (await (await page.request.get("/api/sources")).json()) as {
    id: number;
    host: string;
  }[];
  const pg = sources.find((s) => s.host === "demo-postgres");
  await page.goto(`/?source=${pg?.id}`);
  const first = page.getByRole("table").getByRole("row").nth(1);
  await expect(first.getByRole("link")).toHaveText(P1);
  await first.getByRole("link").click();

  await expect(page.getByRole("heading", { name: "Operation" })).toBeVisible();
  await expect(page.locator("pre").first()).toHaveText(P1);

  const tree = page.getByRole("list", { name: "Plan nodes" });
  const capture = page.getByRole("button", { name: "Capture plan now" });
  // Wait for the plan to load (either the tree or "not captured yet") before deciding.
  await expect(tree.or(capture)).toBeVisible();
  if (await capture.isVisible()) {
    // The collector plans new operations within a cycle; capture now if it hasn't yet.
    await capture.click();
  }
  const scan = tree.locator('[data-node-type="Seq Scan"]');
  await expect(scan).toBeVisible();
  await expect(scan).toContainText("orders");
  await expect(scan).toContainText("Reads the whole table");
  await expect(scan).toContainText("customer_id = $1");
});
