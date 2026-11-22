import { expect, test } from "@playwright/test";

import {
  assertLocalhostBaseUrl,
  identityForRole,
  resolveE2EIdentities,
  resolveE2ERoleAuth,
  resolveE2EWpInquiry,
} from "./helpers/e2e-auth";
import {
  openStaffQuoteEditor,
  readClerkIdentity,
  switchToTestCenterB,
} from "./helpers/quote-acceptance";
import { probeEventSalesOverride, readStoredUnitCents } from "./helpers/quote-db";

const auth = resolveE2ERoleAuth("event_sales");
const identities = resolveE2EIdentities();
const inquiry = resolveE2EWpInquiry();

test.describe("Event Sales quote acceptance", { tag: ["@quote", "@quote-event-sales"] }, () => {
  test.skip(!auth.ok, auth.ok ? "" : auth.reason);
  test.skip(!identities.ok, identities.ok ? "" : identities.reason);
  test.skip(!inquiry.ok, inquiry.ok ? "" : inquiry.reason);

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  test("locked unit dollars, qty save, override FORBIDDEN, delivery gated", async ({ page }) => {
    if (!identities.ok || !inquiry.ok) throw new Error("Fixture resolution failed.");
    const expected = identityForRole(identities.fixture, "event_sales");
    if (!expected) throw new Error("Missing Event Sales identity.");
    expect(expected.hasPriceOverride).toBe(false);
    expect(expected.hasQuotesApprove).toBe(true);

    const baseURL = assertLocalhostBaseUrl(
      process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    );

    await page.goto(`${baseURL}/app`, { waitUntil: "domcontentloaded" });
    if (page.url().includes("sign-in")) {
      throw new Error("Event Sales storage expired — re-run pnpm test:e2e:auth");
    }

    const identity = await readClerkIdentity(page);
    expect(identity.clerkUserId).toBe(expected.clerkUserId);

    await switchToTestCenterB(page, baseURL);
    await openStaffQuoteEditor(page, baseURL, inquiry.fixture.inquiryPath);

    const body = await page.locator("body").innerText();
    expect(body).toMatch(/Event inquiry — staff review required/i);
    expect(body).not.toMatch(/READY TO BOOK/i);
    expect(body).toMatch(/Unit price \(\$\)/i);
    expect(body).toMatch(/delivery unavailable|Customer email delivery/i);

    const unit = page.locator("input[name='lineUnitPriceDollars_0']");
    await unit.waitFor({ timeout: 15_000 });
    const unitDisplay = await unit.inputValue();
    const unitLocked =
      (await unit.getAttribute("readonly")) !== null || (await unit.isDisabled());
    expect(unitLocked, "Event Sales must not edit unit price").toBeTruthy();

    const qty = page.locator("input[name='lineQty_0']");
    await qty.waitFor({ timeout: 10_000 });
    const qtyEditable =
      !(await qty.isDisabled()) && (await qty.getAttribute("readonly")) === null;
    expect(qtyEditable).toBeTruthy();

    const beforeQty = Number(await qty.inputValue());
    const nextQty = beforeQty >= 2 ? beforeQty - 1 : beforeQty + 1;
    const beforeStore = readStoredUnitCents({
      organizationId: inquiry.fixture.organizationId,
      inquiryId: inquiry.fixture.inquiryId,
    });

    await qty.fill(String(nextQty));
    await page.locator("input[name='editReason']").fill("E2E Event Sales authorized qty edit");
    await page.getByRole("button", { name: /Save staff edits/i }).click({ timeout: 15_000 });
    await page.waitForTimeout(2500);
    await openStaffQuoteEditor(page, baseURL, inquiry.fixture.inquiryPath);

    const afterQtyDisplay = await page.locator("input[name='lineQty_0']").inputValue();
    const afterStore = readStoredUnitCents({
      organizationId: inquiry.fixture.organizationId,
      inquiryId: inquiry.fixture.inquiryId,
    });
    expect(afterQtyDisplay).toBe(String(nextQty));
    expect(afterStore?.quantity).toBe(nextQty);
    expect(afterStore?.unitPriceCents).toBe(beforeStore?.unitPriceCents);
    expect(await page.locator("input[name='lineUnitPriceDollars_0']").inputValue()).toBe(
      unitDisplay,
    );

    const override = probeEventSalesOverride({
      organizationId: inquiry.fixture.organizationId,
      inquiryId: inquiry.fixture.inquiryId,
      clerkUserId: expected.clerkUserId,
    });
    expect(override.ok).toBe(true);
    expect(override.code).toBe("FORBIDDEN");

    await openStaffQuoteEditor(page, baseURL, inquiry.fixture.inquiryPath);
    const approve = page.getByRole("button", {
      name: /Approve internal quote|Approve quote \(delivery gated\)|Approve and send quote/i,
    });
    const alreadyApproved = (await page.locator("[data-wp-quote-approval]").count()) > 0;
    if (!alreadyApproved) {
      await expect(approve.first()).toBeVisible({ timeout: 20_000 });
      const approveLabel = (await approve.first().innerText()).trim();
      // Delivery must stay gated — never the live "Approve and send" path while canDeliver=false.
      expect(approveLabel).toMatch(/Approve internal quote|delivery gated/i);
      expect(approveLabel).not.toMatch(/Approve and send quote/i);
      await approve.first().click({ timeout: 15_000 });
      await page.waitForTimeout(2500);
      await openStaffQuoteEditor(page, baseURL, inquiry.fixture.inquiryPath);
    }
    const afterApprove = await page.locator("body").innerText();
    expect(afterApprove).toMatch(
      /delivery unavailable|delivery gated|delivery remains blocked|Customer email delivery|not delivered/i,
    );
    expect(afterApprove).not.toMatch(
      /quote emailed|email sent to customer|customer was notified/i,
    );
    expect(afterApprove).not.toMatch(/Approve and send quote/i);

    await page.getByRole("tab", { name: /Overview/i }).click();
    await page.waitForTimeout(400);
    await page.getByRole("tab", { name: /Staff quote/i }).click();
    await page.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 15_000 });
    expect(await page.locator("input[name='lineQty_0']").inputValue()).toBe(String(nextQty));
  });
});
