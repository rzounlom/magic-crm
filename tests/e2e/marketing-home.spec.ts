import fs from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SCREENSHOT_DIR = path.join(process.cwd(), "docs/design/ux10-screenshots");

async function assertNoHorizontalOverflow(page: Page) {
  const overflowX = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return Math.max(doc.scrollWidth, body.scrollWidth) - window.innerWidth;
  });
  expect(overflowX, "page should not scroll horizontally").toBeLessThanOrEqual(1);
}

test.describe("marketing homepage", () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test("loads without authentication and shows hero CTAs", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    const response = await page.goto("/");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/extraordinary/i);
    await expect(page.getByRole("link", { name: "Explore the platform" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Employee sign in" }).first()).toBeVisible();
    await expect(page.locator('img[alt*="customer event intake"]').first()).toBeVisible();
    expect(errors).toEqual([]);
    await assertNoHorizontalOverflow(page);
  });

  test("employee sign in navigates to Clerk sign-in", async ({ page }) => {
    await page.goto("/");
    const desktopLink = page.getByRole("banner").getByRole("link", { name: "Employee sign in" });
    if (await desktopLink.isVisible()) {
      await desktopLink.click();
    } else {
      await page.getByRole("button", { name: "Open menu" }).click();
      await page.getByRole("navigation", { name: "Mobile primary" }).getByRole("link", { name: "Employee sign in" }).click();
    }
    await page.waitForURL(/sign-in/);
    expect(page.url()).toMatch(/sign-in/);
  });

  test("mobile menu opens and closes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("navigation", { name: "Mobile primary" })).toBeVisible();
    await page.getByRole("button", { name: "Close menu" }).click();
    await expect(page.getByRole("navigation", { name: "Mobile primary" })).toHaveCount(0);
  });

  test("feature showcase switches with keyboard", async ({ page }) => {
    await page.goto("/");
    const timing = page.getByRole("tab", { name: "Timing" });
    await timing.click();
    await expect(timing).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: /Venue-local date and time/i })).toBeVisible();
    await timing.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Mobile" })).toHaveAttribute("aria-selected", "true");
  });

  test("viewport matrix has no horizontal overflow", async ({ page }) => {
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    }
  });

  test("captures representative marketing screenshots", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "home-1440.png"), fullPage: true });

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "home-768.png"), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "home-390.png"), fullPage: true });
  });

  test("reduced-motion disables hero entrance animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const animation = await page.locator(".marketing-reveal").first().evaluate((node) => {
      return getComputedStyle(node).animationName;
    });
    expect(animation === "none" || animation === "").toBeTruthy();
  });

  test("has no critical or serious axe violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const blocking = results.violations.filter((row) => row.impact === "critical" || row.impact === "serious");
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
