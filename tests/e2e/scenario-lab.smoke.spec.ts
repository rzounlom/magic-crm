import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { resolveStaffAuth, staffAuthSkipReason } from "./helpers/staff-auth";

/**
 * Scenario Lab browser verification (LAB1-BV2).
 *
 * Requires:
 *   SCENARIO_LAB_E2E=1
 *   PLAYWRIGHT_BASE_URL pointing at scenario-lab:dev (default http://localhost:3010)
 *   Authenticated staff storage for an allowlisted admin
 *   Full LAB1-A Scenario Lab env on the running app
 */
const enabled = process.env.SCENARIO_LAB_E2E === "1";
const evidenceDir = path.join("docs", "release", "lab1bv2-evidence");
const auth = resolveStaffAuth();

test.describe("Scenario Lab browser verification", () => {
  test.skip(!enabled, "Set SCENARIO_LAB_E2E=1 with scenario-lab:dev running.");

  test("signed-out /scenario-lab is not accessible", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const response = await page.goto("/scenario-lab");
    expect(response?.status()).toBe(404);
    await context.close();
  });
});

test.describe("Scenario Lab authorized walkthrough", () => {
  test.skip(!enabled, "Set SCENARIO_LAB_E2E=1 with scenario-lab:dev running.");
  test.skip(!auth.ok, staffAuthSkipReason());

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  test("create inquiry scenario run, submit public intake, open staff workspace", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    fs.mkdirSync(evidenceDir, { recursive: true });

    const dashboardResponse = await page.goto("/scenario-lab");
    expect(dashboardResponse?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "MagicCRM Scenario Lab" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("TEST", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Scenario Lab TEST", { exact: true })).toBeVisible();
    await expect(page.getByText("MagicCRM Scenario Lab TEST", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Venue setup required" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create inquiry scenario run" })).toBeVisible();

    await page.screenshot({
      path: path.join(evidenceDir, `dashboard-${testInfo.project.name}.png`),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Create inquiry scenario run" }).click();
    await page.waitForURL(/\/scenario-lab\/runs\/[^/]+$/, { timeout: 45_000 });
    const runUrl = page.url();
    const runId = runUrl.split("/").pop()!;
    expect(runId.length).toBeGreaterThan(8);

    await expect(page.getByRole("heading", { name: /Customer submits an inquiry/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/@example\.com/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Open public inquiry form" })).toBeVisible();

    await page.screenshot({
      path: path.join(evidenceDir, `run-ready-${testInfo.project.name}.png`),
      fullPage: true,
    });

    const intakePromise = page.waitForURL(/\/inquire\/magiccrm-scenario-lab/, { timeout: 45_000 });
    await page.getByRole("button", { name: "Open public inquiry form" }).click();
    await intakePromise;
    expect(page.url()).toContain("lab=");

    await expect(page.locator("[data-lab-prefill-banner]")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Scenario Lab filled synthetic TEST customer details/i)).toBeVisible();

    // Prefill should already select event/guests; advance through steps.
    for (let step = 0; step < 6; step += 1) {
      const build = page.getByRole("button", { name: "Build my event options" });
      if (await build.isVisible().catch(() => false)) {
        break;
      }
      const continueBtn = page.getByRole("button", { name: "Continue" });
      if (await continueBtn.isVisible().catch(() => false)) {
        await continueBtn.click();
        await page.waitForTimeout(400);
      }
    }

    await expect(page.getByRole("button", { name: "Build my event options" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("textbox", { name: "First name" })).not.toHaveValue("");
    await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue(/@example\.com$/);

    await page.screenshot({
      path: path.join(evidenceDir, `public-intake-${testInfo.project.name}.png`),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Build my event options" }).click();
    await expect(page).toHaveURL(/\/(plan|conversation)\//, { timeout: 120_000 });

    await page.screenshot({
      path: path.join(evidenceDir, `after-submit-${testInfo.project.name}.png`),
      fullPage: true,
    });

    await page.goto(`/scenario-lab/runs/${runId}`);
    const linkedInquiry = page.getByRole("region", { name: "Linked inquiry" });
    await expect(linkedInquiry).toBeVisible({ timeout: 30_000 });
    await expect(linkedInquiry.getByText(/Awaiting inquiry submission/i)).toHaveCount(0);
    const staffLink = linkedInquiry.getByRole("link", { name: "Open staff inquiry workspace" });
    await expect(staffLink).toBeVisible({ timeout: 20_000 });
    const staffHref = await staffLink.getAttribute("href");
    expect(staffHref).toMatch(/^\/app\/inquiries\//);

    await page.screenshot({
      path: path.join(evidenceDir, `run-linked-${testInfo.project.name}.png`),
      fullPage: true,
    });

    // Persistence: refresh keeps run + inquiry
    await page.reload();
    await expect(page.getByRole("link", { name: "Open staff inquiry workspace" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { name: "Scenario timeline" })).toBeVisible();

    await page.getByRole("link", { name: "Open staff inquiry workspace" }).click();
    await page.waitForURL(/\/app\/inquiries\/[^/]+$/, { timeout: 45_000 });
    const staffInquiryUrl = page.url();
    expect(staffInquiryUrl).toMatch(/\/app\/inquiries\//);
    await expect(page.getByText(/@example\.com/).first()).toBeVisible({ timeout: 30_000 });

    await page.screenshot({
      path: path.join(evidenceDir, `staff-workspace-${testInfo.project.name}.png`),
      fullPage: true,
    });

    // Dashboard still lists the run after navigation
    await page.goto("/scenario-lab");
    await expect(page.getByRole("link", { name: /Customer submits an inquiry/i }).first()).toBeVisible({
      timeout: 20_000,
    });

    // Public intake path is not an admin surface
    const publicContext = await page.context().browser()!.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const publicPage = await publicContext.newPage();
    const forged = await publicPage.goto(
      "/inquire/magiccrm-scenario-lab?lab=ffffffffffffffffffffffffffffffffffffffffffffffff",
    );
    expect(forged?.status()).toBe(200);
    await expect(publicPage.locator("[data-lab-prefill-banner]")).toHaveCount(0);
    await expect(publicPage.getByRole("heading", { name: "MagicCRM Scenario Lab" })).toHaveCount(0);
    await publicContext.close();

    fs.writeFileSync(
      path.join(evidenceDir, "last-walkthrough.json"),
      JSON.stringify(
        {
          runId,
          runUrl,
          staffInquiryPath: staffHref,
          staffInquiryUrl,
          completedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });
});
