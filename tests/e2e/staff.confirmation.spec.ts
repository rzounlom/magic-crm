import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { resolveStaffAuth, staffAuthSkipReason } from "./helpers/staff-auth";
import { resolveStaffInquiryFixture, staffMutationsEnabled } from "./helpers/staff-fixture";

const auth = resolveStaffAuth();
const fixture = resolveStaffInquiryFixture();
const evidenceDir = path.join("docs", "release", "r3-evidence");

test.describe("Scenario D — Confirmation readiness", { tag: "@staff-confirm" }, () => {
  test.skip(!auth.ok, staffAuthSkipReason());
  test.skip(!fixture.ok, fixture.ok ? "" : fixture.reason);

  test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

  test("shows confirmation readiness distinct from HOLD purpose", async ({ page }, testInfo) => {
    if (!fixture.ok) return;
    await page.goto(fixture.fixture.inquiryPath);
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired — regenerate with pnpm test:e2e:staff:auth");
    }

    const confirmCard = page.locator("#confirmation-readiness");
    await expect(confirmCard).toBeVisible({ timeout: 15_000 });
    await expect(confirmCard.getByText(/Purpose:\s*CONFIRM_BOOKING/i)).toBeVisible();
    await expect(confirmCard.locator("p.font-medium").first()).toBeVisible();

    // Payment-neutral: confirmation copy must not claim money was collected.
    const body = await page.locator("body").innerText();
    expect(body.toLowerCase()).not.toMatch(/payment received|stripe|charged successfully|paid in full/);

    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({
      path: path.join(evidenceDir, `confirmation-readiness-${testInfo.project.name}.png`),
      fullPage: true,
    });
  });

  test("confirms booking only when UI allows and mutations are opted in", async ({ page }, testInfo) => {
    test.skip(!staffMutationsEnabled(), "Set PLAYWRIGHT_STAFF_MUTATIONS=1 to exercise Confirm booking");
    if (!fixture.ok) return;

    await page.goto(fixture.fixture.inquiryPath);
    if (page.url().includes("sign-in")) {
      test.skip(true, "Storage state expired");
    }

    const confirmCard = page.locator("#confirmation-readiness");
    await expect(confirmCard).toBeVisible({ timeout: 15_000 });

    const confirmButton = page.getByRole("button", { name: /^Confirm booking$/i }).first();
    const canConfirm =
      (await confirmButton.count()) > 0 && (await confirmButton.isEnabled().catch(() => false));

    if (!canConfirm) {
      // Mutation opted in, but product guards correctly block — verify guidance, do not weaken rules.
      await expect(confirmCard.getByText(/Purpose:\s*CONFIRM_BOOKING/i)).toBeVisible();
      await expect(
        confirmCard
          .getByText(/Inventory setup required|Operating hours|Blocking|not verified|cannot|required/i)
          .first(),
      ).toBeVisible();
      const body = (await page.locator("body").innerText()).toLowerCase();
      expect(body).not.toMatch(/payment received|stripe|charged successfully|paid in full/);
      testInfo.annotations.push({
        type: "blocked",
        description:
          "Confirm booking disabled by product guards (inventory/hours/permissions). No booking created.",
      });
      fs.mkdirSync(evidenceDir, { recursive: true });
      await page.screenshot({
        path: path.join(evidenceDir, `confirm-mutation-blocked-${testInfo.project.name}.png`),
        fullPage: true,
      });
      return;
    }

    await confirmButton.click();
    const dialogConfirm = page.getByRole("button", { name: /^Confirm booking$/i }).last();
    if (await dialogConfirm.isVisible().catch(() => false)) {
      await dialogConfirm.click();
    }

    await expect(page).toHaveURL(/\/app\/bookings\/[^/]+/, { timeout: 25_000 });
    await expect(page.getByText(/confirmed|booking #|Master Schedule/i).first()).toBeVisible({
      timeout: 10_000,
    });
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toMatch(/payment received|stripe|charged successfully|paid in full/);
  });
});
