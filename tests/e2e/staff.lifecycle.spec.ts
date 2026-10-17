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
const evidenceDir = path.join("docs", "release", "r6-evidence");

test.describe("R6 — Mutation consistency lifecycle (opt-in)", { tag: "@staff-lifecycle" }, () => {
  test.skip(!auth.ok, staffAuthSkipReason());
  test.skip(!lifecycle.ok, lifecycle.ok ? "" : lifecycle.reason);
  test.skip(!staffMutationsEnabled(), "Set PLAYWRIGHT_STAFF_MUTATIONS=1 for lifecycle mutations");
  test.setTimeout(120_000);

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  test("places HOLD without hard reload and shows active status", async ({ page }, testInfo) => {
    if (!lifecycle.ok) return;

    await prepareInquiryForMutation(page, lifecycle.fixture.hold.inquiryPath);
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired — regenerate with pnpm test:e2e:staff:auth");
    }

    const holdCard = page.locator("#hold-readiness");
    await expect(holdCard).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-primary-hold-action]")).toBeVisible();
    // Availability section must not compete with the primary Place HOLD control.
    await expect(page.locator("#availability-resources").getByRole("button", { name: /^Place HOLD$/i })).toHaveCount(
      0,
    );

    await openMutationDialog(holdCard.getByRole("button", { name: /^Place HOLD$/i }).first());
    await confirmOpenDialog(page, /^Place HOLD$/i);

    // Soft refresh must update HOLD state without navigation (toast may race awareness polling).
    await expect(holdCard.getByText(/^Active \(/i)).toBeVisible({ timeout: 60_000 });
    await expect(holdCard.getByText(/Expires/i)).toBeVisible();
    await expect(holdCard.getByText(/No active HOLD/i)).toHaveCount(0);
    await expect(page.getByText(/Unable to place resource hold/i)).toHaveCount(0);
    await expect(page.getByText(/Booking confirmed|Open BK-/i)).toHaveCount(0);

    // Additional persisted evidence after hard reload (not required for soft consistency).
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("#hold-readiness").getByText(/^Active \(/i)).toBeVisible({ timeout: 15_000 });

    const holdDate = lifecycle.fixture.hold.preferredDate ?? "2027-01-12";
    await page.goto(`/app/schedule?date=${holdDate}`);
    await expect(page.getByText(/Hold|HOLD|have bookings/i).first()).toBeVisible({ timeout: 15_000 });

    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({
      path: path.join(evidenceDir, `lifecycle-hold-schedule-${testInfo.project.name}.png`),
      fullPage: true,
    });
  });

  test("releases HOLD without hard reload when Release is available", async ({ page }, testInfo) => {
    if (!lifecycle.ok) return;

    await page.goto(lifecycle.fixture.hold.inquiryPath, { waitUntil: "networkidle" });
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired");
    }

    const holdCard = page.locator("#hold-readiness");
    await expect(holdCard).toBeVisible({ timeout: 15_000 });
    const release = page.getByRole("button", { name: /Release HOLD|Release hold|Release all holds/i }).first();
    if ((await release.count()) === 0 || !(await release.isEnabled().catch(() => false))) {
      testInfo.annotations.push({
        type: "not-executed",
        description: "No Release HOLD control after HOLD path — skip release assertion.",
      });
      test.skip(true, "Release HOLD not available on this fixture state");
    }

    await openMutationDialog(release);
    await confirmOpenDialog(page, /Release/i);
    await expect(page.getByText(/Holds released|Hold released/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(holdCard.getByText(/No active HOLD/i)).toBeVisible({ timeout: 25_000 });
  });

  test("confirms booking without hard reload and lands on booking detail", async ({ page }, testInfo) => {
    if (!lifecycle.ok) return;

    await prepareInquiryForMutation(page, lifecycle.fixture.confirm.inquiryPath);
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired");
    }

    const confirmCard = page.locator("#confirmation-readiness");
    await expect(confirmCard).toBeVisible({ timeout: 15_000 });
    await expect(confirmCard.getByText(/Purpose:\s*CONFIRM_BOOKING/i)).toBeVisible();

    const confirmButton = page.getByRole("button", { name: /^Confirm booking$/i, disabled: false }).first();
    await openMutationDialog(confirmButton);
    await confirmOpenDialog(page, /^Confirm booking$/i);

    await expect(page.getByText(/Booking confirmed|Unable to confirm booking/i).first()).toBeVisible({
      timeout: 30_000,
    });
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
  });

  test("duplicate Place HOLD while pending does not open a second dialog", async ({ page }) => {
    if (!lifecycle.ok) return;
    // Fresh hold path may already be held from prior test — recreate is caller's job.
    await page.goto(lifecycle.fixture.hold.inquiryPath, { waitUntil: "networkidle" });
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired");
    }
    const placeHold = page.locator("#hold-readiness").getByRole("button", { name: /^Place HOLD$/i }).first();
    if ((await placeHold.count()) === 0 || !(await placeHold.isEnabled().catch(() => false))) {
      test.skip(true, "Place HOLD not available (already held or blocked)");
    }
    await placeHold.click({ force: true });
    await expect.poll(async () =>
      page.locator("dialog").evaluateAll((nodes) => nodes.filter((n) => (n as HTMLDialogElement).open).length),
    ).toBe(1);
    // Second click while dialog open must not stack another open dialog.
    await placeHold.click({ force: true }).catch(() => undefined);
    await expect
      .poll(async () =>
        page.locator("dialog").evaluateAll((nodes) => nodes.filter((n) => (n as HTMLDialogElement).open).length),
      )
      .toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
  });

  test("cancels confirmed booking without hard reload when Cancel is available", async ({ page }, testInfo) => {
    if (!lifecycle.ok) return;

    // Depends on the prior confirm test having booked this fixture (same file, one worker).
    await page.goto(lifecycle.fixture.confirm.inquiryPath, { waitUntil: "networkidle" });
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired");
    }

    await expect(
      page.getByRole("link", { name: /^Open Booking$/i }).or(page.getByRole("link", { name: /Open MAG-/i })).first(),
    )
      .toBeVisible({ timeout: 15_000 })
      .catch(() => undefined);

    const cancel = page.getByRole("button", { name: /^Cancel Booking$/i }).first();
    if ((await cancel.count()) === 0 || !(await cancel.isEnabled().catch(() => false))) {
      testInfo.annotations.push({
        type: "not-executed",
        description: "Cancel Booking control missing or disabled for this staff role / booking state.",
      });
      test.skip(true, "Cancel Booking not available");
    }

    await openMutationDialog(cancel);
    await confirmOpenDialog(page, /^Cancel booking$/i);
    await expect(page.getByText(/Booking cancelled/i).first()).toBeVisible({ timeout: 25_000 });
    // Soft refresh must surface cancelled state without a hard reload.
    await expect(page.getByText(/This booking was cancelled|Booking cancelled|cancelled/i).first()).toBeVisible({
      timeout: 25_000,
    });
  });

  test("conflict-after-availability scenario is reported when not safely runnable", async ({}, testInfo) => {
    testInfo.annotations.push({
      type: "not-executed",
      description:
        "Creating a live inventory conflict after a successful availability check requires a second concurrent fixture occupying the same resources; not automated in R6 to avoid cross-fixture collisions on the shared TEST venue.",
    });
    test.skip(true, "Conflict-after-availability not safely automated on shared disposable inventory");
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
