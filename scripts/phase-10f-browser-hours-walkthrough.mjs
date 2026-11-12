/**
 * Phase 10F — Authenticated browser walkthrough for operating-hours admin.
 * Uses Clerk TEST storage state against localhost synthetic tenant only.
 * Does not touch Generations Production hours or create Production inquiries.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const STORAGE = path.join("playwright", ".auth", "staff.json");
const META = path.join("playwright", ".auth", "staff.meta.json");
const OUT = path.join("playwright", ".fixtures", "phase-10f-hours-walkthrough.json");

function fail(message, extra = {}) {
  console.error(JSON.stringify({ ok: false, message, ...extra }, null, 2));
  process.exit(1);
}

if (!fs.existsSync(STORAGE)) {
  fail("Missing playwright/.auth/staff.json — run headed Clerk TEST bootstrap first.");
}

const meta = JSON.parse(fs.readFileSync(META, "utf8"));
if (meta.clerkPublishableKeyKind !== "test") {
  fail("Refused: staff auth is not Clerk TEST.");
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: STORAGE });
const page = await context.newPage();
const steps = [];

async function step(name, fn) {
  try {
    await fn();
    steps.push({ name, ok: true });
  } catch (error) {
    steps.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

try {
  await step("open_operating_hours_admin", async () => {
    const response = await page.goto(`${BASE}/app/admin/operating-hours`, {
      waitUntil: "networkidle",
    });
    if (!response || response.status() >= 400) {
      throw new Error(`Unexpected status ${response?.status()}`);
    }
    if (page.url().includes("sign-in")) {
      throw new Error("Redirected to sign-in — staff session expired; re-run test:e2e:staff:auth");
    }
    await page.getByRole("heading", { name: "Operating hours" }).waitFor({ timeout: 15000 });
  });

  await step("open_main_location", async () => {
    const link = page.getByRole("link").filter({ hasText: /Main Location|main/i }).first();
    await link.click();
    await page.waitForURL(/\/app\/admin\/operating-hours\/[^/]+/);
    await page.getByText("Weekly schedule").waitFor({ timeout: 15000 });
  });

  const locationUrl = page.url();
  const locationId = locationUrl.split("/").pop();

  await step("save_draft_weekly_hours", async () => {
    // Ensure Monday has a window by clicking Add window if needed, then save draft.
    const monday = page.locator("li").filter({ hasText: "Monday" }).first();
    const add = monday.getByRole("button", { name: "Add window" });
    await add.click();
    await page.getByRole("button", { name: "Save as draft" }).click();
    await page.getByText(/Draft hours saved|Weekly schedule saved|saved/i).first().waitFor({
      timeout: 20000,
    }).catch(() => {});
    // Toast may vanish; accept DRAFT badge as success signal after reload.
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("DRAFT").first().waitFor({ timeout: 15000 });
  });

  await step("add_holiday_exception", async () => {
    await page.locator('input[name="localDate"]').fill("2026-12-25");
    await page.locator('select[name="kind"]').selectOption("CLOSED");
    await page.getByRole("button", { name: "Save exception" }).click();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("2026-12-25").first().waitFor({ timeout: 15000 });
  });

  await step("verify_policy", async () => {
    await page.locator('textarea[name="approvedByNote"]').fill(
      "Phase 10F synthetic browser verification — NOT Generations Production hours.",
    );
    await page.getByRole("button", { name: "Mark verified" }).click();
    // Confirm dialog
    const confirm = page.getByRole("button", { name: "Verify hours" });
    if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirm.click();
    }
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("VERIFIED").first().waitFor({ timeout: 15000 });
  });

  await step("edit_returns_to_draft", async () => {
    const tuesday = page.locator("li").filter({ hasText: "Tuesday" }).first();
    await tuesday.getByRole("button", { name: "Add window" }).click();
    await page.getByRole("button", { name: "Save as draft" }).click();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("DRAFT").first().waitFor({ timeout: 15000 });
  });

  const result = {
    ok: true,
    baseUrl: BASE,
    organizationSlug: meta.expectedOrganizationSlug,
    locationId,
    locationUrl,
    steps,
    note: "Synthetic tenant only. Generations Production hours were not modified.",
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const result = {
    ok: false,
    baseUrl: BASE,
    organizationSlug: meta.expectedOrganizationSlug,
    steps,
    error: error instanceof Error ? error.message : String(error),
    finalUrl: page.url(),
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
