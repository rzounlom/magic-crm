/**
 * Phase 10G — Operating-hours browser walkthrough on synthetic tenant only.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const STORAGE = "playwright/.auth/staff.json";
const OUT = path.join("playwright", ".fixtures", "phase-10g-hours-walkthrough.json");
const GENERATIONS_LOC = "rysftywo62ve9sao10dk71si";
const SYNTHETIC_LOC = "wm0e8lezc95bs0oowjs5rts5";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: STORAGE });
const page = await context.newPage();
const steps = [];

async function step(name, fn) {
  try {
    const detail = await fn();
    steps.push({ name, result: "PASS", detail: detail ?? null });
  } catch (error) {
    steps.push({
      name,
      result: "FAIL",
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

try {
  await step("isolation_active_org_is_synthetic", async () => {
    await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    const chip = (await page.locator("[data-employee-context]").first().innerText()).replace(/\s+/g, " ").trim();
    if (/generations-crm-test/i.test(chip)) {
      throw new Error(`Active org is Generations (${chip}); refusing writes.`);
    }
    if (!/magiccrm-test-center-b/i.test(chip)) {
      throw new Error(`Active org is not synthetic: ${chip}`);
    }
    return chip;
  });

  await step("open_operating_hours_admin", async () => {
    const res = await page.goto(`${BASE}/app/admin/operating-hours`, { waitUntil: "networkidle" });
    if ((res?.status() ?? 500) >= 400) throw new Error(`HTTP ${res?.status()}`);
    await page.getByRole("heading", { name: "Operating hours" }).waitFor({ timeout: 15000 });
    return { status: res.status() };
  });

  await step("open_synthetic_main_location", async () => {
    await page.getByRole("link").filter({ hasText: /Main Location/i }).first().click();
    await page.waitForURL(/\/app\/admin\/operating-hours\/[^/]+/);
    const id = page.url().split("/").pop();
    if (id === GENERATIONS_LOC) throw new Error("Opened Generations location — abort.");
    if (id !== SYNTHETIC_LOC) {
      // Accept any non-Generations location under synthetic org.
      return { locationId: id, note: "location id differs from R5 fixture id" };
    }
    return { locationId: id };
  });

  const locationId = page.url().split("/").pop();

  await step("create_draft_weekly_hours", async () => {
    const monday = page.locator("li").filter({ hasText: /^Monday/ }).first();
    // Clear existing windows by removing if present, then add synthetic window
    while (await monday.getByRole("button", { name: "Remove" }).count()) {
      await monday.getByRole("button", { name: "Remove" }).first().click();
    }
    await monday.getByRole("button", { name: "Add window" }).click();
    const inputs = monday.locator("input");
    await inputs.nth(0).fill("09:00");
    await inputs.nth(1).fill("17:00");
    await page.getByRole("button", { name: "Save as draft" }).click();
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("DRAFT").first().waitFor({ timeout: 15000 });
    return { locationId };
  });

  await step("add_synthetic_holiday_exception", async () => {
    await page.locator('input[name="localDate"]').fill("2026-12-25");
    await page.locator('select[name="kind"]').selectOption("CLOSED");
    await page.locator('input[name="note"]').fill("Phase 10G synthetic holiday — disposable TEST only");
    await page.getByRole("button", { name: "Save exception" }).click();
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("2026-12-25").first().waitFor({ timeout: 15000 });
  });

  await step("verify_policy_with_note", async () => {
    await page.locator('textarea[name="approvedByNote"]').fill(
      "Phase 10G synthetic browser verification — NOT Generations Production hours.",
    );
    await page.getByRole("button", { name: "Mark verified" }).click();
    const confirm = page.getByRole("button", { name: "Verify hours" });
    if (await confirm.isVisible({ timeout: 4000 }).catch(() => false)) {
      await confirm.click();
    }
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("VERIFIED").first().waitFor({ timeout: 15000 });
  });

  await step("edit_verified_returns_draft", async () => {
    const tuesday = page.locator("li").filter({ hasText: /^Tuesday/ }).first();
    await tuesday.getByRole("button", { name: "Add window" }).click();
    await page.getByRole("button", { name: "Save as draft" }).click();
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("DRAFT").first().waitFor({ timeout: 15000 });
  });

  await step("audit_trail_visible", async () => {
    const audit = page.getByText(/Last change:|Audit/i).first();
    await audit.waitFor({ timeout: 10000 });
    const text = await page.locator("text=Audit").locator("..").innerText().catch(async () =>
      page.getByText(/Last change:/i).first().innerText(),
    );
    if (!/hours_policy|draft|demoted|verified|Last change/i.test(text)) {
      throw new Error(`Audit panel missing expected content: ${text.slice(0, 200)}`);
    }
    return { auditSnippet: text.replace(/\s+/g, " ").trim().slice(0, 240) };
  });

  await step("cross_tenant_generations_location_rejected", async () => {
    const res = await page.goto(`${BASE}/app/admin/operating-hours/${GENERATIONS_LOC}`, {
      waitUntil: "networkidle",
    });
    const status = res?.status() ?? null;
    const notFound = status === 404 || (await page.getByText(/could not be found|Not Found|not found/i).count()) > 0;
    const denied = await page.getByText(/do not have permission|Unable to|Operating hours/i).count();
    // Must not show Generations editable weekly schedule successfully under synthetic session.
    const hasVerify = await page.getByRole("button", { name: "Mark verified" }).isVisible().catch(() => false);
    if (hasVerify && status === 200 && !notFound) {
      throw new Error("Generations location hours editor unexpectedly available cross-tenant.");
    }
    return { status, notFound, denied: denied > 0, hasVerify };
  });

  const result = {
    ok: true,
    baseUrl: BASE,
    locationId,
    steps,
    note: "Synthetic tenant writes only. Generations Production hours untouched.",
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const result = {
    ok: false,
    baseUrl: BASE,
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
