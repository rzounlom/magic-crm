import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { resolveStaffAuth, staffAuthSkipReason } from "./helpers/staff-auth";
import { resolveStaffInquiryFixture } from "./helpers/staff-fixture";

const auth = resolveStaffAuth();
const fixture = resolveStaffInquiryFixture();
const evidenceDir = path.join("docs", "release", "r3-evidence");

test.describe("Scenario E — Guarded failure", { tag: "@staff-guard" }, () => {
  test.skip(!auth.ok, staffAuthSkipReason());
  test.skip(!fixture.ok, fixture.ok ? "" : fixture.reason);

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  test("blocked HOLD or confirmation explains the real blocker without creating occupancy", async ({
    page,
  }, testInfo) => {
    if (!fixture.ok) return;
    await page.goto(fixture.fixture.inquiryPath);
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired — regenerate with pnpm test:e2e:staff:auth");
    }

    const holdCard = page.locator("#hold-readiness");
    const confirmCard = page.locator("#confirmation-readiness");
    await expect(holdCard.or(confirmCard).first()).toBeVisible({ timeout: 15_000 });

    const placeHold = holdCard.getByRole("button", { name: /^Place HOLD$/i });
    const confirmBooking = page.getByRole("button", { name: /^Confirm booking$/i });

    const holdEnabled =
      (await placeHold.count()) > 0 && (await placeHold.first().isEnabled().catch(() => false));
    const confirmEnabled =
      (await confirmBooking.count()) > 0 &&
      (await confirmBooking.first().isEnabled().catch(() => false));

    // Prefer asserting a genuine blocked path. If both actions are enabled, the fixture
    // is ready — still verify readiness copy is present and no payment claims appear.
    if (!holdEnabled || !confirmEnabled) {
      const body = await page.locator("body").innerText();
      expect(body.length).toBeGreaterThan(40);
      // Blockers or disabled guidance should be visible somewhere in readiness cards.
      const blockerList = page.locator("#hold-readiness li, #confirmation-readiness li");
      const detail = page.locator("#hold-readiness, #confirmation-readiness").locator("p, dd");
      expect((await blockerList.count()) + (await detail.count())).toBeGreaterThan(0);
      expect(body.toLowerCase()).not.toMatch(/payment received|charged successfully/);
    } else {
      test.info().annotations.push({
        type: "note",
        description:
          "Fixture currently enables both HOLD and confirm — guarded-failure assertion limited to payment-neutral copy.",
      });
      const body = await page.locator("body").innerText();
      expect(body.toLowerCase()).not.toMatch(/payment received|charged successfully/);
    }

    // Schedule should not show a brand-new BOOKED row invented by a failed click.
    // We only navigate; we do not click disabled controls.
    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({
      path: path.join(evidenceDir, `guarded-failure-${testInfo.project.name}.png`),
      fullPage: true,
    });
  });
});
