import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { resolveStaffAuth, staffAuthSkipReason } from "./helpers/staff-auth";
import { resolveStaffInquiryFixture } from "./helpers/staff-fixture";
import { openStaffMoreMenu } from "./helpers/staff-mobile-nav";

const auth = resolveStaffAuth();
const fixture = resolveStaffInquiryFixture();
const evidenceDir = path.join("docs", "release", "r3-evidence");

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
] as const;

test.describe("Scenario F — Responsive staff UX", { tag: "@staff-responsive" }, () => {
  test.skip(!auth.ok, staffAuthSkipReason());

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  for (const viewport of VIEWPORTS) {
    test(`staff shell at ${viewport.name}px has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/app", { waitUntil: "domcontentloaded" });
      if (page.url().includes("sign-in")) {
        test.skip(true, "Storage state expired — regenerate with pnpm test:e2e:staff:auth");
      }

      await expect(page.getByRole("navigation").or(page.getByRole("banner")).first()).toBeVisible();
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          clientWidth: doc.clientWidth,
          scrollWidth: doc.scrollWidth,
        };
      });
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

      const mobilePrimary = page.locator("[data-employee-mobile-nav]");
      if (viewport.width >= 1024) {
        await expect(mobilePrimary).toBeHidden();
      } else if (viewport.width <= 390) {
        await expect(mobilePrimary).toBeVisible();
        const { dialog } = await openStaffMoreMenu(page);
        await expect(
          dialog
            .getByRole("link", { name: /public inquiry|sales knowledge|overview|team|resources/i })
            .first(),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
      }

      fs.mkdirSync(evidenceDir, { recursive: true });
      await page.screenshot({
        path: path.join(evidenceDir, `staff-shell-${viewport.name}.png`),
        fullPage: true,
      });
    });
  }

  test("inquiry detail primary actions remain reachable at 390px", async ({ page }) => {
    test.skip(!fixture.ok, fixture.ok ? "" : fixture.reason);
    if (!fixture.ok) return;

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(fixture.fixture.inquiryPath);
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired");
    }

    const holdOrConfirm = page.locator("#hold-readiness, #confirmation-readiness").first();
    await expect(holdOrConfirm).toBeVisible({ timeout: 15_000 });
    await holdOrConfirm.scrollIntoViewIfNeeded();

    const layout = await page.evaluate(() => {
      const doc = document.documentElement;
      const actionBar = document.querySelector("[data-booking-mobile-action-bar]");
      const mobileNav = document.querySelector("[data-employee-mobile-nav]");
      const readiness = document.querySelector("#hold-readiness, #confirmation-readiness");
      const actionBox = actionBar?.getBoundingClientRect();
      const navBox = mobileNav?.getBoundingClientRect();
      const readyBox = readiness?.getBoundingClientRect();
      return {
        overflow: doc.scrollWidth - doc.clientWidth,
        actionTop: actionBox?.top ?? null,
        navTop: navBox?.top ?? null,
        readyBottom: readyBox?.bottom ?? null,
        actionDisplay: actionBar ? getComputedStyle(actionBar).display : null,
      };
    });
    expect(layout.overflow).toBeLessThanOrEqual(1);
    if (layout.actionTop != null && layout.navTop != null) {
      expect(layout.actionTop).toBeLessThanOrEqual(layout.navTop + 1);
    }

    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({
      path: path.join(evidenceDir, "staff-inquiry-390.png"),
      fullPage: true,
    });
  });
});
