/**
 * Phase 12H — Authenticated Administrator dollar quote save/reload acceptance.
 * Synthetic org only: magiccrm-test-center-b. Never Generations.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { config } from "dotenv";
import { createPrismaClient } from "@/lib/db/create-client";

config();
config({ path: ".env.local", override: true });

const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE ?? "playwright/.auth/staff.json";
const FIXTURE = "playwright/.fixtures/phase-10g-wp-inquiry.json";
const OUT = "playwright/.fixtures/phase-12h-quote-acceptance.json";
const EVENT_SALES_STORAGE =
  process.env.PLAYWRIGHT_EVENT_SALES_STORAGE_STATE ?? "playwright/.auth/event-sales.json";

if (!fs.existsSync(STORAGE)) {
  console.error(JSON.stringify({ ok: false, error: "Missing staff storage state." }));
  process.exit(1);
}
if (!fs.existsSync(FIXTURE)) {
  console.error(JSON.stringify({ ok: false, error: "Missing synthetic WP fixture." }));
  process.exit(1);
}

const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
if (fixture.organizationSlug !== "magiccrm-test-center-b") {
  console.error(JSON.stringify({ ok: false, error: "Fixture org is not synthetic — refusing." }));
  process.exit(1);
}

type StepResult = { name: string; result: string; detail: unknown };
const steps: StepResult[] = [];
function record(name: string, result: string, detail: unknown = null) {
  steps.push({ name, result, detail });
  console.log(JSON.stringify({ name, result, detail }));
}

async function switchToTestCenterB(page: Page) {
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const chip = page.locator("[data-employee-context]").first();
  if ((await chip.count()) > 0) {
    const text = (await chip.innerText()).replace(/\s+/g, " ");
    if (/magiccrm test center b|test center b/i.test(text)) {
      return text.trim();
    }
  }
  const orgBtn = page.getByRole("button", { name: /organization|Open organization/i }).first();
  if (await orgBtn.count()) {
    await orgBtn.click();
    const target = page.getByRole("button", { name: /MagicCRM Test Center B/i });
    await target.first().click({ timeout: 15000 });
    await page.waitForTimeout(2000);
  }
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const after = ((await page.locator("[data-employee-context]").first().innerText()) || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!/test center b/i.test(after)) {
    throw new Error(`Could not activate magiccrm-test-center-b. Context: ${after}`);
  }
  return after;
}

async function openStaffQuoteEditor(page: Page) {
  await page.goto(`${BASE}${fixture.inquiryPath}`, { waitUntil: "networkidle" });
  const staffTab = page.getByRole("tab", { name: /Staff quote/i });
  if (await staffTab.count()) {
    await staffTab.click();
    await page.waitForTimeout(400);
  }
  await page.locator("[data-wp-staff-quote-draft], button:has-text('Create staff quote draft')").first().waitFor({
    timeout: 20000,
  });
}

async function ensureDraft(page: Page) {
  await openStaffQuoteEditor(page);
  const draft = page.locator("[data-wp-staff-quote-draft]");
  if (await draft.locator("input[name^='lineUnitPriceDollars_']").count()) {
    return "existing";
  }
  const create = page.getByRole("button", {
    name: /Create staff quote draft|Refresh draft from private calculation/i,
  });
  await create.first().click({ timeout: 15000 });
  await page.locator("input[name^='lineUnitPriceDollars_']").first().waitFor({ timeout: 30000 });
  return "created";
}

async function readStoredUnitCents(inquiryId: string, lineIndex = 0) {
  const db = createPrismaClient(process.env.DATABASE_URL!);
  try {
    const draft = await db.eventPlanRecommendation.findFirst({
      where: {
        inquiryId,
        organizationId: fixture.organizationId,
        kind: "AGENT_WORKING",
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!draft) return null;
    const payload =
      draft.payload && typeof draft.payload === "object"
        ? (draft.payload as {
            lineItems?: Array<{ unitPriceCents?: number; quantity?: number }>;
            editHistory?: unknown[];
            taxCents?: number | null;
          })
        : {};
    const lines = Array.isArray(payload.lineItems) ? payload.lineItems : [];
    const line = lines[lineIndex];
    const history = Array.isArray(payload.editHistory) ? payload.editHistory : [];
    return {
      planId: draft.id,
      estimatedTotalCents: draft.estimatedTotalCents,
      unitPriceCents: line?.unitPriceCents ?? null,
      quantity: line?.quantity ?? null,
      lineCount: lines.length,
      taxCents: payload.taxCents ?? null,
      editHistoryLength: history.length,
      title: draft.title,
    };
  } finally {
    await db.$disconnect();
  }
}

async function main() {
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  const org = await switchToTestCenterB(page);
  record("org_context", "PASS", org);

  const draftMode = await ensureDraft(page);
  record("ensure_draft", "PASS", draftMode);

  const unit = page.locator("input[name='lineUnitPriceDollars_0']");
  await unit.waitFor({ timeout: 15000 });
  const displayed = await unit.inputValue();
  const editable = (await unit.getAttribute("readonly")) === null && !(await unit.isDisabled());
  record("admin_unit_editable", editable ? "PASS" : "FAIL", { displayed, editable });
  if (!editable) throw new Error("Administrator cannot edit unit price dollars.");

  // Baseline from private calc may not be 49.99 — document actual, then force known cents via $55.00.
  record("initial_display", "PASS", { displayed });

  async function saveDollars(value: string, reason: string) {
    await unit.fill(value);
    await page.locator("input[name='editReason']").fill(reason);
    await page.getByRole("button", { name: /Save staff edits/i }).click({ timeout: 15000 });
    await page.waitForTimeout(2500);
  }

  await saveDollars("49.99", "Phase 12H set baseline display $49.99 → 4999¢");
  await openStaffQuoteEditor(page);
  await unit.waitFor({ timeout: 15000 });
  const after4999Display = await unit.inputValue();
  const stored4999 = await readStoredUnitCents(fixture.inquiryId, 0);
  const pass4999 = after4999Display === "49.99" && stored4999?.unitPriceCents === 4999;
  record("display_and_store_4999", pass4999 ? "PASS" : "FAIL", {
    after4999Display,
    stored4999,
  });
  if (!pass4999) throw new Error("4999¢ / $49.99 round-trip failed.");

  await saveDollars("55.00", "Phase 12H admin save $55.00 → 5500¢");
  await openStaffQuoteEditor(page);
  await unit.waitFor({ timeout: 15000 });
  const after5500Display = await unit.inputValue();
  const stored5500 = await readStoredUnitCents(fixture.inquiryId, 0);
  const pass5500 = after5500Display === "55.00" && stored5500?.unitPriceCents === 5500;
  record("save_reload_5500", pass5500 ? "PASS" : "FAIL", {
    after5500Display,
    stored5500,
  });
  if (!pass5500) throw new Error("5500¢ / $55.00 save+reload failed.");

  // Boundary values that should accept
  const boundaries: Array<[string, number]> = [
    ["0.01", 1],
    ["0.10", 10],
    ["1.00", 100],
    ["550.00", 55000],
  ];
  for (const [dollars, cents] of boundaries) {
    await saveDollars(dollars, `Phase 12H boundary ${dollars}`);
    await openStaffQuoteEditor(page);
    await unit.waitFor({ timeout: 20000 });
    const d = await unit.inputValue();
    const s = await readStoredUnitCents(fixture.inquiryId, 0);
    const ok = d === dollars && s?.unitPriceCents === cents;
    record(`boundary_${dollars}`, ok ? "PASS" : "FAIL", { display: d, stored: s });
    if (!ok) throw new Error(`Boundary ${dollars} failed`);
  }

  // Invalid inputs — expect validation / no corrupt store
  const beforeInvalid = await readStoredUnitCents(fixture.inquiryId, 0);
  for (const bad of ["abc", "-5", "12.345", ""]) {
    await unit.fill(bad);
    await page.locator("input[name='editReason']").fill(`Phase 12H reject ${bad || "(blank)"}`);
    await page.getByRole("button", { name: /Save staff edits/i }).click({ timeout: 15000 });
    await page.waitForTimeout(1500);
  }
  await openStaffQuoteEditor(page);
  await unit.waitFor({ timeout: 20000 });
  const afterInvalid = await readStoredUnitCents(fixture.inquiryId, 0);
  const invalidOk = afterInvalid?.unitPriceCents === beforeInvalid?.unitPriceCents;
  record("reject_invalid_preserves_cents", invalidOk ? "PASS" : "FAIL", {
    beforeInvalid,
    afterInvalid,
  });
  if (!invalidOk) throw new Error("Invalid inputs corrupted stored cents.");

  // Event Sales permission check
  if (fs.existsSync(EVENT_SALES_STORAGE)) {
    const salesCtx = await browser.newContext({
      storageState: EVENT_SALES_STORAGE,
      viewport: { width: 1440, height: 900 },
    });
    const salesPage = await salesCtx.newPage();
    try {
      await salesPage.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
      await salesPage.waitForTimeout(1000);
      // If redirected to sign-in, session expired
      if (salesPage.url().includes("sign-in")) {
        record("event_sales_session", "BLOCKED", "event-sales.json redirects to sign-in (expired)");
      } else {
        await switchToTestCenterB(salesPage).catch((e) => {
          throw new Error(`Event Sales org switch failed: ${e.message}`);
        });
        await salesPage.goto(`${BASE}${fixture.inquiryPath}`, { waitUntil: "networkidle" });
        await salesPage.getByRole("tab", { name: /Staff quote/i }).click().catch(() => undefined);
        await salesPage.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 20000 });
        const salesUnit = salesPage.locator("input[name='lineUnitPriceDollars_0']");
        await salesUnit.waitFor({ timeout: 15000 });
        const salesReadonly =
          (await salesUnit.getAttribute("readonly")) !== null || (await salesUnit.isDisabled());
        record("event_sales_unit_locked", salesReadonly ? "PASS" : "FAIL", {
          readonly: await salesUnit.getAttribute("readonly"),
          disabled: await salesUnit.isDisabled(),
        });
        const deliveryBlocked =
          (await salesPage.getByText(/delivery unavailable|delivery gated|cannot send/i).count()) > 0;
        record("event_sales_delivery_blocked_copy", deliveryBlocked ? "PASS" : "FAIL", {
          deliveryBlocked,
        });
      }
    } catch (error) {
      record("event_sales_checks", "FAIL", error instanceof Error ? error.message : String(error));
    } finally {
      await salesCtx.close();
    }
  } else {
    record("event_sales_session", "BLOCKED", "Missing event-sales storage state");
  }

  const failed = steps.filter((s) => s.result === "FAIL");
  const blocked = steps.filter((s) => s.result === "BLOCKED");
  const summary = {
    ok: failed.length === 0,
    inquiryId: fixture.inquiryId,
    organizationSlug: fixture.organizationSlug,
    steps,
    failedCount: failed.length,
    blockedCount: blocked.length,
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
} catch (error) {
  record("fatal", "FAIL", error instanceof Error ? error.message : String(error));
  const summary = {
    ok: false,
    inquiryId: fixture.inquiryId,
    steps,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
  console.error(JSON.stringify(summary, null, 2));
  await browser.close().catch(() => undefined);
  process.exit(1);
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
