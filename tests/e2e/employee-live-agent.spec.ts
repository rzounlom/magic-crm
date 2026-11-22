import { expect, test } from "@playwright/test";

import { resolveE2ERoleAuth } from "./helpers/e2e-auth";
import { ensureTestCenterB, expectNoServerErrorChrome } from "./helpers/employee-shell";
import { resolveStaffInquiryFixture } from "./helpers/staff-fixture";

/**
 * Legacy Live Agent selected-plan path — read-only.
 * Never places HOLD or confirms bookings (PLAYWRIGHT_STAFF_MUTATIONS must stay off).
 */
const auth = resolveE2ERoleAuth("administrator");
const fixture = resolveStaffInquiryFixture();

test.describe("Live Agent inquiry employee workflow", { tag: ["@phase-12j", "@employee-la"] }, () => {
  test.skip(!auth.ok, auth.ok ? "" : auth.reason);
  test.skip(!fixture.ok, fixture.ok ? "" : fixture.reason);

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  test("READY TO BOOK wording, distinct HOLD vs confirm readiness (read-only)", async ({
    page,
  }) => {
    if (!fixture.ok) return;
    expect(process.env.PLAYWRIGHT_STAFF_MUTATIONS ?? "").not.toBe("1");

    await ensureTestCenterB(page);
    await page.goto(fixture.fixture.inquiryPath, { waitUntil: "networkidle" });
    await expectNoServerErrorChrome(page);

    const body = await page.locator("body").innerText();
    // Legacy LA selected-plan path: banner and/or customer selection + booking coach.
    // WP inquiries must never show READY TO BOOK (covered in @employee-wp).
    const hasReadyBanner = /CUSTOMER SELECTED PLAN|READY TO BOOK/i.test(body);
    const hasCustomerSelection = /Original customer selection|customer selection/i.test(body);
    const hasBookingCoach = (await page.getByRole("region", { name: /Booking coach/i }).count()) > 0;
    expect(hasReadyBanner || (hasCustomerSelection && hasBookingCoach)).toBeTruthy();

    const hold = page.locator("#hold-readiness");
    const confirm = page.locator("#confirmation-readiness");
    await expect(hold).toBeVisible();
    await expect(confirm).toBeVisible();
    await expect(hold.getByText(/Purpose:\s*PLACE_HOLD/i)).toBeVisible();
    await expect(confirm.getByText(/Purpose:\s*CONFIRM_BOOKING/i)).toBeVisible();
    // HOLD vs confirmation stay separate in copy.
    expect(body).toMatch(/HOLD and confirmation stay separate|PLACE_HOLD|CONFIRM_BOOKING/i);

    const startWorking = page.getByRole("button", { name: /^Start Working$/i });
    const confirmBooking = page.getByRole("button", { name: /^Confirm booking$/i });
    await expect(startWorking).toBeVisible();
    await expect(confirmBooking).toBeVisible();
    expect((await startWorking.innerText()).trim()).not.toEqual(
      (await confirmBooking.innerText()).trim(),
    );

    // Availability / operating-hours signals remain visible on readiness.
    expect(body).toMatch(/Operating hours|Within operating hours|Availability/i);

    // Do not click HOLD, Start Working, or Confirm.
  });

  test("queue surfaces LA follow-up section when Active list is open", async ({ page }) => {
    if (!fixture.ok) return;
    await ensureTestCenterB(page);
    await page.goto("/app/inquiries", { waitUntil: "networkidle" });
    await expectNoServerErrorChrome(page);
    // Section may or may not contain this fixture depending on status — page must load.
    const followUp = page.locator("#ready-for-booking-follow-up");
    if ((await followUp.count()) > 0) {
      await expect(followUp).toBeVisible();
    }
  });
});
