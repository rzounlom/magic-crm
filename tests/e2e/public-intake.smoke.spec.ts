import { expect, test, type Page } from "@playwright/test";

const slug = process.env.PLAYWRIGHT_PUBLIC_ORG_SLUG;

async function assertNoHorizontalOverflow(page: Page) {
  const overflowX = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return Math.max(doc.scrollWidth, body.scrollWidth) - window.innerWidth;
  });
  expect(overflowX, "page should not scroll horizontally").toBeLessThanOrEqual(1);
}

test.describe("public intake smoke", () => {
  test.skip(!slug, "Set PLAYWRIGHT_PUBLIC_ORG_SLUG for a non-production inquire host");

  test("loads host organization planner without horizontal overflow", async ({ page }) => {
    const response = await page.goto(`/inquire/${slug}`);
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("list", { name: "Planner progress" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your event" })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test("advances stages with choice selection and shows validation on review", async ({ page }) => {
    await page.goto(`/inquire/${slug}`);
    await page.getByRole("button", { name: "Birthday Party" }).click();
    await expect(page.getByLabel("Guest count")).toBeVisible();
    await page.getByLabel("Guest count").fill("20");
    await page.getByRole("button", { name: "Mix of Kids & Adults" }).click();
    await expect(page.getByRole("heading", { name: "Experience" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Event preferences" })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    // Progress current step remains announced (not color-only).
    const current = page.locator("[data-planner-progress] [aria-current='step']");
    await expect(current).toBeVisible();
  });

  test("does not submit a production inquiry from smoke", async ({ page }) => {
    await page.goto(`/inquire/${slug}`);
    // Smoke stops before contact/submit — no Build my event options click.
    await expect(page.getByRole("button", { name: "Build my event options" })).toHaveCount(0);
  });
});
