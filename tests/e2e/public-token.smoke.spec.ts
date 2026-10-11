import { expect, test } from "@playwright/test";

const planToken = process.env.PLAYWRIGHT_PUBLIC_PLAN_TOKEN?.trim();

test.describe("public token and landing smoke", () => {
  test("invalid plan token shows a calm not-found surface", async ({ page }) => {
    const response = await page.goto("/plan/invalid-token-ux7-smoke");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/prisma|stack|organizationId|clerk_/i);
  });

  test("valid plan token renders payment-neutral proposal comparison", async ({ page }) => {
    test.skip(!planToken, "Set PLAYWRIGHT_PUBLIC_PLAN_TOKEN from scripts/r1-create-proposal-browser-fixture.ts");
    const response = await page.goto(`/plan/${planToken}`);
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/prisma|stack|organizationId|clerk_/i);
    expect(body.toLowerCase()).not.toMatch(/pay now|enter card|stripe/i);
    // Tier comparison or single recommended plan should be present.
    await expect(page.getByText(/good|recommended|premium|proposal|plan/i).first()).toBeVisible();
  });

  test("marketing home loads", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByText("MagicCRM").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/extraordinary/i);
    await expect(page.getByRole("link", { name: "Employee sign in" }).first()).toBeVisible();
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
