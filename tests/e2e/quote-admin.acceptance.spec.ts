import { expect, test } from "@playwright/test";

import {
  assertLocalhostBaseUrl,
  identityForRole,
  resolveE2EIdentities,
  resolveE2ERoleAuth,
  resolveE2EWpInquiry,
} from "./helpers/e2e-auth";
import {
  ensureStaffQuoteDraft,
  openStaffQuoteEditor,
  readClerkIdentity,
  switchToTestCenterB,
} from "./helpers/quote-acceptance";
import { readStoredUnitCents } from "./helpers/quote-db";

const auth = resolveE2ERoleAuth("administrator");
const identities = resolveE2EIdentities();
const inquiry = resolveE2EWpInquiry();

test.describe("Administrator quote acceptance", { tag: ["@quote", "@quote-admin"] }, () => {
  test.skip(!auth.ok, auth.ok ? "" : auth.reason);
  test.skip(!identities.ok, identities.ok ? "" : identities.reason);
  test.skip(!inquiry.ok, inquiry.ok ? "" : inquiry.reason);

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  test("dollar save/reload, invalid rejection, override + edit reason", async ({ page }) => {
    const baseURL = assertLocalhostBaseUrl(
      process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    );
    if (!identities.ok || !inquiry.ok) throw new Error("Fixture resolution failed.");
    const expected = identityForRole(identities.fixture, "administrator");
    if (!expected) throw new Error("Missing Administrator identity.");

    await page.goto(`${baseURL}/app`, { waitUntil: "domcontentloaded" });
    if (page.url().includes("sign-in")) {
      throw new Error("Administrator storage expired — re-run pnpm test:e2e:auth");
    }

    const identity = await readClerkIdentity(page);
    expect(identity.clerkUserId).toBe(expected.clerkUserId);

    await switchToTestCenterB(page, baseURL);
    await ensureStaffQuoteDraft(page, baseURL, inquiry.fixture.inquiryPath);

    const unit = page.locator("input[name='lineUnitPriceDollars_0']");
    await unit.waitFor({ timeout: 15_000 });
    const editable =
      (await unit.getAttribute("readonly")) === null && !(await unit.isDisabled());
    expect(editable, "Administrator must edit unit price dollars").toBeTruthy();

    const reason = page.locator("input[name='editReason']");
    await expect(reason).toHaveAttribute("required", "");

    async function saveDollars(value: string, editReason: string) {
      await unit.fill(value);
      await reason.fill(editReason);
      await page.getByRole("button", { name: /Save staff edits/i }).click({ timeout: 15_000 });
      await page.waitForTimeout(2500);
    }

    await saveDollars("49.99", "E2E admin baseline $49.99 → 4999¢");
    await openStaffQuoteEditor(page, baseURL, inquiry.fixture.inquiryPath);
    await unit.waitFor({ timeout: 15_000 });
    expect(await unit.inputValue()).toBe("49.99");
    expect(
      readStoredUnitCents({
        organizationId: inquiry.fixture.organizationId,
        inquiryId: inquiry.fixture.inquiryId,
      })?.unitPriceCents,
    ).toBe(4999);

    await saveDollars("55.00", "E2E admin save $55.00 → 5500¢");
    await openStaffQuoteEditor(page, baseURL, inquiry.fixture.inquiryPath);
    await unit.waitFor({ timeout: 15_000 });
    expect(await unit.inputValue()).toBe("55.00");
    expect(
      readStoredUnitCents({
        organizationId: inquiry.fixture.organizationId,
        inquiryId: inquiry.fixture.inquiryId,
      })?.unitPriceCents,
    ).toBe(5500);

    const beforeInvalid = readStoredUnitCents({
      organizationId: inquiry.fixture.organizationId,
      inquiryId: inquiry.fixture.inquiryId,
    });
    for (const bad of ["abc", "-5", "12.345", ""]) {
      await unit.fill(bad);
      await reason.fill(`E2E reject ${bad || "(blank)"}`);
      await page.getByRole("button", { name: /Save staff edits/i }).click({ timeout: 15_000 });
      await page.waitForTimeout(1200);
    }
    await openStaffQuoteEditor(page, baseURL, inquiry.fixture.inquiryPath);
    const afterInvalid = readStoredUnitCents({
      organizationId: inquiry.fixture.organizationId,
      inquiryId: inquiry.fixture.inquiryId,
    });
    expect(afterInvalid?.unitPriceCents).toBe(beforeInvalid?.unitPriceCents);

    // Authorized override after invalids — restore known good.
    await saveDollars("55.00", "E2E admin authorized override restore $55.00");
    await openStaffQuoteEditor(page, baseURL, inquiry.fixture.inquiryPath);
    expect(await unit.inputValue()).toBe("55.00");
    expect(
      readStoredUnitCents({
        organizationId: inquiry.fixture.organizationId,
        inquiryId: inquiry.fixture.inquiryId,
      })?.unitPriceCents,
    ).toBe(5500);

    // Empty reason blocked by HTML required (authorized override path still gated).
    await unit.fill("56.00");
    await reason.fill("");
    await page.getByRole("button", { name: /Save staff edits/i }).click({ timeout: 5_000 });
    await page.waitForTimeout(500);
    expect(await unit.inputValue()).toBe("56.00");
    expect(
      readStoredUnitCents({
        organizationId: inquiry.fixture.organizationId,
        inquiryId: inquiry.fixture.inquiryId,
      })?.unitPriceCents,
    ).toBe(5500);
  });
});
