import { expect, test, type Page } from "@playwright/test";

/**
 * Browser interaction tests for WP public inquiry section navigation.
 * Skips when PLAYWRIGHT_PUBLIC_ORG_SLUG is unset. Never submits a Production inquiry.
 */
const slug = process.env.PLAYWRIGHT_PUBLIC_ORG_SLUG;
const isProductionHost = /magic-crm-eta\.vercel\.app/i.test(process.env.PLAYWRIGHT_BASE_URL ?? "");

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "430", width: 430, height: 932 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const;

async function assertNoHorizontalOverflow(page: Page) {
  const overflowX = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return Math.max(doc.scrollWidth, body.scrollWidth) - window.innerWidth;
  });
  expect(overflowX, "page should not scroll horizontally").toBeLessThanOrEqual(1);
}

async function fillContact(page: Page) {
  await page.getByLabel(/First name/i).fill("Ada");
  await page.getByLabel(/Last name/i).fill("Lovelace");
  await page.getByLabel(/Business \/ organization/i).fill("Analytical Engines");
  await page.getByLabel(/^Phone/i).fill("5745550100");
  await page.getByLabel(/^Email/i).fill("ada@example.com");
}

test.describe("WP public inquiry navigation", () => {
  test.skip(!slug, "Set PLAYWRIGHT_PUBLIC_ORG_SLUG for a non-production inquire host");
  test.skip(isProductionHost, "Do not run navigation submits against Production");

  for (const viewport of VIEWPORTS) {
    test(`idle form has no overflow at ${viewport.name}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/inquire/${slug}`);
      await expect(page.getByRole("heading", { name: "Plan your event" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Contact information" })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });
  }

  test("completing contact scrolls to event details", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/inquire/${slug}`);
    await fillContact(page);
    await page.getByLabel(/^Email/i).blur();

    await expect(page.getByRole("heading", { name: "Event details" })).toBeInViewport({
      ratio: 0.4,
    });
  });

  test("invalid submit navigates to the first incomplete section", async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto(`/inquire/${slug}`);
    await fillContact(page);
    await page.getByLabel(/^Email/i).blur();
    await expect(page.getByRole("heading", { name: "Event details" })).toBeInViewport({
      ratio: 0.2,
    });

    // Jump to footer and attempt submit with remaining sections empty.
    await page.getByRole("button", { name: /Submit event request/i }).click();

    await expect(page.getByRole("heading", { name: "Event details" })).toBeInViewport({
      ratio: 0.2,
    });
    await expect(page.getByLabel(/First name/i)).toHaveValue("Ada");
    await expect(page.getByLabel(/^Email/i)).toHaveValue("ada@example.com");
  });
});
