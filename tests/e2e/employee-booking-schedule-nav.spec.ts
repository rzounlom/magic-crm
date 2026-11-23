import { expect, test } from "@playwright/test";

import { resolveE2ERoleAuth } from "./helpers/e2e-auth";
import {
  documentHasHorizontalOverflow,
  ensureTestCenterB,
  expectNoServerErrorChrome,
  roleFromProjectName,
} from "./helpers/employee-shell";

const adminAuth = resolveE2ERoleAuth("administrator");
const deskAuth = resolveE2ERoleAuth("front_desk");

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

/**
 * Phase 12O — read-only booking detail + schedule block navigation.
 * Synthetic Test Center B only. No HOLD/confirm mutations.
 */
test.describe(
  "employee booking detail + schedule block navigation",
  { tag: ["@phase-12o", "@employee-bookings-nav"] },
  () => {
    test("Administrator: open booking detail and return to list", async ({ page }, testInfo) => {
      test.skip(!adminAuth.ok, adminAuth.ok ? "" : adminAuth.reason);
      const projectRole = roleFromProjectName(testInfo.project.name);
      if (projectRole && projectRole !== "administrator") {
        test.skip(true, "Booking detail nav under employee-admin");
      }

      await page.setViewportSize({ width: 1440, height: 900 });
      await ensureTestCenterB(page);
      await page.goto("/app/bookings", { waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-bookings-list]")).toBeVisible();

      const row = page.locator("[data-booking-row]").first();
      test.skip((await row.count()) === 0, "No synthetic bookings in list");

      const href = await row.getAttribute("href");
      expect(href).toMatch(/\/app\/bookings\//);
      await row.click();
      await page.waitForURL(/\/app\/bookings\/[^/?]+/);
      await expect(page.locator("[data-booking-detail]")).toBeVisible();
      await expectNoServerErrorChrome(page);
      await expect(page.getByRole("link", { name: /Back to bookings/i })).toBeVisible();
      await page.getByRole("link", { name: /Back to bookings/i }).click();
      await page.waitForURL(/\/app\/bookings/);
      await expect(page.locator("[data-bookings-list]")).toBeVisible();
    });

    test("Front Desk: booking detail readable without create/cancel escalation", async ({
      page,
    }, testInfo) => {
      test.skip(!deskAuth.ok, deskAuth.ok ? "" : deskAuth.reason);
      const projectRole = roleFromProjectName(testInfo.project.name);
      if (projectRole && projectRole !== "front_desk") {
        test.skip(true, "Front Desk booking detail under employee-front-desk");
      }

      await page.setViewportSize({ width: 1440, height: 900 });
      await ensureTestCenterB(page);
      await page.goto("/app/bookings", { waitUntil: "domcontentloaded" });
      const row = page.locator("[data-booking-row]").first();
      test.skip((await row.count()) === 0, "No synthetic bookings for Front Desk");

      await row.click();
      await page.waitForURL(/\/app\/bookings\/[^/?]+/);
      await expect(page.locator("[data-booking-detail]")).toBeVisible();
      await expect(page.getByRole("button", { name: /Cancel Booking/i })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /New Booking/i })).toHaveCount(0);
    });

    test("Administrator: schedule block opens detail dialog with HOLD/Booked distinction", async ({
      page,
    }, testInfo) => {
      test.skip(!adminAuth.ok, adminAuth.ok ? "" : adminAuth.reason);
      const projectRole = roleFromProjectName(testInfo.project.name);
      if (projectRole && projectRole !== "administrator") {
        test.skip(true, "Schedule block nav under employee-admin");
      }

      await page.setViewportSize({ width: 1440, height: 900 });
      await ensureTestCenterB(page);

      // Prefer a confirmed booking's "View on Schedule" deep-link so we land on an occupied day
      // without creating Production HOLDs/bookings.
      await page.goto("/app/bookings?filter=upcoming", { waitUntil: "domcontentloaded" });
      let scheduleEntry = page.locator('[data-booking-row][data-booking-status="CONFIRMED"]').first();
      if ((await scheduleEntry.count()) === 0) {
        scheduleEntry = page.locator("[data-booking-row]").first();
      }
      if ((await scheduleEntry.count()) === 0) {
        await page.goto("/app/bookings?filter=past", { waitUntil: "domcontentloaded" });
        scheduleEntry = page
          .locator('[data-booking-row][data-booking-status="CONFIRMED"]')
          .first();
      }
      test.skip((await scheduleEntry.count()) === 0, "No synthetic bookings to derive a schedule date");

      await scheduleEntry.click();
      await page.waitForURL(/\/app\/bookings\/[^/?]+/);
      await expect(page.locator("[data-booking-detail]")).toBeVisible();
      const viewSchedule = page.getByRole("link", { name: /View on Schedule/i });
      test.skip((await viewSchedule.count()) === 0, "Booking detail missing View on Schedule link");
      await viewSchedule.click();
      await page.waitForURL(/\/app\/schedule/);

      await expect(page.locator("[data-master-schedule-board]")).toBeVisible();
      await expect(page.getByText(/HOLD — temporary, not confirmed/i)).toBeVisible();
      await expect(page.getByRole("heading", { name: "Pending confirmation" })).toBeVisible();
      await expect(page.getByText(/do not occupy the schedule until confirmed/i)).toBeVisible();
      await expect(page.getByText(/\bunpaid\b/i)).toHaveCount(0);

      const hold = page.locator('[data-schedule-block="hold"]').first();
      const booked = page.locator('[data-schedule-block="booked"]').first();
      let found: "hold" | "booked" | null = null;
      if ((await hold.count()) > 0) {
        await hold.click();
        found = "hold";
      } else if ((await booked.count()) > 0) {
        await booked.click();
        found = "booked";
      }

      test.skip(
        !found,
        "Synthetic booking schedule day has no HOLD/Booked block (pending-only / empty occupancy)",
      );

      const detail = page.locator(`[data-schedule-detail="${found}"]`);
      await expect(detail).toBeVisible({ timeout: 10_000 });
      if (found === "hold") {
        await expect(detail.getByText(/HOLD — temporary/i)).toBeVisible();
        await expect(detail.getByText(/Booked — confirmed/i)).toHaveCount(0);
        await expect(detail.getByRole("link", { name: /Open inquiry/i })).toBeVisible();
      } else {
        await expect(detail.getByText(/Booked — confirmed/i)).toBeVisible();
        await expect(detail.getByText(/HOLD — temporary/i)).toHaveCount(0);
        const openBooking = detail.getByRole("link", { name: /Open booking/i });
        if ((await openBooking.count()) > 0) {
          await openBooking.click();
          await page.waitForURL(/\/app\/bookings\//);
          await expect(page.locator("[data-booking-detail]")).toBeVisible();
        }
      }
    });

    test("Front Desk: schedule deep-link cannot open create dialog", async ({ page }, testInfo) => {
      test.skip(!deskAuth.ok, deskAuth.ok ? "" : deskAuth.reason);
      const projectRole = roleFromProjectName(testInfo.project.name);
      if (projectRole && projectRole !== "front_desk") {
        test.skip(true, "Front Desk schedule under employee-front-desk");
      }

      await page.setViewportSize({ width: 1440, height: 900 });
      await ensureTestCenterB(page);
      await page.goto("/app/schedule?focus=booked&builder=inq_not_allowed", {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator("[data-master-schedule-board]")).toBeVisible();
      await expect(page.getByRole("button", { name: /Create Event/i })).toHaveCount(0);
      await expect(page.locator("[data-create-event-dialog]")).toHaveCount(0);
    });

    for (const vp of VIEWPORTS) {
      test(`inquiry + schedule copy remains usable at ${vp.width}px`, async ({ page }, testInfo) => {
        test.skip(!adminAuth.ok, adminAuth.ok ? "" : adminAuth.reason);
        const projectRole = roleFromProjectName(testInfo.project.name);
        if (projectRole && projectRole !== "administrator") {
          test.skip(true, "Responsive copy under employee-admin");
        }

        await page.setViewportSize({ width: vp.width, height: vp.height });
        await ensureTestCenterB(page);
        await page.goto("/app/schedule", { waitUntil: "domcontentloaded" });
        expect(await documentHasHorizontalOverflow(page)).toBe(false);
        await expect(page.getByText(/do not occupy the schedule until confirmed/i)).toBeVisible();

        await page.goto("/app/bookings", { waitUntil: "domcontentloaded" });
        expect(await documentHasHorizontalOverflow(page)).toBe(false);
      });
    }
  },
);
