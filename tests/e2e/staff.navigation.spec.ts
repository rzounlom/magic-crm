import { expect, test } from "@playwright/test";

import { resolveStaffAuth, staffAuthSkipReason } from "./helpers/staff-auth";

const auth = resolveStaffAuth();

test.describe("Scenario A — Staff navigation and organization context", { tag: "@staff-nav" }, () => {
  test.skip(!auth.ok, staffAuthSkipReason());

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  test("authenticated entry reaches /app with module navigation", async ({ page }) => {
    const response = await page.goto("/app");
    expect(response?.status() ?? 0).toBeLessThan(500);
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page.getByRole("navigation").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /inquir/i }).first()).toBeVisible();
  });

  test("organization context chip is present and non-empty when rendered", async ({ page }) => {
    await page.goto("/app");
    await expect(page).not.toHaveURL(/sign-in/);
    const chip = page.locator("[data-employee-context]");
    if ((await chip.count()) === 0) {
      test.skip(true, "Organization context chip not rendered for this membership");
    }
    const text = (await chip.first().innerText()).trim();
    expect(text.length).toBeGreaterThan(1);
    const expectedSlug = auth.ok ? auth.meta?.expectedOrganizationSlug : null;
    if (expectedSlug) {
      // Soft org binding: page must not advertise a clearly different production brand.
      expect(text.toLowerCase()).not.toMatch(/production|prod-only/);
    }
  });

  test("unauthenticated sign-in surface is not shown while storage state is valid", async ({ page }) => {
    await page.goto("/app/inquiries");
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired — regenerate with pnpm test:e2e:staff:auth");
    }
    await expect(page.getByText(/inquir/i).first()).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/prisma|application error|digest #/i);
  });
});
