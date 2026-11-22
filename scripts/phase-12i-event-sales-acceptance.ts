/**
 * Phase 12I — Event Sales browser acceptance on synthetic WP inquiry.
 * Requires playwright/.auth/event-sales.json from identity-gated headed bootstrap.
 */
import fs from "node:fs";
import path from "node:path";

import { config } from "dotenv";
import { chromium, type Page } from "@playwright/test";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { isAuthorizationError } from "@/server/errors";
import type { RequestContext } from "@/server/request-context";
import { updateWpStaffQuoteDraft } from "@/server/services/wp-staff-quote-draft-service";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const STORAGE =
  process.env.PLAYWRIGHT_EVENT_SALES_STORAGE_STATE ?? "playwright/.auth/event-sales.json";
const GATE = "playwright/.fixtures/phase-10h-event-sales-identity-gate.json";
const FIXTURE = "playwright/.fixtures/phase-10g-wp-inquiry.json";
const OUT = "playwright/.fixtures/phase-12i-event-sales-acceptance.json";
const SCREENSHOT_DIR = "docs/design/phase-12i-screenshots";

type Step = { name: string; result: string; detail: unknown };
const steps: Step[] = [];

function record(name: string, result: string, detail: unknown = null) {
  steps.push({ name, result, detail });
  console.log(JSON.stringify({ name, result, detail }));
}

function isSyntheticOrgChip(chip: string) {
  const compact = chip.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return compact.includes("magiccrmtestcenterb") || compact.includes("testcenterb");
}

async function switchToTestCenterB(page: Page) {
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  let chip = "";
  try {
    chip = (await page.locator("[data-employee-context]").first().innerText())
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    chip = "";
  }
  if (isSyntheticOrgChip(chip)) return chip;
  const orgBtn = page.getByRole("button", { name: /organization|Open organization/i }).first();
  if (await orgBtn.count()) {
    await orgBtn.click();
    await page.getByRole("button", { name: /MagicCRM Test Center B/i }).first().click({ timeout: 15000 });
    await page.waitForTimeout(2000);
  }
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  chip = ((await page.locator("[data-employee-context]").first().innerText()) || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!isSyntheticOrgChip(chip)) {
    throw new Error(`Could not activate Test Center B. Context: ${chip}`);
  }
  return chip;
}

async function openStaffQuote(page: Page, inquiryPath: string) {
  await page.goto(`${BASE}${inquiryPath}`, { waitUntil: "networkidle" });
  const tab = page.getByRole("tab", { name: /Staff quote/i });
  if (await tab.count()) {
    await tab.click();
    await page.waitForTimeout(400);
  }
  await page.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 20000 });
}

async function readStoredUnitCents(
  organizationId: string,
  inquiryId: string,
  lineIndex = 0,
) {
  const env = parseRuntimeEnv(process.env);
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const draft = await db.eventPlanRecommendation.findFirst({
      where: { organizationId, inquiryId, kind: "AGENT_WORKING" },
      orderBy: { updatedAt: "desc" },
    });
    if (!draft) return null;
    const payload =
      draft.payload && typeof draft.payload === "object"
        ? (draft.payload as {
            lineItems?: Array<{ unitPriceCents?: number; quantity?: number; name?: string }>;
            guestCount?: number;
          })
        : {};
    const lines = Array.isArray(payload.lineItems) ? payload.lineItems : [];
    return {
      planId: draft.id,
      estimatedTotalCents: draft.estimatedTotalCents,
      unitPriceCents: lines[lineIndex]?.unitPriceCents ?? null,
      quantity: lines[lineIndex]?.quantity ?? null,
      guestCount: payload.guestCount ?? draft.guestCount,
      lineCount: lines.length,
    };
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  if (!fs.existsSync(STORAGE)) {
    throw new Error("Missing Event Sales storage state. Run headed bootstrap first.");
  }
  if (!fs.existsSync(FIXTURE) || !fs.existsSync(GATE)) {
    throw new Error("Missing synthetic fixture or identity gate.");
  }
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as {
    organizationId: string;
    organizationSlug: string;
    inquiryId: string;
    inquiryPath: string;
  };
  const gate = JSON.parse(fs.readFileSync(GATE, "utf8")) as {
    eventSales: { clerkUserId: string; email: string };
    rejectAdministrator: { clerkUserId: string; email: string };
  };
  if (fixture.organizationSlug !== "magiccrm-test-center-b") {
    throw new Error("Fixture org is not synthetic.");
  }

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: STORAGE,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    if (page.url().includes("sign-in")) {
      throw new Error("Event Sales session redirected to sign-in.");
    }

    const identity = await page.evaluate(async () => {
      type ClerkLike = {
        user?: {
          id?: string;
          primaryEmailAddress?: { emailAddress?: string };
          emailAddresses?: Array<{ emailAddress?: string }>;
        };
        load?: () => Promise<void>;
      };
      const clerk = (window as unknown as { Clerk?: ClerkLike }).Clerk;
      if (!clerk?.user) await clerk?.load?.();
      const user = clerk?.user;
      return {
        clerkUserId: user?.id ?? null,
        email:
          user?.primaryEmailAddress?.emailAddress ??
          user?.emailAddresses?.[0]?.emailAddress ??
          null,
      };
    });
    if (identity.clerkUserId !== gate.eventSales.clerkUserId) {
      throw new Error(
        `Not Event Sales identity. Got ${String(identity.clerkUserId).slice(0, 10)}… expected Event Sales.`,
      );
    }
    if (identity.clerkUserId === gate.rejectAdministrator.clerkUserId) {
      throw new Error("Administrator session detected — refusing.");
    }
    record("identity_event_sales", "PASS", {
      clerkUserIdPrefix: String(identity.clerkUserId).slice(0, 10),
      emailRedacted: identity.email
        ? `${identity.email.slice(0, 2)}***@${identity.email.split("@")[1]}`
        : null,
    });

    const orgChip = await switchToTestCenterB(page);
    record("org_test_center_b", "PASS", orgChip);

    await openStaffQuote(page, fixture.inquiryPath);
    const body = await page.locator("body").innerText();
    const wordingOk =
      /Event inquiry — staff review required/i.test(body) &&
      !/READY TO BOOK/i.test(body) &&
      /Unit price \(\$\)/i.test(body) &&
      /delivery unavailable|Customer email delivery/i.test(body);
    record("wp_wording_and_dollar_label", wordingOk ? "PASS" : "FAIL", {
      hasStaffReview: /Event inquiry — staff review required/i.test(body),
      hasReadyToBook: /READY TO BOOK/i.test(body),
      hasDollarLabel: /Unit price \(\$\)/i.test(body),
      hasDeliveryUnavailable: /delivery unavailable|Customer email delivery/i.test(body),
    });
    if (!wordingOk) throw new Error("WP wording / dollar label checks failed.");

    const unit = page.locator("input[name='lineUnitPriceDollars_0']");
    await unit.waitFor({ timeout: 15000 });
    const unitDisplay = await unit.inputValue();
    const unitLocked =
      (await unit.getAttribute("readonly")) !== null || (await unit.isDisabled());
    record("unit_price_locked", unitLocked ? "PASS" : "FAIL", {
      unitDisplay,
      readonly: await unit.getAttribute("readonly"),
      disabled: await unit.isDisabled(),
    });
    if (!unitLocked) throw new Error("Event Sales unit price field was editable.");

    const qty = page.locator("input[name='lineQty_0']");
    await qty.waitFor({ timeout: 10000 });
    const qtyEditable = !(await qty.isDisabled()) && (await qty.getAttribute("readonly")) === null;
    record("qty_editable", qtyEditable ? "PASS" : "FAIL", {
      qty: await qty.inputValue(),
      editable: qtyEditable,
    });
    if (!qtyEditable) throw new Error("Expected Event Sales to edit quantity.");

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "event-sales-quote-locked-unit-1440.png"),
      fullPage: true,
    });

    // Authorized qty edit + reload
    const beforeQty = Number(await qty.inputValue());
    const nextQty = beforeQty >= 2 ? beforeQty - 1 : beforeQty + 1;
    const beforeStore = await readStoredUnitCents(fixture.organizationId, fixture.inquiryId, 0);
    await qty.fill(String(nextQty));
    await page.locator("input[name='editReason']").fill("Phase 12I Event Sales authorized qty edit");
    await page.getByRole("button", { name: /Save staff edits/i }).click({ timeout: 15000 });
    await page.waitForTimeout(2500);
    await openStaffQuote(page, fixture.inquiryPath);
    const afterQtyDisplay = await page.locator("input[name='lineQty_0']").inputValue();
    const afterStore = await readStoredUnitCents(fixture.organizationId, fixture.inquiryId, 0);
    const qtyPersisted =
      afterQtyDisplay === String(nextQty) && afterStore?.quantity === nextQty;
    const unitUnchanged =
      afterStore?.unitPriceCents === beforeStore?.unitPriceCents &&
      (await page.locator("input[name='lineUnitPriceDollars_0']").inputValue()) === unitDisplay;
    record("authorized_qty_save_reload", qtyPersisted && unitUnchanged ? "PASS" : "FAIL", {
      beforeQty,
      nextQty,
      afterQtyDisplay,
      beforeStore,
      afterStore,
      unitUnchanged,
    });
    if (!qtyPersisted || !unitUnchanged) {
      throw new Error("Authorized qty edit did not persist cleanly or unit cents changed.");
    }

    // Server-side unauthorized override (harness)
    const env = parseRuntimeEnv(process.env);
    const db = createPrismaClient(env.DATABASE_URL);
    try {
      const profile = await db.userProfile.findFirst({
        where: { clerkUserId: gate.eventSales.clerkUserId, organizationId: fixture.organizationId },
        select: { id: true, clerkUserId: true },
      });
      const org = await db.organization.findFirst({
        where: { id: fixture.organizationId },
        select: { clerkOrganizationId: true },
      });
      if (!profile?.id || !profile.clerkUserId || !org?.clerkOrganizationId) {
        throw new Error("Could not resolve Event Sales RequestContext.");
      }
      const draft = await db.eventPlanRecommendation.findFirst({
        where: {
          organizationId: fixture.organizationId,
          inquiryId: fixture.inquiryId,
          kind: "AGENT_WORKING",
        },
        orderBy: { updatedAt: "desc" },
      });
      if (!draft) throw new Error("Missing working draft.");
      const payload = draft.payload as {
        lineItems?: Array<{
          slug: string;
          name: string;
          quantity: number;
          unitPriceCents: number;
          kind: string;
        }>;
        guestCount?: number;
        eventDate?: string | null;
        startTime?: string | null;
        durationMinutes?: number;
        adjustmentNote?: string | null;
      };
      const lines = payload.lineItems ?? [];
      const mutated = lines.map((line, index) =>
        index === 0 ? { ...line, unitPriceCents: line.unitPriceCents + 999 } : line,
      );
      const ctx: RequestContext = {
        organizationId: fixture.organizationId,
        userId: profile.id,
        clerkUserId: profile.clerkUserId,
        clerkOrganizationId: org.clerkOrganizationId,
      };
      let rejected = false;
      let code: string | null = null;
      try {
        await updateWpStaffQuoteDraft(ctx, db, fixture.inquiryId, {
          guestCount: payload.guestCount ?? 10,
          eventDate: payload.eventDate ?? null,
          startTime: payload.startTime ?? null,
          durationMinutes: payload.durationMinutes ?? 120,
          lineItems: mutated,
          adjustmentNote: payload.adjustmentNote ?? null,
          editReason: "Phase 12I unauthorized override probe",
        });
      } catch (error) {
        rejected = true;
        code = isAuthorizationError(error)
          ? error.code
          : error instanceof Error
            ? error.message
            : "unknown";
      }
      const afterOverride = await readStoredUnitCents(fixture.organizationId, fixture.inquiryId, 0);
      const overrideOk =
        rejected &&
        code === "FORBIDDEN" &&
        afterOverride?.unitPriceCents === afterStore?.unitPriceCents;
      record("unauthorized_override_rejected", overrideOk ? "PASS" : "FAIL", {
        rejected,
        code,
        beforeCents: afterStore?.unitPriceCents,
        afterCents: afterOverride?.unitPriceCents,
      });
      if (!overrideOk) throw new Error("Unauthorized override was not rejected cleanly.");
    } finally {
      await db.$disconnect();
    }

    // Internal approve + delivery blocked
    await openStaffQuote(page, fixture.inquiryPath);
    const approve = page.getByRole("button", {
      name: /Approve quote \(delivery gated\)|Approve and send quote/i,
    });
    if (!(await approve.count())) {
      throw new Error("Approve control missing for Event Sales.");
    }
    const approveLabel = (await approve.first().innerText()).trim();
    if (!/delivery gated/i.test(approveLabel)) {
      throw new Error(`Expected delivery-gated approve label, got: ${approveLabel}`);
    }
    await approve.first().click({ timeout: 15000 });
    await page.waitForTimeout(2500);
    await openStaffQuote(page, fixture.inquiryPath);
    const afterApprove = await page.locator("body").innerText();
    const deliveryStillBlocked =
      /delivery unavailable|delivery gated|delivery remains blocked|Customer email delivery/i.test(
        afterApprove,
      );
    const noSendLanguage =
      !/quote emailed|email sent to customer|customer was notified/i.test(afterApprove);
    record("internal_approve_delivery_blocked", deliveryStillBlocked && noSendLanguage ? "PASS" : "FAIL", {
      approveLabel,
      deliveryStillBlocked,
      noSendLanguage,
    });
    if (!deliveryStillBlocked || !noSendLanguage) {
      throw new Error("Approval appeared to enable customer delivery.");
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "event-sales-after-approve-1440.png"),
      fullPage: true,
    });

    // Tab switch survival
    await page.getByRole("tab", { name: /Overview/i }).click();
    await page.waitForTimeout(400);
    await page.getByRole("tab", { name: /Staff quote/i }).click();
    await page.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 15000 });
    const qtyAfterTab = await page.locator("input[name='lineQty_0']").inputValue();
    record("draft_survives_tab_switch", qtyAfterTab === String(nextQty) ? "PASS" : "FAIL", {
      qtyAfterTab,
      expected: nextQty,
    });

    const failed = steps.filter((s) => s.result === "FAIL");
    const summary = {
      ok: failed.length === 0,
      inquiryId: fixture.inquiryId,
      organizationSlug: fixture.organizationSlug,
      steps,
      failedCount: failed.length,
      createdAt: new Date().toISOString(),
    };
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
