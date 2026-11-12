/**
 * Phase 10G — Staff quote browser walkthrough on synthetic WP inquiry.
 * Uses Administrator Clerk TEST session. Event Sales-only steps marked BLOCKED if no sales session.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const STORAGE = "playwright/.auth/staff.json";
const FIXTURE = path.join("playwright", ".fixtures", "phase-10g-wp-inquiry.json");
const OUT = path.join("playwright", ".fixtures", "phase-10g-quote-walkthrough.json");
const EVENT_SALES_STORAGE = process.env.PLAYWRIGHT_EVENT_SALES_STORAGE_STATE ?? "";

if (!fs.existsSync(FIXTURE)) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "Missing WP inquiry fixture. Run phase-10g-create-synthetic-wp-inquiry.ts first.",
    }),
  );
  process.exit(1);
}
const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
if (fixture.organizationSlug !== "magiccrm-test-center-b") {
  console.error(JSON.stringify({ ok: false, error: "Fixture org is not synthetic — refusing." }));
  process.exit(1);
}

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

function blocked(name, reason) {
  steps.push({ name, result: "BLOCKED", detail: reason });
}

try {
  await step("isolation_org", async () => {
    await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    const chip = (await page.locator("[data-employee-context]").first().innerText())
      .replace(/\s+/g, " ")
      .trim();
    if (/generations-crm-test/i.test(chip) || !/magiccrm-test-center-b/i.test(chip)) {
      throw new Error(`Wrong org for quote writes: ${chip}`);
    }
    return chip;
  });

  await step("open_inquiry", async () => {
    const res = await page.goto(`${BASE}${fixture.inquiryPath}`, { waitUntil: "networkidle" });
    if ((res?.status() ?? 500) >= 400) throw new Error(`HTTP ${res?.status()}`);
    await page
      .getByText(/Phase10G|Synthetic|WordPress|private calculation|staff quote/i)
      .first()
      .waitFor({ timeout: 20000 });
    return { status: res.status(), path: fixture.inquiryPath };
  });

  await step("review_private_calculation", async () => {
    const pricingSource = await page
      .locator("[data-wp-intake-pricing-source], [data-wp-quote-delivery-policy]")
      .first()
      .getAttribute("data-wp-intake-pricing-source")
      .catch(() => null);
    const visible =
      (await page.getByText(/private calculation|approved_plugin_baseline|pricing source|WordPress/i).count()) >
      0;
    if (!visible) throw new Error("Private WP calculation panel not visible.");
    const body = await page.locator("body").innerText();
    const hasBaseline = /approved_plugin_baseline/i.test(body);
    if (!hasBaseline) {
      throw new Error("Expected approved_plugin_baseline on synthetic inquiry private calculation.");
    }
    return { visible, hasBaseline, pricingSource };
  });

  await step("create_staff_quote_draft", async () => {
    const create = page.getByRole("button", {
      name: /Create staff quote draft|Refresh draft from private calculation/i,
    });
    await create.first().click({ timeout: 15000 });
    await page.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    const policy = await page
      .locator("[data-wp-quote-delivery-policy]")
      .getAttribute("data-wp-quote-delivery-policy");
    if (policy === "plugin_defaults_blocked") {
      throw new Error("Draft still on plugin_defaults_blocked — baseline registry not active.");
    }
    return { policy };
  });

  await step("edit_quantities", async () => {
    const qty = page.locator("[data-wp-staff-quote-draft] input[name='lineQty_0']");
    await qty.waitFor({ timeout: 10000 });
    const before = await qty.inputValue();
    await qty.fill(String(Number(before || "1") + 1));
    await page.locator("[data-wp-staff-quote-draft] input[name='editReason']").fill(
      "Phase 10G synthetic qty edit — not Generations.",
    );
    await page.getByRole("button", { name: /Save staff edits/i }).click({ timeout: 10000 });
    await page.waitForTimeout(2000);
    return { before, after: String(Number(before || "1") + 1) };
  });

  if (EVENT_SALES_STORAGE && fs.existsSync(EVENT_SALES_STORAGE)) {
    await step("event_sales_cannot_override_unit_prices", async () => {
      const salesCtx = await browser.newContext({ storageState: EVENT_SALES_STORAGE });
      const salesPage = await salesCtx.newPage();
      try {
        await salesPage.goto(`${BASE}${fixture.inquiryPath}`, { waitUntil: "networkidle" });
        await salesPage.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 20000 });
        const unit = salesPage.locator("input[name='lineUnitCents_0']");
        const readonly = await unit.getAttribute("readonly");
        if (readonly === null) {
          throw new Error("Event Sales unit price field was editable — expected readonly.");
        }
        return { readonly: true };
      } finally {
        await salesCtx.close();
      }
    });
  } else {
    blocked(
      "event_sales_cannot_override_unit_prices",
      "No Event Sales-only Clerk TEST storage state (set PLAYWRIGHT_EVENT_SALES_STORAGE_STATE). Administrator session cannot prove Event Sales restriction.",
    );
  }

  await step("administrator_can_override_unit_prices", async () => {
    // Reload inquiry so admin session reflects synced price_override permission.
    await page.goto(`${BASE}${fixture.inquiryPath}`, { waitUntil: "networkidle" });
    await page.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 20000 });
    const unit = page.locator("[data-wp-staff-quote-draft] input[name='lineUnitCents_0']");
    await unit.waitFor({ timeout: 10000 });
    const readonly = await unit.getAttribute("readonly");
    if (readonly !== null) {
      throw new Error("Administrator unit price field is readonly — expected editable with price_override.");
    }
    const before = await unit.inputValue();
    const next = String(Number(before || "1500") + 50);
    await unit.fill(next);
    await page.locator("[data-wp-staff-quote-draft] input[name='editReason']").fill(
      "Phase 10G synthetic admin unit override — not Generations.",
    );
    await page.getByRole("button", { name: /Save staff edits/i }).click({ timeout: 10000 });
    await page.waitForTimeout(2000);
    await page.goto(`${BASE}${fixture.inquiryPath}`, { waitUntil: "networkidle" });
    await page.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 20000 });
    const after = await page.locator("input[name='lineUnitCents_0']").inputValue();
    if (after !== next) {
      throw new Error(`Unit price did not persist. before=${before} expected=${next} after=${after}`);
    }
    return { before, after };
  });

  if (EVENT_SALES_STORAGE && fs.existsSync(EVENT_SALES_STORAGE)) {
    await step("approve_as_event_sales", async () => {
      const salesCtx = await browser.newContext({ storageState: EVENT_SALES_STORAGE });
      const salesPage = await salesCtx.newPage();
      try {
        await salesPage.goto(`${BASE}${fixture.inquiryPath}`, { waitUntil: "networkidle" });
        await salesPage
          .getByRole("button", { name: /Approve quote \(delivery gated\)/i })
          .click({ timeout: 15000 });
        await salesPage.waitForTimeout(2000);
        const gated =
          (await salesPage.getByText(/delivery gated|delivery remains blocked|customer delivery/i).count()) >
          0;
        if (!gated) throw new Error("Expected delivery-gated messaging after Event Sales approve.");
        return { gated: true };
      } finally {
        await salesCtx.close();
      }
    });
  } else {
    blocked(
      "approve_as_event_sales",
      "No Event Sales-only Clerk TEST storage state; approving with Administrator session instead.",
    );
  }

  await step("approve_internally_delivery_blocked", async () => {
    await page.goto(`${BASE}${fixture.inquiryPath}`, { waitUntil: "networkidle" });
    await page.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 20000 });
    const policy = await page
      .locator("[data-wp-quote-delivery-policy]")
      .getAttribute("data-wp-quote-delivery-policy");
    const approve = page.getByRole("button", {
      name: /Approve quote \(delivery gated\)|Approve and send quote/i,
    });
    if (!(await approve.count())) {
      throw new Error(`Approve control missing (policy=${policy}).`);
    }
    const label = (await approve.first().innerText()).trim();
    if (!/delivery gated/i.test(label)) {
      throw new Error(`Expected delivery-gated approve label, got: ${label}`);
    }
    await approve.first().click({ timeout: 15000 });
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}${fixture.inquiryPath}`, { waitUntil: "networkidle" });
    const body = await page.locator("body").innerText();
    const deliveryStillGated =
      /delivery gated|delivery remains blocked|customer delivery stays disabled|deliveryBlocked/i.test(
        body,
      ) ||
      (await page.locator('[data-wp-quote-delivery-policy="approved_plugin_baseline_pending_operational_verification"]').count()) >
        0;
    const approved =
      /approval recorded|employeeApproval|Approved|deliveryCompleted/i.test(body) ||
      (await page.getByText(/delivery gated|Approval/i).count()) > 0;
    if (!deliveryStillGated) {
      throw new Error("Customer delivery does not appear gated after internal approve.");
    }
    return { policy, label, approved: Boolean(approved), deliveryStillGated: true };
  });

  await step("review_availability_inventory_ui", async () => {
    await page.goto(`${BASE}${fixture.inquiryPath}`, { waitUntil: "networkidle" });
    await page.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 20000 });
    const check = page.getByRole("button", { name: /Check availability/i });
    if (await check.count()) {
      await check.first().click();
      await page.waitForTimeout(2000);
    }
    const inventorySignals =
      (await page.getByText(/availability|inventory|resource|room|attraction|conflict/i).count()) > 0;
    return { inventorySignals };
  });

  await step("customer_quote_delivery_remains_blocked", async () => {
    const policy = await page
      .locator("[data-wp-quote-delivery-policy]")
      .getAttribute("data-wp-quote-delivery-policy");
    if (policy === "tenant_live_verified") {
      throw new Error("Customer delivery policy unexpectedly allows send (tenant_live_verified).");
    }
    const sendLive = page.getByRole("button", { name: /^Approve and send quote$/i });
    if (await sendLive.count()) {
      throw new Error("Live 'Approve and send quote' control is visible — delivery should remain gated.");
    }
    return { policy, liveSendVisible: false };
  });

  const result = {
    ok: true,
    fixture,
    steps,
    note: "Synthetic WP inquiry only. No email send. No Generations Production writes.",
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const result = {
    ok: false,
    fixture,
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
