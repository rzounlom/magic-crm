import { expect, test } from "@playwright/test";

import { resolveStaffAuth, staffAuthSkipReason } from "./helpers/staff-auth";
import { openStaffMoreMenu } from "./helpers/staff-mobile-nav";

const auth = resolveStaffAuth();

test.describe("staff shell smoke (authenticated)", { tag: "@staff-smoke" }, () => {
  test.skip(!auth.ok, staffAuthSkipReason());

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  test("employee shell shows navigation chrome", async ({ page }) => {
    await page.goto("/app");
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired — regenerate with pnpm test:e2e:staff:auth");
    }
    await expect(page.getByRole("navigation").first()).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(20);
  });

  test("mobile More control is discoverable when present", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app");
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired");
    }
    const primaryNav = page.getByRole("navigation", { name: "Primary" });
    test.skip((await primaryNav.count()) === 0, "More control not visible for this session");

    const { more, dialog } = await openStaffMoreMenu(page);
    await expect(
      dialog.getByRole("link", { name: /public inquiry|sales knowledge|overview|team|resources/i }).first(),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(more).toBeFocused();
  });
});
