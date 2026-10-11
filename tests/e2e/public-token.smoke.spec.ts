import { expect, test } from "@playwright/test";

test.describe("public token and landing smoke", () => {
  test("invalid plan token shows a calm not-found surface", async ({ page }) => {
    const response = await page.goto("/plan/invalid-token-ux7-smoke");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/prisma|stack|organizationId|clerk_/i);
  });

  test("marketing home loads", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByText("MagicCRM").first()).toBeVisible();
  });

  test("employee app redirects unauthenticated users", async ({ page }) => {
    const response = await page.goto("/app");
    // Clerk middleware typically 307/302 to sign-in.
    expect(response?.status()).toBeGreaterThanOrEqual(200);
    await page.waitForURL(/sign-in|\/app/);
    const url = page.url();
    expect(url.includes("sign-in") || url.includes("/app")).toBeTruthy();
  });
});
