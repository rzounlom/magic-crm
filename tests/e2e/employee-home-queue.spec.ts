import { expect, test } from "@playwright/test";

import {
  resolveE2ERoleAuth,
  resolveE2EWpInquiry,
} from "./helpers/e2e-auth";
import {
  ensureTestCenterB,
  e2eBaseURL,
  expectNoServerErrorChrome,
  roleFromProjectName,
} from "./helpers/employee-shell";
import { resolveStaffInquiryFixture } from "./helpers/staff-fixture";

const adminAuth = resolveE2ERoleAuth("administrator");
const salesAuth = resolveE2ERoleAuth("event_sales");
const wp = resolveE2EWpInquiry();
const la = resolveStaffInquiryFixture();

test.describe("employee home → queue workflows", { tag: ["@phase-12j", "@employee-home"] }, () => {
  test.skip(!adminAuth.ok, adminAuth.ok ? "" : adminAuth.reason);

  test.use({ storageState: adminAuth.ok ? adminAuth.storageStatePath : undefined });

  test.beforeEach(({ }, testInfo) => {
    const projectRole = roleFromProjectName(testInfo.project.name);
    if (projectRole && projectRole !== "administrator") {
      test.skip(true, `Admin home/queue runs under employee-admin only`);
    }
  });

  test("attention tiles deep-link to matching queue focus sections", async ({ page }) => {
    await ensureTestCenterB(page);
    await expect(page.locator("[data-employee-dashboard]")).toBeVisible();

    const review = page.getByRole("link", { name: /Awaiting staff review/i });
    const pending = page.getByRole("link", { name: /Pending confirmation/i });
    const unread = page.getByRole("link", { name: /Unread/i });

    // Do not hardcode counts — only follow tiles that the dashboard actually renders.
    if ((await review.count()) > 0) {
      const countText = (await review.locator(".attention-tile-count").innerText()).trim();
      expect(Number(countText)).toBeGreaterThan(0);
      await review.click();
      await page.waitForURL(/focus=review/);
      await expect(page.locator("#ready-for-live-agent")).toBeVisible({ timeout: 15_000 });
      await page.goto("/app", { waitUntil: "domcontentloaded" });
    }

    if ((await pending.count()) > 0) {
      const countText = (await pending.locator(".attention-tile-count").innerText()).trim();
      expect(Number(countText)).toBeGreaterThan(0);
      await pending.click();
      await page.waitForURL(/focus=pending/);
      await expect(page.locator("#pending-confirmation")).toBeVisible({ timeout: 15_000 });
      await page.goto("/app", { waitUntil: "domcontentloaded" });
    }

    if ((await unread.count()) > 0) {
      const countText = (await unread.locator(".attention-tile-count").innerText()).trim();
      expect(Number(countText)).toBeGreaterThan(0);
      await unread.click();
      await page.waitForURL(/focus=unread/);
      await expect(page.locator("#inquiry-queue-top")).toBeVisible({ timeout: 15_000 });
    }
  });

  test("Active and Archived inquiry views are reachable", async ({ page }) => {
    await ensureTestCenterB(page);
    await page.goto("/app/inquiries", { waitUntil: "domcontentloaded" });
    await expectNoServerErrorChrome(page);

    const views = page.getByRole("navigation", { name: /Inquiry views/i });
    await expect(views).toBeVisible();
    await expect(views.getByRole("link", { name: /^Active$/i })).toBeVisible();
    await views.getByRole("link", { name: /^Archived$/i }).click();
    await page.waitForURL(/view=archived/);
    await expect(views.getByRole("link", { name: /^Archived$/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const active = views.getByRole("link", { name: /^Active$/i });
    await expect(active).toHaveAttribute("href", "/app/inquiries");
    await Promise.all([
      page.waitForURL((url) => {
        const u = typeof url === "string" ? new URL(url) : new URL(url.href);
        return u.pathname === "/app/inquiries" && u.searchParams.get("view") !== "archived";
      }),
      active.click(),
    ]);
    await expect(active).toHaveAttribute("aria-current", "page");
  });

  test("queue card opens inquiry and back returns to queue", async ({ page }) => {
    test.skip(!wp.ok, wp.ok ? "" : wp.reason);
    if (!wp.ok) return;

    await ensureTestCenterB(page);
    await page.goto("/app/inquiries", { waitUntil: "networkidle" });
    const cardLink = page
      .locator(`a[href="${wp.fixture.inquiryPath}"], a[href*="${wp.fixture.inquiryId}"]`)
      .first();
    if ((await cardLink.count()) === 0) {
      // Fixture inquiry may be outside Active queue sections — open via Review inquiries / direct.
      await page.goto(wp.fixture.inquiryPath, { waitUntil: "domcontentloaded" });
    } else {
      await cardLink.click();
      await page.waitForURL(new RegExp(wp.fixture.inquiryId));
    }

    await expectNoServerErrorChrome(page);
    await expect(page.getByRole("link", { name: /Back to inquiries/i })).toBeVisible();
    await page.getByRole("link", { name: /Back to inquiries/i }).click();
    await page.waitForURL(/\/app\/inquiries/);
    await expect(page.getByRole("navigation", { name: /Inquiry views/i })).toBeVisible();
  });
});

test.describe(
  "employee home — Event Sales attention access",
  { tag: ["@phase-12j", "@employee-home"] },
  () => {
    test.skip(!salesAuth.ok, salesAuth.ok ? "" : salesAuth.reason);
    test.use({ storageState: salesAuth.ok ? salesAuth.storageStatePath : undefined });

    test.beforeEach(({ }, testInfo) => {
      const projectRole = roleFromProjectName(testInfo.project.name);
      if (projectRole && projectRole !== "event_sales") {
        test.skip(true, `Event Sales home runs under employee-event-sales only`);
      }
    });

    test("Event Sales sees dashboard attention when inquiries are permitted", async ({ page }) => {
      await ensureTestCenterB(page);
      await expect(page.locator("[data-employee-dashboard]")).toBeVisible();
      // Event Sales has inquiries.view — Needs attention panel may be empty or populated.
      const body = await page.locator("body").innerText();
      expect(body).toMatch(/Needs attention|caught up|Today|Bookings|Inquiries/i);
      expect(page.url()).not.toContain("sign-in");
    });
  },
);

test.describe(
  "employee fixtures org guard",
  { tag: ["@phase-12j", "@employee-home"] },
  () => {
    test("WP and LA fixtures stay on synthetic Test Center B", async () => {
      if (wp.ok) {
        expect(wp.fixture.organizationSlug).toBe("magiccrm-test-center-b");
      }
      if (la.ok) {
        expect(la.fixture.organizationSlug).toBe("magiccrm-test-center-b");
      }
      expect(e2eBaseURL()).toContain("localhost");
      expect(e2eBaseURL()).not.toContain("127.0.0.1");
    });
  },
);
