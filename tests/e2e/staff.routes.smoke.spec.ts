import { expect, test } from "@playwright/test";

import { resolveStaffAuth, staffAuthSkipReason } from "./helpers/staff-auth";

const auth = resolveStaffAuth();

/**
 * Read-only authenticated staff route smoke.
 * Skips entirely without a validated Clerk TEST storage state (see tests/e2e/README.md).
 */
test.describe("staff routes smoke (authenticated)", { tag: "@staff-routes" }, () => {
  test.skip(!auth.ok, staffAuthSkipReason());

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

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
      expect(response?.status() ?? 0).toBeLessThan(500);
      const url = page.url();
      if (url.includes("sign-in")) {
        test.skip(true, "Storage state expired — regenerate with pnpm test:e2e:staff:auth");
      }
      const body = await page.locator("body").innerText();
      expect(body).not.toMatch(/prisma|application error|digest #/i);
      expect(body).toMatch(route.hint);
    });
  }
});
