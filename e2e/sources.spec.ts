import { expect, type Page, test } from "@playwright/test";

/**
 * QP-AC-05: the demo PostgreSQL and MongoDB sources can be added after a successful test
 * connection. Runs against the backend's full Docker stack (`make demo`), where the API reaches
 * the demo databases by their compose service names.
 */

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin-demo-password";
const run = Date.now().toString(36);

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(ADMIN_USERNAME);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Workload", exact: true })).toBeVisible();
}

async function fill(page: Page, fields: Record<string, string>) {
  for (const [label, value] of Object.entries(fields)) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
}

async function deleteSource(page: Page) {
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete source" }).click();
  await expect(page.getByRole("heading", { name: "Data sources" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("add the demo PostgreSQL after a successful test (QP-AC-05)", async ({ page }) => {
  const name = `E2E PostgreSQL ${run}`;
  await page.getByRole("link", { name: "Data sources" }).click();
  await page.getByRole("link", { name: "Add source" }).first().click();

  await fill(page, {
    Name: name,
    Host: "demo-postgres",
    Port: "5432",
    Database: "shop",
    Username: "querypulse_monitor",
    Password: "monitor",
  });
  const save = page.getByRole("button", { name: "Save source" });
  await expect(save).toBeDisabled();

  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText(/Connected to version 16/)).toBeVisible();
  await expect(page.getByText("Every feature is available.", { exact: false })).toBeVisible();

  await save.click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("Healthy")).toBeVisible();
  await expect(page.getByText("Saved (encrypted)")).toBeVisible();

  await page.getByRole("link", { name: "Data sources" }).first().click();
  await expect(page.getByRole("link", { name })).toBeVisible();

  await page.getByRole("link", { name }).click();
  await deleteSource(page);
});

test("add the demo MongoDB and see the profiler fix (QP-AC-05, QP-AC-06)", async ({ page }) => {
  const name = `E2E MongoDB ${run}`;
  await page.goto("/sources/new");
  await page.getByLabel("Engine").selectOption("mongodb");
  // The demo seed profiles `shop` (Phase 6); `inventory` isn't profiled, so it shows the gap.
  await fill(page, { Name: name, Host: "mongo", Database: "inventory" });

  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText(/Connected to version 7/)).toBeVisible();
  await expect(page.getByText("Profiling is off on database 'inventory'.").first()).toBeVisible();
  await expect(page.getByText(/db\.setProfilingLevel\(1/).first()).toBeVisible();

  await page.getByRole("button", { name: "Save source" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("Degraded")).toBeVisible();

  await deleteSource(page);
});

test("a wrong password fails clearly and nothing is saved (QP-AC-07)", async ({ page }) => {
  await page.goto("/sources/new");
  await fill(page, {
    Name: `E2E bad password ${run}`,
    Host: "demo-postgres",
    Database: "shop",
    Username: "querypulse_monitor",
    Password: "definitely-wrong",
  });
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByRole("alert")).toContainText("rejected the username or password");
  await expect(page.getByRole("button", { name: "Save source" })).toBeDisabled();

  await page.goto("/sources");
  await expect(page.getByRole("link", { name: `E2E bad password ${run}` })).toHaveCount(0);
});
