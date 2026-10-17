import { expect, test } from "@playwright/test";

import { resolveStaffAuth, staffAuthSkipReason } from "./helpers/staff-auth";
import { resolveR7ConflictFixture, staffMutationsEnabled } from "./helpers/staff-fixture";
import {
  confirmOpenDialog,
  openMutationDialog,
  prepareInquiryForMutation,
} from "./helpers/staff-lifecycle";

const auth = resolveStaffAuth();
const conflict = resolveR7ConflictFixture();

test.describe("R7 — Stale availability conflict (opt-in)", { tag: "@staff-conflict" }, () => {
  test.skip(!auth.ok, staffAuthSkipReason());
  test.skip(!conflict.ok, conflict.ok ? "" : conflict.reason);
  test.skip(!staffMutationsEnabled(), "Set PLAYWRIGHT_STAFF_MUTATIONS=1 for conflict mutations");
  test.setTimeout(180_000);
  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  test("second inquiry cannot HOLD after first occupies exclusive resource", async ({ page }, testInfo) => {
    if (!conflict.ok) return;

    // Both inquiries check availability successfully first.
    await prepareInquiryForMutation(page, conflict.fixture.winner.inquiryPath);
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired — regenerate with pnpm test:e2e:staff:auth");
    }
    await expect(page.getByText(/Available|Availability checked|Within operating/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await prepareInquiryForMutation(page, conflict.fixture.loser.inquiryPath);
    await expect(page.getByText(/Available|Availability checked|Within operating/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // First inquiry places HOLD.
    await page.goto(conflict.fixture.winner.inquiryPath, { waitUntil: "networkidle" });
    const winnerHold = page.locator("#hold-readiness");
    await expect(winnerHold).toBeVisible({ timeout: 15_000 });
    const placeWinner = winnerHold.getByRole("button", { name: /^Place HOLD$/i }).first();
    if ((await placeWinner.count()) === 0 || !(await placeWinner.isEnabled().catch(() => false))) {
      testInfo.annotations.push({
        type: "not-executed",
        description: "Winner Place HOLD unavailable — exclusive fixture may already be occupied.",
      });
      test.skip(true, "Winner Place HOLD not available");
    }
    await openMutationDialog(placeWinner);
    await confirmOpenDialog(page, /^Place HOLD$/i);
    // Soft refresh can lag under awareness polling; assert authoritative HOLD state.
    await expect(winnerHold.getByText(/^Active \(/i)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Unable to place resource hold/i)).toHaveCount(0);

    // Second inquiry attempts HOLD — must fail with availability conflict and leave no occupancy.
    await page.goto(conflict.fixture.loser.inquiryPath, { waitUntil: "networkidle" });
    const loserHold = page.locator("#hold-readiness");
    await expect(loserHold).toBeVisible({ timeout: 15_000 });
    const placeLoser = loserHold.getByRole("button", { name: /^Place HOLD$/i }).first();
    if ((await placeLoser.count()) === 0 || !(await placeLoser.isEnabled().catch(() => false))) {
      // Soft-blocked by readiness after winner occupied — still assert no Active HOLD / booking.
      await expect(loserHold.getByText(/^Active \(/i)).toHaveCount(0);
      await expect(page.getByText(/Booking confirmed|Open MAG-/i)).toHaveCount(0);
      await expect(
        page.getByText(/conflict|unavailable|not available|occupied|changed/i).first(),
      ).toBeVisible({ timeout: 15_000 });
      return;
    }

    await openMutationDialog(placeLoser);
    await confirmOpenDialog(page, /^Place HOLD$/i);
    await expect(
      page.getByText(/Unable to place|conflict|unavailable|Availability changed|already/i).first(),
    ).toBeVisible({ timeout: 25_000 });
    await expect(loserHold.getByText(/^Active \(/i)).toHaveCount(0);
    await expect(page.getByText(/Booking confirmed|Open MAG-/i)).toHaveCount(0);

    // Path to check again.
    const recheck = page.getByRole("button", { name: /^Check Availability$/i }).first();
    if ((await recheck.count()) > 0 && (await recheck.isEnabled().catch(() => false))) {
      await recheck.click({ force: true });
      await expect(
        page.getByText(/Unavailable|conflict|not available|Availability changed|occupied/i).first(),
      ).toBeVisible({ timeout: 25_000 });
    } else {
      await expect(
        page.getByText(/conflict|unavailable|not available|Review HOLD readiness|Check Availability/i).first(),
      ).toBeVisible();
    }
  });
});
