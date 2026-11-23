import { expect, test } from "@playwright/test";

import { resolveE2ERoleAuth } from "./helpers/e2e-auth";
import {
  ensureTestCenterB,
  expectNoServerErrorChrome,
  roleFromProjectName,
} from "./helpers/employee-shell";

const adminAuth = resolveE2ERoleAuth("administrator");
const salesAuth = resolveE2ERoleAuth("event_sales");
const deskAuth = resolveE2ERoleAuth("front_desk");

/**
 * Phase 12M security acceptance for PR #30.
 * Verifies server-rendered permission panels and deep-link presentation —
 * not UI-only inference from hidden buttons.
 */
test.describe(
  "employee bookings/schedule security acceptance",
  { tag: ["@phase-12m", "@employee-bookings-security"] },
  () => {
    test("Front Desk: /app/bookings/new is denied server-side (not only hidden CTA)", async ({
      page,
    }, testInfo) => {
      test.skip(!deskAuth.ok, deskAuth.ok ? "" : deskAuth.reason);
      const projectRole = roleFromProjectName(testInfo.project.name);
      if (projectRole && projectRole !== "front_desk") {
        test.skip(true, "Front Desk new-booking denial under employee-front-desk");
      }

      await page.setViewportSize({ width: 1440, height: 900 });
      await ensureTestCenterB(page);

      await page.goto("/app/bookings/new", { waitUntil: "domcontentloaded" });
      await expectNoServerErrorChrome(page);
      await expect(page.getByRole("heading", { name: /New Booking/i })).toBeVisible();
      await expect(
        page.getByText(/permission to create bookings and manage inquiries/i),
      ).toBeVisible();
      await expect(page.locator("form")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Create|Start booking|Submit/i })).toHaveCount(0);
    });

    test("Event Sales: /app/bookings/new loads create surface when permitted", async ({
      page,
    }, testInfo) => {
      test.skip(!salesAuth.ok, salesAuth.ok ? "" : salesAuth.reason);
      const projectRole = roleFromProjectName(testInfo.project.name);
      if (projectRole && projectRole !== "event_sales") {
        test.skip(true, "Event Sales new-booking under employee-event-sales");
      }

      await page.setViewportSize({ width: 1440, height: 900 });
      await ensureTestCenterB(page);
      await page.goto("/app/bookings/new", { waitUntil: "domcontentloaded" });
      await expectNoServerErrorChrome(page);
      await expect(page.getByRole("heading", { name: /^New Booking$/i })).toBeVisible();
      await expect(
        page.getByText(/permission to create bookings and manage inquiries/i),
      ).toHaveCount(0);
    });

    test("Administrator: invalid schedule deep-links fail safe without writes", async ({
      page,
    }, testInfo) => {
      test.skip(!adminAuth.ok, adminAuth.ok ? "" : adminAuth.reason);
      const projectRole = roleFromProjectName(testInfo.project.name);
      if (projectRole && projectRole !== "administrator") {
        test.skip(true, "Deep-link safety under employee-admin");
      }

      await page.setViewportSize({ width: 1440, height: 900 });
      await ensureTestCenterB(page);

      await page.goto("/app/schedule?type=not-a-real-resource-type&start=99:99", {
        waitUntil: "domcontentloaded",
      });
      await expectNoServerErrorChrome(page);
      await expect(page.locator("[data-master-schedule-board]")).toBeVisible();
      // Unknown type falls back to All; invalid start is ignored (no crash, no highlight).
      await expect(page.getByRole("button", { name: /All resources/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.locator("[data-schedule-highlight-slot]")).toHaveCount(0);

      await page.goto("/app/schedule?type=holds&start=17:00", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("button", { name: /^Holds$/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      // Presentation only — board remains read surface; Create Event does not auto-open.
      await expect(page.locator("[data-create-event-dialog]")).toHaveCount(0);
    });

    test("Front Desk: schedule deep-link cannot escalate to create", async ({ page }, testInfo) => {
      test.skip(!deskAuth.ok, deskAuth.ok ? "" : deskAuth.reason);
      const projectRole = roleFromProjectName(testInfo.project.name);
      if (projectRole && projectRole !== "front_desk") {
        test.skip(true, "Front Desk deep-link under employee-front-desk");
      }

      await page.setViewportSize({ width: 1440, height: 900 });
      await ensureTestCenterB(page);
      await page.goto("/app/schedule?focus=booked&start=17:00&builder=inq_fake", {
        waitUntil: "domcontentloaded",
      });
      await expectNoServerErrorChrome(page);
      await expect(page.locator("[data-master-schedule-board]")).toBeVisible();
      await expect(page.getByRole("button", { name: /Create Event/i })).toHaveCount(0);
      await expect(page.locator("[data-create-event-dialog]")).toHaveCount(0);
    });

    test("HOLD legend conveys meaning without relying on color alone", async ({
      page,
    }, testInfo) => {
      test.skip(!adminAuth.ok, adminAuth.ok ? "" : adminAuth.reason);
      const projectRole = roleFromProjectName(testInfo.project.name);
      if (projectRole && projectRole !== "administrator") {
        test.skip(true, "HOLD legend under employee-admin");
      }

      await page.setViewportSize({ width: 1440, height: 900 });
      await ensureTestCenterB(page);
      await page.goto("/app/schedule", { waitUntil: "domcontentloaded" });
      const legend = page.getByRole("list", { name: /Occupancy legend/i });
      await expect(legend).toBeVisible();
      await expect(legend.getByText(/HOLD — temporary, not confirmed/i)).toBeVisible();
      await expect(legend.getByText(/Booked — confirmed occupancy/i)).toBeVisible();
      await expect(page.getByText(/occupied today \(holds \+ booked\)/i).first()).toBeVisible();
    });

    test("Administrator booking filters remain keyboard reachable", async ({ page }, testInfo) => {
      test.skip(!adminAuth.ok, adminAuth.ok ? "" : adminAuth.reason);
      const projectRole = roleFromProjectName(testInfo.project.name);
      if (projectRole && projectRole !== "administrator") {
        test.skip(true, "Booking filter a11y under employee-admin");
      }

      await page.setViewportSize({ width: 1024, height: 768 });
      await ensureTestCenterB(page);
      await page.goto("/app/bookings", { waitUntil: "domcontentloaded" });
      const filters = page.getByRole("navigation", { name: /Booking filters/i });
      await expect(filters).toBeVisible();
      const first = filters.getByRole("link").first();
      await first.focus();
      await expect(first).toBeFocused();
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/app\/bookings/);
      await expectNoServerErrorChrome(page);
    });
  },
);
