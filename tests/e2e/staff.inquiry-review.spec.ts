import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { resolveStaffAuth, staffAuthSkipReason } from "./helpers/staff-auth";
import { resolveStaffInquiryFixture } from "./helpers/staff-fixture";

const auth = resolveStaffAuth();
const fixture = resolveStaffInquiryFixture();
const evidenceDir = path.join("docs", "release", "r3-evidence");

test.describe("Scenario B — Inquiry review", { tag: "@staff-inquiry" }, () => {
  test.skip(!auth.ok, staffAuthSkipReason());
  test.skip(!fixture.ok, fixture.ok ? "" : fixture.reason);

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  test("opens seeded TEST/DEV inquiry and shows event preferences distinctly from readiness", async ({
    page,
  }, testInfo) => {
    if (!fixture.ok) return;
    const response = await page.goto(fixture.fixture.inquiryPath);
    expect(response?.status() ?? 0).toBeLessThan(500);
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired — regenerate with pnpm test:e2e:staff:auth");
    }

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/prisma|application error|digest #/i);
    expect(body).toMatch(/birthday|event|guest|prefer/i);

    // Readiness panels are actionable guidance; preferences are review content.
    const holdCard = page.locator("#hold-readiness");
    const confirmCard = page.locator("#confirmation-readiness");
    const hasHold = (await holdCard.count()) > 0;
    const hasConfirm = (await confirmCard.count()) > 0;
    expect(hasHold || hasConfirm || body.match(/plan|proposal|readiness/i)).toBeTruthy();

    if (hasHold) {
      await expect(holdCard.getByText(/Purpose:\s*PLACE_HOLD/i)).toBeVisible();
    }
    if (hasConfirm) {
      await expect(confirmCard.getByText(/Purpose:\s*CONFIRM_BOOKING/i)).toBeVisible();
    }

    fs.mkdirSync(evidenceDir, { recursive: true });
    const shot = path.join(evidenceDir, `inquiry-review-${testInfo.project.name}.png`);
    await page.screenshot({ path: shot, fullPage: true });
  });
});
