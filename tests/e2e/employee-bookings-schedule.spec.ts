import { expect, test } from "@playwright/test";

import { resolveE2ERoleAuth } from "./helpers/e2e-auth";
import {
  documentHasHorizontalOverflow,
  ensureTestCenterB,
  expectNoServerErrorChrome,
  roleFromProjectName,
} from "./helpers/employee-shell";

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const adminAuth = resolveE2ERoleAuth("administrator");
const salesAuth = resolveE2ERoleAuth("event_sales");
const deskAuth = resolveE2ERoleAuth("front_desk");

test.describe("employee bookings + master schedule UX", { tag: ["@phase-12l", "@employee-bookings"] }, () => {
  test("Administrator: bookings list hierarchy, filters, and schedule HOLD/Booked separation", async ({
    page,
  }, testInfo) => {
    test.skip(!adminAuth.ok, adminAuth.ok ? "" : adminAuth.reason);
    const projectRole = roleFromProjectName(testInfo.project.name);
    if (projectRole && projectRole !== "administrator") {
      test.skip(true, "Admin bookings/schedule UX runs under employee-admin");
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await ensureTestCenterB(page);

    await page.goto("/app/bookings", { waitUntil: "domcontentloaded" });
    await expectNoServerErrorChrome(page);
    await expect(page.getByRole("heading", { name: /^Bookings$/i })).toBeVisible();
    await expect(page.locator("[data-bookings-list]")).toBeVisible();
    const filters = page.getByRole("navigation", { name: /Booking filters/i });
    await expect(filters.getByRole("link", { name: /Upcoming/i })).toBeVisible();
    await expect(filters.getByRole("link", { name: /Pending confirmation/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /New Booking/i })).toBeVisible();

    const firstRow = page.locator("[data-booking-row]").first();
    if ((await firstRow.count()) > 0) {
      await firstRow.click();
      await page.waitForURL(/\/app\/bookings\//);
      await expect(page.locator("[data-booking-detail]")).toBeVisible();
      await expect(page.locator("[data-booking-next-action]")).toBeVisible();
      await expect(page.getByRole("link", { name: /View on Schedule/i })).toBeVisible();
      await page.getByRole("link", { name: /View on Schedule/i }).click();
      await page.waitForURL(/\/app\/schedule/);
    } else {
      await page.goto("/app/schedule", { waitUntil: "domcontentloaded" });
    }

    await expectNoServerErrorChrome(page);
    await expect(page.getByRole("heading", { name: /Master Schedule/i })).toBeVisible();
    await expect(page.locator("[data-master-schedule-board]")).toBeVisible();
    await expect(page.getByText(/HOLD — temporary, not confirmed/i)).toBeVisible();
    await expect(page.getByText(/Booked — confirmed occupancy/i)).toBeVisible();
    await expect(page.getByText(/occupied today \(holds \+ booked\)/i).first()).toBeVisible();

    const holdsFilter = page.getByRole("button", { name: /^Holds$/i });
    await expect(holdsFilter).toBeVisible();
    await holdsFilter.click();
    await page.waitForURL(/focus=holds/);
    await expect(holdsFilter).toHaveAttribute("aria-pressed", "true");

    const bookedFilter = page.getByRole("button", { name: /^Booked$/i });
    await bookedFilter.click();
    await page.waitForURL(/focus=booked/);
    await expect(bookedFilter).toHaveAttribute("aria-pressed", "true");

    // Deep-link alias: type → focus presentation (synthetic param only).
    await page.goto("/app/schedule?focus=holds&start=17:00", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /^Holds$/i })).toHaveAttribute("aria-pressed", "true");
  });

  test("Event Sales: bookings + schedule reachable with create controls", async ({ page }, testInfo) => {
    test.skip(!salesAuth.ok, salesAuth.ok ? "" : salesAuth.reason);
    const projectRole = roleFromProjectName(testInfo.project.name);
    if (projectRole && projectRole !== "event_sales") {
      test.skip(true, "Event Sales bookings/schedule UX runs under employee-event-sales");
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await ensureTestCenterB(page);

    await page.goto("/app/bookings", { waitUntil: "domcontentloaded" });
    await expectNoServerErrorChrome(page);
    await expect(page.locator("[data-bookings-list]")).toBeVisible();
    await expect(page.getByRole("link", { name: /New Booking/i })).toBeVisible();

    await page.goto("/app/schedule", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-master-schedule-board]")).toBeVisible();
    await expect(page.getByRole("button", { name: /Create Event/i })).toBeVisible();
    await expect(page.getByText(/HOLD — temporary, not confirmed/i)).toBeVisible();
  });

  test("Front Desk: bookings + schedule view without create CTAs", async ({ page }, testInfo) => {
    test.skip(!deskAuth.ok, deskAuth.ok ? "" : deskAuth.reason);
    const projectRole = roleFromProjectName(testInfo.project.name);
    if (projectRole && projectRole !== "front_desk") {
      test.skip(true, "Front Desk bookings/schedule UX runs under employee-front-desk");
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await ensureTestCenterB(page);

    await page.goto("/app/bookings", { waitUntil: "domcontentloaded" });
    await expectNoServerErrorChrome(page);
    await expect(page.locator("[data-bookings-list]")).toBeVisible();
    await expect(page.getByRole("link", { name: /New Booking/i })).toHaveCount(0);

    await page.goto("/app/schedule", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-master-schedule-board]")).toBeVisible();
    await expect(page.getByRole("button", { name: /Create Event/i })).toHaveCount(0);
    await expect(page.getByText(/HOLD — temporary, not confirmed/i)).toBeVisible();
  });

  test("Home → Bookings → Schedule continuity (Administrator)", async ({ page }, testInfo) => {
    test.skip(!adminAuth.ok, adminAuth.ok ? "" : adminAuth.reason);
    const projectRole = roleFromProjectName(testInfo.project.name);
    if (projectRole && projectRole !== "administrator") {
      test.skip(true, "Continuity check under employee-admin");
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await ensureTestCenterB(page);

    await expect(page.locator("[data-employee-dashboard]")).toBeVisible();
    await page.getByRole("link", { name: /^Bookings$/i }).first().click();
    await page.waitForURL(/\/app\/bookings/);
    await expect(page.locator("[data-bookings-list]")).toBeVisible();

    await page.getByRole("link", { name: /^Schedule$/i }).first().click();
    await page.waitForURL(/\/app\/schedule/);
    await expect(page.locator("[data-master-schedule-board]")).toBeVisible();

    await page.getByRole("link", { name: /^Inquiries$/i }).first().click();
    await page.waitForURL(/\/app\/inquiries/);
    await expectNoServerErrorChrome(page);
  });

  for (const vp of VIEWPORTS) {
    test(`no unintended document overflow on bookings/schedule at ${vp.width}px`, async ({ page }, testInfo) => {
      test.skip(!adminAuth.ok, adminAuth.ok ? "" : adminAuth.reason);
      const projectRole = roleFromProjectName(testInfo.project.name);
      if (projectRole && projectRole !== "administrator") {
        test.skip(true, "Responsive overflow under employee-admin");
      }

      await page.setViewportSize({ width: vp.width, height: vp.height });
      await ensureTestCenterB(page);

      await page.goto("/app/bookings", { waitUntil: "domcontentloaded" });
      await expectNoServerErrorChrome(page);
      expect(await documentHasHorizontalOverflow(page)).toBe(false);

      await page.goto("/app/schedule", { waitUntil: "domcontentloaded" });
      await expectNoServerErrorChrome(page);
      expect(await documentHasHorizontalOverflow(page)).toBe(false);

      if (vp.width >= 768) {
        const timeline = page.locator("[data-schedule-timeline]");
        if ((await timeline.count()) > 0) {
          await expect(timeline).toBeVisible();
        }
      } else {
        // Mobile uses list when events exist; empty day still shows EmptyState without overflow.
        await expect(page.locator("[data-master-schedule-board]")).toBeVisible();
      }
    });
  }

  test("schedule filters are keyboard-reachable", async ({ page }, testInfo) => {
    test.skip(!adminAuth.ok, adminAuth.ok ? "" : adminAuth.reason);
    const projectRole = roleFromProjectName(testInfo.project.name);
    if (projectRole && projectRole !== "administrator") {
      test.skip(true, "Keyboard a11y under employee-admin");
    }

    await page.setViewportSize({ width: 1024, height: 768 });
    await ensureTestCenterB(page);
    await page.goto("/app/schedule", { waitUntil: "domcontentloaded" });

    const toolbar = page.getByRole("toolbar", { name: /Schedule filters/i });
    await expect(toolbar).toBeVisible();
    const first = toolbar.getByRole("button").first();
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBe("BUTTON");
  });
});
