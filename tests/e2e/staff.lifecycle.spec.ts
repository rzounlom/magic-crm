import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { resolveStaffAuth, staffAuthSkipReason } from "./helpers/staff-auth";
import { resolveR5LifecycleFixture, staffMutationsEnabled } from "./helpers/staff-fixture";
import {
  confirmOpenDialog,
  openMutationDialog,
  prepareInquiryForMutation,
} from "./helpers/staff-lifecycle";

const auth = resolveStaffAuth();
const lifecycle = resolveR5LifecycleFixture();
const evidenceDir = path.join("docs", "release", "r5-evidence");

test.describe("R5 — Successful booking lifecycle (opt-in mutations)", { tag: "@staff-lifecycle" }, () => {
  test.skip(!auth.ok, staffAuthSkipReason());
  test.skip(!lifecycle.ok, lifecycle.ok ? "" : lifecycle.reason);
  test.skip(!staffMutationsEnabled(), "Set PLAYWRIGHT_STAFF_MUTATIONS=1 for R5 lifecycle mutations");
  test.setTimeout(120_000);

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  test("places HOLD and verifies persisted HOLD state (not a confirmed booking)", async ({
    page,
  }, testInfo) => {
    if (!lifecycle.ok) return;

    await prepareInquiryForMutation(page, lifecycle.fixture.hold.inquiryPath);
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired — regenerate with pnpm test:e2e:staff:auth");
    }

    const holdCard = page.locator("#hold-readiness");
    await expect(holdCard).toBeVisible({ timeout: 15_000 });
    await expect(holdCard.getByText(/Purpose:\s*PLACE_HOLD/i)).toBeVisible();
    await expect(page.locator("#confirmation-readiness").getByText(/Purpose:\s*CONFIRM_BOOKING/i)).toBeVisible();

    await openMutationDialog(holdCard.getByRole("button", { name: /^Place HOLD$/i }).first());
    await confirmOpenDialog(page, /^Place HOLD$/i);

    await expect(page.getByText(/Resources held/i).first()).toBeVisible({ timeout: 20_000 });
    await page.goto(lifecycle.fixture.hold.inquiryPath, { waitUntil: "networkidle" });
    await expect(page.locator("#hold-readiness").getByText(/^Active \(/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("#hold-readiness").getByText(/Expires/i)).toBeVisible();
    await expect(page.locator("#hold-readiness").getByText(/No active HOLD/i)).toHaveCount(0);
    await expect(page.getByText(/Booking confirmed|Open BK-/i)).toHaveCount(0);

    const holdDate = lifecycle.fixture.hold.preferredDate ?? "2027-01-12";
    await page.goto(`/app/schedule?date=${holdDate}`);
    await expect(page.getByText(/Hold|HOLD|have bookings/i).first()).toBeVisible({ timeout: 15_000 });

    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({
      path: path.join(evidenceDir, `lifecycle-hold-schedule-${testInfo.project.name}.png`),
      fullPage: true,
    });
    testInfo.annotations.push({
      type: "verified",
      description: `HOLD placed on ${lifecycle.fixture.hold.inquiryPath}; schedule checked for ${holdDate}.`,
    });
  });

  test("confirms booking and verifies booking detail + schedule occupancy", async ({
    page,
  }, testInfo) => {
    if (!lifecycle.ok) return;

    await prepareInquiryForMutation(page, lifecycle.fixture.confirm.inquiryPath);
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired");
    }

    const confirmCard = page.locator("#confirmation-readiness");
    await expect(confirmCard).toBeVisible({ timeout: 15_000 });
    await expect(confirmCard.getByText(/Purpose:\s*CONFIRM_BOOKING/i)).toBeVisible();
    await expect(confirmCard.getByText(/Purpose:\s*PLACE_HOLD/i)).toHaveCount(0);

    const confirmButton = page.getByRole("button", { name: /^Confirm booking$/i, disabled: false }).first();
    await openMutationDialog(confirmButton);
    await confirmOpenDialog(page, /^Confirm booking$/i);

    await expect(
      page.getByText(/Booking confirmed|Unable to confirm booking/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Unable to confirm booking/i)).toHaveCount(0);
    await expect(page).toHaveURL(/\/app\/bookings\/[^/]+/, { timeout: 45_000 });
    await expect(page.getByText(/confirmed|Booking #|BK-|MAG-/i).first()).toBeVisible({
      timeout: 15_000,
    });
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toMatch(/payment received|stripe|charged successfully|paid in full/);

    const bookingUrl = page.url();
    const confirmDate = lifecycle.fixture.confirm.preferredDate ?? "2027-01-14";
    await page.goto(`/app/schedule?date=${confirmDate}`);
    await expect(page.getByText(/Booked|BK-|confirmed|have bookings|MAG-/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/app/inquiries");
    await expect(page.getByText(lifecycle.fixture.confirm.email)).toHaveCount(0);

    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.goto(bookingUrl);
    await page.screenshot({
      path: path.join(evidenceDir, `lifecycle-confirm-booking-${testInfo.project.name}.png`),
      fullPage: true,
    });
    testInfo.annotations.push({
      type: "verified",
      description: `Booking confirmed from ${lifecycle.fixture.confirm.inquiryPath}; detail ${bookingUrl}.`,
    });
  });

  test("admin-denied routes guide staff to an administrator", async ({ page }) => {
    await page.goto("/app/admin/resources");
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired");
    }
    await expect(page.getByText(/don't have permission|not authorized|permission/i).first()).toBeVisible();
    await expect(page.locator("[data-permission-guidance]")).toContainText(/authorized administrator/i);
  });
});
