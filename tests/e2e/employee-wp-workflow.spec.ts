import { expect, test } from "@playwright/test";

import { resolveE2ERoleAuth, resolveE2EWpInquiry } from "./helpers/e2e-auth";
import {
  e2eBaseURL,
  ensureTestCenterB,
  expectNoServerErrorChrome,
} from "./helpers/employee-shell";
import { openStaffQuoteEditor } from "./helpers/quote-acceptance";

/**
 * WordPress inquiry employee workflow (read + light interaction).
 * Dollar/override matrix lives in @quote (Phase 12I) — do not duplicate here.
 */
const auth = resolveE2ERoleAuth("event_sales");
const wp = resolveE2EWpInquiry();

test.describe("WordPress inquiry employee workflow", { tag: ["@phase-12j", "@employee-wp"] }, () => {
  test.skip(!auth.ok, auth.ok ? "" : auth.reason);
  test.skip(!wp.ok, wp.ok ? "" : wp.reason);

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  test("staff-review wording, tabs, and draft survival (no false READY TO BOOK)", async ({
    page,
  }) => {
    if (!wp.ok) return;
    const base = e2eBaseURL();
    await ensureTestCenterB(page);
    await page.goto(`${base}${wp.fixture.inquiryPath}`, { waitUntil: "networkidle" });
    await expectNoServerErrorChrome(page);

    const body = await page.locator("body").innerText();
    expect(body).toMatch(/Event inquiry — staff review required/i);
    expect(body).not.toMatch(/READY TO BOOK/i);
    expect(body).not.toMatch(/CUSTOMER SELECTED PLAN/i);
    // Remains an inquiry surface (not a confirmed booking shell).
    expect(body).toMatch(/Inquiry|Staff quote|Archive Inquiry/i);

    const tabs = page.locator("[data-employee-inquiry-tabs]");
    await expect(tabs).toBeVisible();
    for (const name of [/Overview/i, /Staff quote/i, /Recommendations/i, /Activity/i]) {
      await expect(tabs.getByRole("tab", { name })).toBeVisible();
    }

    // Keyboard: tabs are focusable buttons/roles
    const staffTab = tabs.getByRole("tab", { name: /Staff quote/i });
    await staffTab.focus();
    await expect(staffTab).toBeFocused();
    await staffTab.click();

    await openStaffQuoteEditor(page, base, wp.fixture.inquiryPath);
    const draftRoot = page.locator(
      "[data-wp-staff-quote-draft], [data-wp-quote-approval], button:has-text('Create staff quote draft')",
    );
    await expect(draftRoot.first()).toBeVisible();

    // Capture a qty value if draft inputs exist, then switch tabs and return.
    const qty = page.locator("input[name='lineQty_0']");
    let qtyBefore: string | null = null;
    if ((await qty.count()) > 0) {
      qtyBefore = await qty.inputValue();
    }

    await tabs.getByRole("tab", { name: /Overview/i }).click();
    await page.waitForTimeout(400);
    await tabs.getByRole("tab", { name: /Staff quote/i }).click();
    await draftRoot.first().waitFor({ timeout: 15_000 });

    if (qtyBefore != null) {
      expect(await page.locator("input[name='lineQty_0']").inputValue()).toBe(qtyBefore);
    }

    // Availability / delivery messaging remains honest.
    const after = await page.locator("body").innerText();
    expect(after).toMatch(/delivery unavailable|Customer email delivery|Availability/i);
    expect(after).not.toMatch(/quote emailed|email sent to customer/i);

    // Dollar label present when draft editor is shown (precision covered by @quote).
    if ((await page.locator("input[name^='lineUnitPriceDollars_']").count()) > 0) {
      expect(after).toMatch(/Unit price \(\$\)/i);
    }
  });
});
