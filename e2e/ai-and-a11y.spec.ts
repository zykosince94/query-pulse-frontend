import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * Phase 7 against the backend's full Docker stack, with AI disabled (its default):
 * - QP-AC-26: the AI features say AI is off, and the server has made no provider request.
 *   (The rest of the suite also runs with AI off, which is the other half of the criterion.)
 * - The accessibility pass: every main screen, in light and dark, has no serious or critical
 *   axe violations.
 */

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin-demo-password";
const COLLECTION_WAIT_MS = 4 * 60_000;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(ADMIN_USERNAME);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Workload", exact: true })).toBeVisible();
}

async function ensureDemoSource(page: Page) {
  const sources = (await (await page.request.get("/api/sources")).json()) as { host: string }[];
  if (sources.some((s) => s.host === "demo-postgres")) return;
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

/** A finding to open the AI panel on (the rules raise P1-P4 within a few minutes). */
async function firstFinding(page: Page): Promise<number> {
  let id = 0;
  await expect(async () => {
    const body = (await (await page.request.get("/api/findings?status=open")).json()) as {
      findings: { id: number }[];
    };
    expect(body.findings.length).toBeGreaterThan(0);
    id = body.findings[0]?.id ?? 0;
  }).toPass({ timeout: COLLECTION_WAIT_MS, intervals: [5_000] });
  return id;
}

test("with AI off, the AI features say so and no provider request is made (QP-AC-26)", async ({
  page,
}) => {
  test.setTimeout(COLLECTION_WAIT_MS + 60_000);
  await signIn(page);
  const settings = (await (await page.request.get("/api/ai/settings")).json()) as {
    enabled: boolean;
  };
  test.skip(settings.enabled, "AI is turned on in this stack; QP-AC-26 needs it off");
  await ensureDemoSource(page);
  await firstFinding(page);

  await page.goto("/settings");
  await expect(page.getByText("Off", { exact: true })).toBeVisible();

  await page.goto("/findings");
  await page.getByRole("button", { name: "AI assistant" }).first().click();
  const panel = page.getByRole("region", { name: "AI assistant answers" }).first();
  await expect(panel.getByText(/AI is off/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Explain this finding" })).toHaveCount(0);
  // What would be sent is still visible, and holds no connection details.
  await panel.getByRole("button", { name: "View what is sent" }).click();
  const bundle = panel.getByRole("region", { name: "Evidence bundle" });
  await expect(bundle).toContainText('"id": "rule"');
  await expect(bundle).not.toContainText("demo-postgres");
  await expect(bundle).not.toContainText("querypulse_monitor");

  const after = (await (await page.request.get("/api/ai/settings")).json()) as {
    provider_calls: number;
  };
  expect(after.provider_calls).toBe(0);
});

for (const scheme of ["light", "dark"] as const) {
  test(`main screens have no serious accessibility violations (${scheme})`, async ({ browser }) => {
    test.setTimeout(COLLECTION_WAIT_MS + 120_000);
    const context = await browser.newContext({ colorScheme: scheme });
    const page = await context.newPage();
    await signIn(page);
    await ensureDemoSource(page);
    const findingId = await firstFinding(page);
    const finding = (await (await page.request.get(`/api/findings/${findingId}`)).json()) as {
      fingerprint_id: number | null;
      source_id: number;
    };
    const screens: [string, string][] = [
      ["/", "Workload"],
      ["/findings", "Findings"],
      ["/sources", "Data sources"],
      [`/sources/${finding.source_id}`, ""],
      ["/settings", "Settings"],
    ];
    if (finding.fingerprint_id) screens.push([`/operations/${finding.fingerprint_id}`, ""]);
    for (const [path, heading] of screens) {
      await page.goto(path);
      if (heading) {
        await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      }
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        serious.map((v) => `${path}: ${v.id} (${v.nodes.length}) ${v.help}`),
        `axe on ${path}`,
      ).toEqual([]);
    }
    await context.close();
  });
}

test("the login page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);
});
