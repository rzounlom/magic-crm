import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const slug = process.env.PLAYWRIGHT_PUBLIC_ORG_SLUG;

test.describe("public axe smoke", () => {
  test.skip(!slug, "Set PLAYWRIGHT_PUBLIC_ORG_SLUG for a non-production inquire host");

  test("inquire page has no critical or serious axe violations", async ({ page }) => {
    await page.goto(`/inquire/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    const blocking = results.violations.filter((row) => row.impact === "critical" || row.impact === "serious");
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
