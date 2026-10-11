import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { resolveStaffAuth, staffAuthSkipReason } from "./helpers/staff-auth";
import { resolveStaffInquiryFixture } from "./helpers/staff-fixture";

const auth = resolveStaffAuth();
const fixture = resolveStaffInquiryFixture();

test.describe("Staff axe smoke (authenticated)", { tag: "@staff-a11y" }, () => {
  test.skip(!auth.ok, staffAuthSkipReason());

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  test("/app has no critical or serious axe violations", async ({ page }) => {
    await page.goto("/app");
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired — regenerate with pnpm test:e2e:staff:auth");
    }
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((row) => row.impact === "critical" || row.impact === "serious");
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test("inquiry detail has no critical or serious axe violations", async ({ page }) => {
    test.skip(!fixture.ok, fixture.ok ? "" : fixture.reason);
    if (!fixture.ok) return;
    await page.goto(fixture.fixture.inquiryPath);
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired");
    }
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((row) => row.impact === "critical" || row.impact === "serious");
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
