import { expect, type Page, test } from "@playwright/test";

/**
 * QP-AC-25 against the backend's full Docker stack (`make demo`): PostgreSQL and MongoDB
 * operations appear in one explorer, and each opens its own plan viewer. Both demo databases
 * are registered as sources if they aren't already (the demo seed turns MongoDB's profiler
 * on), and the test waits for the collector to have observed P1 and M1.
 */

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin-demo-password";
const P1 = "SELECT id, status, total FROM orders WHERE customer_id = $1";
const M1 = '{"find": "orders", "filter": {"customerId": "?"}}';
const COLLECTION_WAIT_MS = 4 * 60_000;

type Listed = { engine: string; host: string; database: string };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(ADMIN_USERNAME);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Workload", exact: true })).toBeVisible();
}

/** Register the demo PostgreSQL and MongoDB (by their compose service names) unless they exist. */
async function ensureDemoSources(page: Page) {
  const sources = (await (await page.request.get("/api/sources")).json()) as Listed[];
  const wanted = [
    {
      name: "Demo shop (PostgreSQL)",
      engine: "postgres",
      host: "demo-postgres",
      port: 5432,
      database: "shop",
      username: "querypulse_monitor",
      password: "monitor",
      tls_mode: "disable",
    },
    {
      name: "Demo shop (MongoDB)",
      engine: "mongodb",
      host: "mongo",
      port: 27017,
      database: "shop",
      username: "",
      password: "",
      tls_mode: "disable",
    },
  ];
  for (const source of wanted) {
    if (sources.some((s) => s.engine === source.engine && s.host === source.host)) continue;
    const created = await page.request.post("/api/sources", { data: source });
    expect(created.status()).toBe(201);
  }
}

test("journey: one explorer for both engines, each opening its own plan viewer (QP-AC-25)", async ({
  page,
}) => {
  test.setTimeout(COLLECTION_WAIT_MS + 90_000);
  await signIn(page);
  await ensureDemoSources(page);

  // Wait until the collector has seen both engines' planted problems.
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("link", { name: P1 }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("link", { name: M1 }).first()).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: COLLECTION_WAIT_MS, intervals: [5_000] });

  // One ranked table, each row labelled with its engine.
  const table = page.getByRole("table");
  const m1Row = table.getByRole("row").filter({ has: page.getByRole("link", { name: M1 }) });
  const p1Row = table.getByRole("row").filter({ has: page.getByRole("link", { name: P1 }) });
  await expect(m1Row.getByText("MongoDB", { exact: true })).toBeVisible();
  await expect(m1Row.getByText("shop.orders")).toBeVisible();
  await expect(p1Row.getByText("PostgreSQL", { exact: true })).toBeVisible();

  // MongoDB: the query shape and its winning plan's stages.
  await m1Row.getByRole("link", { name: M1 }).click();
  await expect(page.getByRole("heading", { name: "Query shape" })).toBeVisible();
  await expect(page.getByText("Examined per returned", { exact: true })).toBeVisible();
  const stages = page.getByRole("list", { name: "Plan stages" });
  await expect(async () => {
    // The collector explains a shape within a cycle of seeing it in the profiler.
    await page.reload();
    await expect(stages).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 90_000, intervals: [5_000] });
  const collscan = stages.locator('[data-stage="COLLSCAN"]');
  await expect(collscan).toContainText("Reads the whole collection");
  await expect(collscan).toContainText('{"customerId": {"$eq": "?"}}');
  await expect(page.getByRole("list", { name: "Plan nodes" })).toHaveCount(0);

  // PostgreSQL: the generic plan's nodes, in its own viewer.
  await page.getByRole("link", { name: "Workload" }).first().click();
  await page.getByRole("table").getByRole("link", { name: P1 }).first().click();
  await expect(page.getByRole("heading", { name: "Operation" })).toBeVisible();
  const tree = page.getByRole("list", { name: "Plan nodes" });
  const capture = page.getByRole("button", { name: "Capture plan now" });
  await expect(tree.or(capture)).toBeVisible();
  if (await capture.isVisible()) await capture.click();
  await expect(tree.locator('[data-node-type="Seq Scan"]')).toBeVisible();
  await expect(page.getByRole("list", { name: "Plan stages" })).toHaveCount(0);
});
