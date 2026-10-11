import { expect, test } from "@playwright/test";
import fs from "node:fs";

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
const hasAuth = Boolean(storageState && fs.existsSync(storageState));

/**
 * Read-only authenticated staff route smoke.
 * Skips entirely without PLAYWRIGHT_STORAGE_STATE (see tests/e2e/README.md).
 */
test.describe("staff routes smoke (authenticated)", () => {
  test.skip(!hasAuth, "Set PLAYWRIGHT_STORAGE_STATE to a local Clerk test session file");

  test.use({ storageState: storageState! });

  const routes: { path: string; hint: RegExp }[] = [
    { path: "/app", hint: /inquir|schedule|magic|overview/i },
    { path: "/app/inquiries", hint: /inquir/i },
    { path: "/app/schedule", hint: /schedule|calendar|resource/i },
    { path: "/app/bookings", hint: /booking|inquir/i },
    { path: "/app/admin/team", hint: /team|member|invit/i },
    { path: "/app/admin/security-groups", hint: /security|group|permission/i },
    { path: "/app/admin/resources", hint: /resource/i },
  ];

  for (const route of routes) {
    test(`loads ${route.path} without server error chrome`, async ({ page }) => {
      const response = await page.goto(route.path);
      // Permission-denied surfaces may be 200 with messaging; hard 5xx is a failure.
      expect(response?.status() ?? 0).toBeLessThan(500);
      const url = page.url();
      if (url.includes("sign-in")) {
        test.skip(true, "Storage state expired — regenerate PLAYWRIGHT_STORAGE_STATE");
      }
      const body = await page.locator("body").innerText();
      expect(body).not.toMatch(/prisma|application error|digest #/i);
      expect(body).toMatch(route.hint);
    });
  }
});
