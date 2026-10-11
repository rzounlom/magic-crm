import { expect, test } from "@playwright/test";
import fs from "node:fs";

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
const hasAuth = Boolean(storageState && fs.existsSync(storageState));

test.describe("staff shell smoke (authenticated)", () => {
  test.skip(!hasAuth, "Set PLAYWRIGHT_STORAGE_STATE to a local Clerk test session file");

  test.use({ storageState: storageState! });

  test("employee shell shows navigation chrome", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("navigation").first()).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(20);
  });

  test("mobile More control is discoverable when present", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app");
    const more = page.getByRole("button", { name: /more/i });
    test.skip((await more.count()) === 0, "More control not visible for this session");
    await more.first().click();
    await expect(page.getByText(/catalog|settings|public inquiry/i).first()).toBeVisible();
  });
});
