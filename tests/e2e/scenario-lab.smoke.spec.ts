import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Scenario Lab browser verification (LAB1-BV).
 *
 * Skipped unless explicitly enabled with a provisioned Scenario Lab environment.
 * Never weaken LAB1-A guards for screenshots.
 *
 * Required:
 *   SCENARIO_LAB_E2E=1
 *   Full LAB1-A Scenario Lab env (deployment kind, enablement, allowlist, org, DB token)
 *   Authenticated Playwright storage for an allowlisted admin (staff fixture / dedicated lab fixture)
 */
const enabled = process.env.SCENARIO_LAB_E2E === "1";
const evidenceDir = path.join("docs", "release", "lab1bv-evidence");

test.describe("Scenario Lab browser verification", () => {
  test.skip(!enabled, "Set SCENARIO_LAB_E2E=1 after provisioning a dedicated Scenario Lab database and allowlist.");

  test("signed-out /scenario-lab is not accessible", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    const response = await page.goto("/scenario-lab");
    expect(response?.status()).toBe(404);
    await context.close();
  });

  test("authorized admin can open the Scenario Lab dashboard", async ({ page }, testInfo) => {
    const response = await page.goto("/scenario-lab");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "MagicCRM Scenario Lab" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("TEST", { exact: true }).first()).toBeVisible();
    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({
      path: path.join(evidenceDir, `dashboard-${testInfo.project.name}.png`),
      fullPage: true,
    });
  });
});
