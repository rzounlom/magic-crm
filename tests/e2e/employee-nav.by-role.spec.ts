import { expect, test } from "@playwright/test";

import {
  DENIED_DIRECT_ROUTES_BY_ROLE,
  EMPLOYEE_NAV_BY_ROLE,
} from "./helpers/employee-nav-matrix";
import { resolveE2ERoleAuth, type E2ERole } from "./helpers/e2e-auth";
import {
  collectVisibleNavHrefs,
  ensureTestCenterB,
  expectNoServerErrorChrome,
  expectPermissionDenied,
  gotoAppHome,
  roleFromProjectName,
} from "./helpers/employee-shell";

const ROLES: E2ERole[] = ["administrator", "event_sales", "front_desk"];

/**
 * When run under employee-* projects, storageState comes from the project.
 * When run under a single role project, only that role's describes execute meaningfully.
 */
for (const role of ROLES) {
  const auth = resolveE2ERoleAuth(role);

  test.describe(`employee nav — ${role}`, { tag: ["@phase-12j", "@employee-nav"] }, () => {
    test.skip(!auth.ok, auth.ok ? "" : auth.reason);

    test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

    test.beforeEach(({ }, testInfo) => {
      const projectRole = roleFromProjectName(testInfo.project.name);
      if (projectRole && projectRole !== role) {
        test.skip(true, `Project ${testInfo.project.name} is for ${projectRole}`);
      }
    });

    test("sidebar shows only permitted destinations", async ({ page }) => {
      await ensureTestCenterB(page);
      const hrefs = await collectVisibleNavHrefs(page);
      const expected = EMPLOYEE_NAV_BY_ROLE[role];

      for (const item of expected) {
        if (item.visible) {
          expect(hrefs.has(item.href), `${role} missing nav ${item.label} (${item.href})`).toBe(
            true,
          );
        } else {
          expect(hrefs.has(item.href), `${role} must not show ${item.label}`).toBe(false);
        }
      }
    });

    test("permitted routes load without server error", async ({ page }) => {
      await ensureTestCenterB(page);
      for (const item of EMPLOYEE_NAV_BY_ROLE[role].filter((row) => row.visible)) {
        await page.goto(item.href, { waitUntil: "domcontentloaded" });
        if (page.url().includes("sign-in")) {
          throw new Error(`Signed out navigating to ${item.href}`);
        }
        await expectNoServerErrorChrome(page);
        expect(page.url()).toContain(item.href === "/app" ? "/app" : item.href);
      }
    });

    test("denied direct URLs cannot bypass permissions", async ({ page }) => {
      const denied = DENIED_DIRECT_ROUTES_BY_ROLE[role];
      test.skip(denied.length === 0, "No denied routes for this role");

      await ensureTestCenterB(page);
      for (const path of denied) {
        await page.goto(path, { waitUntil: "domcontentloaded" });
        if (page.url().includes("sign-in")) {
          throw new Error(`Signed out navigating to ${path}`);
        }
        await expectPermissionDenied(page);
      }
    });

    test("home dashboard chrome is present", async ({ page }) => {
      await ensureTestCenterB(page);
      await gotoAppHome(page);
      await expect(page.locator("[data-employee-dashboard]")).toBeVisible();
      await expect(page.locator("[data-employee-context]").first()).toBeVisible();
    });
  });
}
