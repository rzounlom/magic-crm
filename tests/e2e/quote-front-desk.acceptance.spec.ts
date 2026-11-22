import { expect, test } from "@playwright/test";

import {
  assertLocalhostBaseUrl,
  identityForRole,
  resolveE2EIdentities,
  resolveE2ERoleAuth,
  resolveE2EWpInquiry,
} from "./helpers/e2e-auth";
import { readClerkIdentity, switchToTestCenterB } from "./helpers/quote-acceptance";

const auth = resolveE2ERoleAuth("front_desk");
const identities = resolveE2EIdentities();
const inquiry = resolveE2EWpInquiry();

test.describe(
  "Front Desk restricted inquiry access",
  { tag: ["@quote", "@quote-front-desk", "@quote-restricted"] },
  () => {
    test.skip(!auth.ok, auth.ok ? "" : auth.reason);
    test.skip(!identities.ok, identities.ok ? "" : identities.reason);
    test.skip(!inquiry.ok, inquiry.ok ? "" : inquiry.reason);

    test.use({ storageState: auth.ok ? auth.storageStatePath : undefined });

    test("direct inquiry URL cannot bypass permissions", async ({ page }) => {
      if (!identities.ok || !inquiry.ok) throw new Error("Fixture resolution failed.");
      const expected = identityForRole(identities.fixture, "front_desk");
      if (!expected) throw new Error("Missing Front Desk identity.");
      expect(expected.hasInquiriesView).toBe(false);
      expect(expected.hasInquiriesManage).toBe(false);
      expect(expected.hasPriceOverride).toBe(false);
      expect(expected.hasQuotesApprove).toBe(false);

      const baseURL = assertLocalhostBaseUrl(
        process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
      );

      await page.goto(`${baseURL}/app`, { waitUntil: "domcontentloaded" });
      if (page.url().includes("sign-in")) {
        throw new Error("Front Desk storage expired — re-run pnpm test:e2e:auth");
      }

      const identity = await readClerkIdentity(page);
      expect(identity.clerkUserId).toBe(expected.clerkUserId);

      await switchToTestCenterB(page, baseURL);
      await page.goto(`${baseURL}${inquiry.fixture.inquiryPath}`, {
        waitUntil: "networkidle",
      });

      const body = await page.locator("body").innerText();
      expect(body).toMatch(/don't have permission|permission to perform this action|Inquiry/i);
      expect(await page.locator("[data-wp-staff-quote-draft]").count()).toBe(0);
      expect(await page.getByRole("button", { name: /Save staff edits/i }).count()).toBe(0);
      expect(
        await page.getByRole("button", { name: /Approve quote|Approve and send/i }).count(),
      ).toBe(0);
      expect(await page.locator("input[name^='lineUnitPriceDollars_']").count()).toBe(0);
    });
  },
);
