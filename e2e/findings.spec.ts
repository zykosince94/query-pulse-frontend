import { expect, type Page, test } from "@playwright/test";

/**
 * Findings against the backend's full Docker stack with the demo workload running:
 * findings → P1's evidence → the exact cited plan, and a status change. The demo PostgreSQL is
 * registered if needed; findings appear a few cycles after collection starts.
 */

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin-demo-password";
const WAIT_MS = 5 * 60_000;
const P1_TITLE = "Sequential scan on public.orders in a hot query";
const P3_TITLE = "Pattern search scans all of public.products";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(ADMIN_USERNAME);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Workload", exact: true })).toBeVisible();
}

/** The demo source's id, registering it first if needed. */
async function ensureDemoSource(page: Page): Promise<number> {
  const sources = (await (await page.request.get("/api/sources")).json()) as {
    id: number;
    host: string;
    database: string;
  }[];
  const existing = sources.find((s) => s.host === "demo-postgres" && s.database === "shop");
  if (existing) return existing.id;
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
  return ((await created.json()) as { id: number }).id;
}

/** The card for a finding title (the first, if two sources watch the same database). */
function card(page: Page, title: string) {
  return page
    .locator("div.rounded-xl")
    .filter({ has: page.getByRole("heading", { name: title }) })
    .first();
}

async function waitForFinding(page: Page, title: string) {
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("heading", { name: title }).first()).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: WAIT_MS, intervals: [5_000] });
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
  const sourceId = await ensureDemoSource(page);
  await page.getByRole("link", { name: /Findings/ }).click();
  await expect(page.getByRole("heading", { name: "Findings", exact: true })).toBeVisible();
  // Only the demo source: other specs briefly add sources watching the same database.
  await page.getByLabel("Source").selectOption(String(sourceId));
  await expect(page).toHaveURL(new RegExp(`source=${sourceId}`));
});

test("findings → P1 evidence → the cited plan shows the sequential scan", async ({ page }) => {
  test.setTimeout(WAIT_MS + 60_000);
  await waitForFinding(page, P1_TITLE);
  const p1 = card(page, P1_TITLE);
  await expect(p1.getByText("Plan evidence")).toBeVisible();
  await expect(
    p1.getByText("CREATE INDEX CONCURRENTLY ON public.orders (customer_id);"),
  ).toBeVisible();

  await p1
    .getByRole("list", { name: "Evidence" })
    .getByRole("link", { name: /Plan #\d+/ })
    .click();
  await expect(page.getByRole("heading", { name: "Operation" })).toBeVisible();
  await expect(page.getByText(/the one a finding cites/)).toBeVisible();
  const cited = page
    .getByRole("list", { name: "Plan nodes" })
    .locator('[data-node-type="Seq Scan"]');
  await expect(cited).toContainText("Cited by the finding");
  await expect(cited).toContainText("orders");
});

test("the admin dismisses a finding and reopens it", async ({ page }) => {
  test.setTimeout(WAIT_MS + 60_000);
  await waitForFinding(page, P3_TITLE);
  await card(page, P3_TITLE).getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByRole("heading", { name: P3_TITLE })).toHaveCount(0);

  await page.getByRole("tab", { name: /Dismissed/ }).click();
  await expect(page).toHaveURL(/status=dismissed/);
  await card(page, P3_TITLE).getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByRole("heading", { name: P3_TITLE })).toHaveCount(0);

  await page.getByRole("tab", { name: /Open/ }).click();
  await expect(page.getByRole("heading", { name: P3_TITLE }).first()).toBeVisible();
});
