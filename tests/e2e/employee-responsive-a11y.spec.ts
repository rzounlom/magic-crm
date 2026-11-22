import { expect, test } from "@playwright/test";

import { resolveE2ERoleAuth, resolveE2EWpInquiry } from "./helpers/e2e-auth";
import {
  documentHasHorizontalOverflow,
  ensureTestCenterB,
  expectNoServerErrorChrome,
} from "./helpers/employee-shell";
import { openStaffMoreMenu } from "./helpers/staff-mobile-nav";

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const auth = resolveE2ERoleAuth("administrator");
const wp = resolveE2EWpInquiry();

test.describe(
  "employee responsive + accessibility smoke",
  { tag: ["@phase-12j", "@employee-responsive"] },
  () => {
    test.skip(!auth.ok, auth.ok ? "" : auth.reason);
    test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

    for (const vp of VIEWPORTS) {
      test(`no unintended horizontal overflow at ${vp.width}px`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await ensureTestCenterB(page);
        await expectNoServerErrorChrome(page);
        expect(await documentHasHorizontalOverflow(page)).toBe(false);

        await page.goto("/app/inquiries", { waitUntil: "domcontentloaded" });
        await expectNoServerErrorChrome(page);
        expect(await documentHasHorizontalOverflow(page)).toBe(false);
      });
    }

    test("mobile More sheet opens, closes, and restores focus", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await ensureTestCenterB(page);

      const primary = page.getByRole("navigation", { name: "Primary" });
      test.skip((await primary.count()) === 0, "Mobile primary nav not present");

      const { more, dialog } = await openStaffMoreMenu(page);
      await expect(dialog.getByRole("link").first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(more).toBeFocused();
    });

    test("inquiry queue cards use 10px gap (gap-2.5)", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await ensureTestCenterB(page);
      await page.goto("/app/inquiries", { waitUntil: "networkidle" });

      const list = page.locator("ul.inquiry-queue-list").first();
      if ((await list.count()) === 0) {
        test.skip(true, "No inquiry queue list on Active view");
      }
      const gap = await list.evaluate((el) => getComputedStyle(el).gap || getComputedStyle(el).rowGap);
      // Tailwind gap-2.5 → 0.625rem = 10px at default root.
      expect(gap === "10px" || gap === "0.625rem").toBeTruthy();
    });

    test("inquiry tabs are keyboard-focusable with usable labels", async ({ page }) => {
      test.skip(!wp.ok, wp.ok ? "" : wp.reason);
      if (!wp.ok) return;

      await page.setViewportSize({ width: 1024, height: 768 });
      await ensureTestCenterB(page);
      await page.goto(wp.fixture.inquiryPath, { waitUntil: "networkidle" });
      await expectNoServerErrorChrome(page);

      const tabs = page.locator("[data-employee-inquiry-tabs]");
      await expect(tabs).toBeVisible();
      const staff = tabs.getByRole("tab", { name: /Staff quote/i });
      await staff.focus();
      await expect(staff).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(staff).toHaveAttribute("aria-selected", "true");

      // Form labels on staff quote when draft present
      const unit = page.locator("input[name^='lineUnitPriceDollars_']").first();
      if ((await unit.count()) > 0) {
        const label = page.locator("label").filter({ hasText: /Unit price/i }).first();
        await expect(label).toBeVisible();
        await unit.focus();
        await expect(unit).toBeFocused();
      }
    });

    test("console has no reproducible hydration mismatch on /app", async ({ page }) => {
      const hydration: string[] = [];
      page.on("console", (msg) => {
        const text = msg.text();
        if (/hydrat/i.test(text)) hydration.push(text);
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await ensureTestCenterB(page);
      await page.goto("/app", { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      expect(hydration, hydration.join("\n")).toEqual([]);
    });
  },
);
