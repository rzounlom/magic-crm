/**
 * Phase 10M — Visual acceptance + light workflow regression (synthetic only).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const OUT_DIR = path.join("playwright", ".fixtures", "phase-10m-acceptance");
const AUTH = path.join("playwright", ".auth", "staff.json");
const FIXTURE = path.join("playwright", ".fixtures", "phase-10g-wp-inquiry.json");
const PUBLIC_SLUG = "magiccrm-test-center-b";

mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: "375", width: 375, height: 812, mobile: true },
  { name: "430", width: 430, height: 932, mobile: true },
  { name: "768", width: 768, height: 1024, mobile: false },
  { name: "1440", width: 1440, height: 900, mobile: false },
  { name: "1920", width: 1920, height: 1080, mobile: false },
];

async function ensureSyntheticOrg(page) {
  const switcher = page.getByRole("button", { name: /organization switcher|Open organization/i });
  if (await switcher.isVisible().catch(() => false)) {
    await switcher.click();
    const target = page.getByText(/MagicCRM Test Center B/i).first();
    if (await target.isVisible().catch(() => false)) {
      await target.click();
      await page.waitForTimeout(1200);
    }
  }
}

async function measurePublic(page) {
  return page.evaluate(() => {
    const form = document.querySelector("form");
    const main = document.querySelector("[data-public-shell] main") || document.body;
    const formRect = form?.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const centered =
      formRect != null
        ? Math.abs(formRect.left + formRect.width / 2 - mainRect.left - mainRect.width / 2) < 24
        : false;
    return {
      formWidth: formRect ? Math.round(formRect.width) : null,
      centered,
      overflowX,
      hasSubmit: Boolean(
        Array.from(document.querySelectorAll("form button")).some((btn) =>
          /submit/i.test(btn.textContent || ""),
        ),
      ),
      sectionCount: document.querySelectorAll("form section").length,
      choiceCards: document.querySelectorAll('form label input[type="radio"]').length,
    };
  });
}

async function main() {
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
  if (fixture.organizationSlug !== PUBLIC_SLUG) {
    throw new Error("Refused: fixture is not synthetic.");
  }

  const browser = await chromium.launch({ headless: true });
  const visual = [];
  const regressions = [];

  // --- Public visual acceptance ---
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/inquire/${PUBLIC_SLUG}`, { waitUntil: "networkidle" });
    await page.waitForSelector("form", { timeout: 20000 });
    const metrics = await measurePublic(page);
    const file = path.join(OUT_DIR, `public-${vp.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    visual.push({
      surface: "public",
      viewport: vp.name,
      file,
      metrics,
      pass:
        metrics.centered &&
        !metrics.overflowX &&
        metrics.sectionCount >= 5 &&
        metrics.choiceCards > 0 &&
        (vp.width < 768 ? metrics.formWidth <= vp.width : metrics.formWidth != null && metrics.formWidth <= 900),
    });
    await context.close();
  }

  // --- Public validation + conditional + submit (synthetic) ---
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/inquire/${PUBLIC_SLUG}`, { waitUntil: "networkidle" });
    await page.waitForSelector("form");

    // Submit empty → validation
    await page.getByRole("button", { name: /Submit event request/i }).click();
    await page.waitForTimeout(500);
    const stillOnForm = page.url().includes(`/inquire/${PUBLIC_SLUG}`) && !page.url().includes("/thanks");
    regressions.push({ id: "public-empty-validation", pass: stillOnForm });

    // Conditional budget field
    await page.locator('input[name="hasBudget"][value="yes"]').check({ force: true });
    await page.waitForTimeout(200);
    const budgetVisible = await page.locator('input[name="budget"]').isVisible();
    await page.locator('input[name="hasBudget"][value="no"]').check({ force: true });
    await page.waitForTimeout(200);
    const budgetHidden = !(await page.locator('input[name="budget"]').isVisible().catch(() => false));
    regressions.push({ id: "public-conditional-budget", pass: budgetVisible && budgetHidden });

    // Fill and submit
    const email = `phase10m+${Date.now()}@example.test`;
    await page.locator('input[name="firstName"]').fill("Phase10M");
    await page.locator('input[name="lastName"]').fill("Acceptance");
    await page.locator('input[name="company"]').fill("MagicCRM QA");
    await page.locator('input[name="phone"]').fill("5555550199");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('select[name="eventType"]').selectOption("Birthday");
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 40);
    await page.locator('input[name="dates[]"]').first().fill(date.toISOString().slice(0, 10));
    await page.locator('input[name="time"]').fill("15:00");
    await page.locator('input[name="adults"]').fill("8");
    await page.locator('input[name="children"]').fill("0");
    await page.locator('select[name="duration"]').selectOption("3 hours");
    for (const key of ["bowling", "axe", "laser", "golf", "climbing", "arcade"]) {
      await page.locator(`input[name="attractions[${key}]"][value="open"]`).check({ force: true });
    }
    await page.locator('input[name="food"][value="no"]').check({ force: true });
    await page.locator('input[name="privateRoom"][value="no"]').check({ force: true });
    await page.locator('input[name="craft"][value="no"]').check({ force: true });
    await page.locator('textarea[name="description"]').fill("Phase 10M synthetic acceptance inquiry.");
    await page.locator('input[name="referral"]').fill("Phase10M");
    await page.getByRole("button", { name: /Submit event request/i }).click();
    await page.waitForURL(/\/thanks/, { timeout: 30000 });
    const thanksCopy = await page.locator("body").innerText();
    regressions.push({
      id: "public-submit-thanks",
      pass:
        page.url().includes("/thanks") &&
        /does not reserve a date or confirm pricing/i.test(thanksCopy),
      email,
    });
    await context.close();
  }

  // --- Employee visual + tab behavior ---
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      storageState: AUTH,
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/app/inquiries/${fixture.inquiryId}`, { waitUntil: "networkidle" });
    await ensureSyntheticOrg(page);
    await page.goto(`${BASE}/app/inquiries/${fixture.inquiryId}`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-employee-inquiry-tabs], h1", { timeout: 30000 });

    const overviewSelected = await page
      .getByRole("tab", { name: /^Overview$/i })
      .getAttribute("aria-selected");
    // Eyebrow / status banner (exact phrase; avoid funnel milestone "Customer selected plan")
    const hasStaffReview = await page
      .getByText(/Event inquiry — staff review required/i)
      .first()
      .isVisible()
      .catch(() => false);
    const hasLegacyReady = await page
      .getByText(/CUSTOMER SELECTED PLAN — READY TO BOOK/i)
      .first()
      .isVisible()
      .catch(() => false);
    const quotePanelHiddenInitially = await page.locator("[data-wp-staff-quote-draft]").isHidden();
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    const file = path.join(OUT_DIR, `employee-${vp.name}.png`);
    await page.screenshot({ path: file, fullPage: true });

    // Tab keyboard + preserve draft edits
    let preserveEdits = true;
    const quoteTab = page.getByRole("tab", { name: /Staff quote/i });
    if (await quoteTab.isVisible().catch(() => false)) {
      await quoteTab.focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      const createBtn = page.getByRole("button", { name: /Create staff quote draft|Refresh draft/i });
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click();
        await page.waitForTimeout(2500);
      }
      const reason = page.locator('input[name="editReason"]');
      if (await reason.isVisible().catch(() => false)) {
        await reason.fill("Phase 10M unsaved-edit preserve check");
        await page.getByRole("tab", { name: /^Overview$/i }).click();
        await page.waitForTimeout(200);
        await page.getByRole("tab", { name: /Staff quote/i }).click();
        await page.waitForTimeout(200);
        const value = await page.locator('input[name="editReason"]').inputValue();
        preserveEdits = value.includes("Phase 10M unsaved-edit preserve check");
      }
      const approveLabel = await page.locator("[data-wp-staff-quote-draft]").innerText();
      regressions.push({
        id: `employee-approve-cta-${vp.name}`,
        pass: /Approve internal quote/i.test(approveLabel) || /Approve and send quote/i.test(approveLabel),
        notes: /Customer delivery remains blocked|delivery gated|Approve internal quote/i.test(approveLabel),
      });
    }

    visual.push({
      surface: "employee",
      viewport: vp.name,
      file,
      overviewDefault: overviewSelected === "true",
      hasStaffReview,
      hasLegacyReady,
      quotePanelHiddenInitially,
      overflowX,
      preserveEdits,
      pass:
        overviewSelected === "true" &&
        hasStaffReview &&
        !hasLegacyReady &&
        !overflowX &&
        preserveEdits,
    });
    await context.close();
  }

  // --- Delivery / pricing gates unchanged (read page text) ---
  {
    const context = await browser.newContext({
      storageState: AUTH,
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/app/inquiries/${fixture.inquiryId}`, { waitUntil: "networkidle" });
    await ensureSyntheticOrg(page);
    await page.goto(`${BASE}/app/inquiries/${fixture.inquiryId}`, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: /Staff quote/i }).click();
    await page.waitForTimeout(400);
    const body = await page.locator("body").innerText();
    regressions.push({
      id: "delivery-gated",
      pass: /Customer delivery gated|delivery remains blocked|Approve internal quote/i.test(body),
    });
    await page.getByRole("tab", { name: /Recommendations/i }).click();
    await page.waitForTimeout(300);
    const rec = await page.locator("[data-wp-private-calc]").innerText();
    const expand = page.getByText(/View itinerary and itemized estimate/i).first();
    const collapsed = await expand.isVisible().catch(() => false);
    regressions.push({
      id: "recommendations-collapsed-details",
      pass: /Private recommendation/i.test(rec) && collapsed,
    });
    if (collapsed) {
      await expand.click();
      await page.waitForTimeout(200);
      const expanded = await page.locator("[data-wp-plan-items], [data-wp-plan-itinerary]").count();
      regressions.push({ id: "recommendations-expand", pass: expanded > 0 });
    }
    await context.close();
  }

  await browser.close();

  const payload = {
    ok: visual.every((v) => v.pass) && regressions.every((r) => r.pass),
    visual,
    regressions,
    fixtureInquiryId: fixture.inquiryId,
  };
  writeFileSync(path.join(OUT_DIR, "summary.json"), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(payload, null, 2));
  if (!payload.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
