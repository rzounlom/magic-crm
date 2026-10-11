import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { resolveStaffAuth, staffAuthSkipReason } from "./helpers/staff-auth";
import { resolveStaffInquiryFixture, staffMutationsEnabled } from "./helpers/staff-fixture";

const auth = resolveStaffAuth();
const fixture = resolveStaffInquiryFixture();
const evidenceDir = path.join("docs", "release", "r3-evidence");

test.describe("Scenario C — Proposal and optional HOLD", { tag: "@staff-hold" }, () => {
  test.skip(!auth.ok, staffAuthSkipReason());
  test.skip(!fixture.ok, fixture.ok ? "" : fixture.reason);

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  test("surfaces HOLD readiness guidance without inventing availability", async ({ page }, testInfo) => {
    if (!fixture.ok) return;
    await page.goto(fixture.fixture.inquiryPath);
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired — regenerate with pnpm test:e2e:staff:auth");
    }

    const holdCard = page.locator("#hold-readiness");
    await expect(holdCard).toBeVisible({ timeout: 15_000 });
    await expect(holdCard.getByText(/Proposal HOLD readiness/i)).toBeVisible();
    await expect(holdCard.getByText(/Purpose:\s*PLACE_HOLD/i)).toBeVisible();

    const headline = holdCard.locator("p.font-medium").first();
    await expect(headline).toBeVisible();
    const headlineText = (await headline.innerText()).trim();
    expect(headlineText.length).toBeGreaterThan(3);

    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({
      path: path.join(evidenceDir, `hold-readiness-${testInfo.project.name}.png`),
      fullPage: true,
    });
  });

  test("places HOLD only when UI allows and mutations are opted in", async ({ page }) => {
    test.skip(!staffMutationsEnabled(), "Set PLAYWRIGHT_STAFF_MUTATIONS=1 to exercise Place HOLD");
    if (!fixture.ok) return;

    await page.goto(fixture.fixture.inquiryPath);
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired");
    }

    const holdCard = page.locator("#hold-readiness");
    await expect(holdCard).toBeVisible({ timeout: 15_000 });
    const placeHold = holdCard.getByRole("button", { name: /^Place HOLD$/i });
    if ((await placeHold.count()) === 0 || !(await placeHold.isEnabled())) {
      test.skip(true, "Place HOLD not enabled — fixture does not satisfy HOLD guards (expected for some tenants)");
    }

    await placeHold.click();
    // Confirm dialog may appear for destructive/important actions.
    const confirm = page.getByRole("button", { name: /^Place HOLD$/i }).last();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click();
    }

    await expect(holdCard.getByText(/Active HOLD|Already|held/i).first()).toBeVisible({
      timeout: 20_000,
    });

    const release = page.getByRole("button", { name: /Release HOLD|Release hold/i }).first();
    if ((await release.count()) > 0 && (await release.isEnabled())) {
      await release.click();
      const confirmRelease = page.getByRole("button", { name: /Release/i }).last();
      if (await confirmRelease.isVisible().catch(() => false)) {
        await confirmRelease.click();
      }
    }
  });
});
