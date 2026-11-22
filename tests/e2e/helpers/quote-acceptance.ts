import type { Page } from "@playwright/test";

import { isSyntheticOrgChip } from "./e2e-auth";

export async function switchToTestCenterB(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/app`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  let chip = "";
  try {
    chip = (await page.locator("[data-employee-context]").first().innerText())
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    chip = "";
  }
  if (isSyntheticOrgChip(chip)) return chip;

  const orgBtn = page.getByRole("button", { name: /organization|Open organization/i }).first();
  if (await orgBtn.count()) {
    await orgBtn.click();
    await page
      .getByRole("button", { name: /MagicCRM Test Center B/i })
      .first()
      .click({ timeout: 15_000 });
    await page.waitForTimeout(2000);
  }

  await page.goto(`${baseURL}/app`, { waitUntil: "networkidle" });
  chip = ((await page.locator("[data-employee-context]").first().innerText()) || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!isSyntheticOrgChip(chip)) {
    throw new Error(`Could not activate magiccrm-test-center-b. Context: ${chip}`);
  }
  return chip;
}

async function pageShowsServerError(page: Page): Promise<boolean> {
  const body = await page.locator("body").innerText().catch(() => "");
  return /This page couldn.?t load|A server error occurred/i.test(body);
}

export async function openStaffQuoteEditor(page: Page, baseURL: string, inquiryPath: string) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(`${baseURL}${inquiryPath}`, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      if (await pageShowsServerError(page)) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
      }
      if (await pageShowsServerError(page)) {
        throw new Error(`Inquiry page server error (attempt ${attempt})`);
      }
      const staffTab = page.getByRole("tab", { name: /Staff quote/i });
      if (await staffTab.count()) {
        await staffTab.click();
        await page.waitForTimeout(400);
      }
      await page
        .locator(
          "[data-wp-staff-quote-draft], button:has-text('Create staff quote draft'), [data-wp-quote-approval]",
        )
        .first()
        .waitFor({ timeout: 25_000 });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await page.waitForTimeout(1500 * attempt);
    }
  }
  throw lastError ?? new Error("openStaffQuoteEditor failed");
}

export async function ensureStaffQuoteDraft(page: Page, baseURL: string, inquiryPath: string) {
  await openStaffQuoteEditor(page, baseURL, inquiryPath);
  const draft = page.locator("[data-wp-staff-quote-draft]");
  if (await draft.locator("input[name^='lineUnitPriceDollars_']").count()) {
    return "existing" as const;
  }
  const create = page.getByRole("button", {
    name: /Create staff quote draft|Refresh draft from private calculation/i,
  });
  await create.first().click({ timeout: 15_000 });
  await page.locator("input[name^='lineUnitPriceDollars_']").first().waitFor({ timeout: 30_000 });
  return "created" as const;
}

export async function readClerkIdentity(page: Page) {
  return page.evaluate(async () => {
    type ClerkLike = {
      user?: {
        id?: string;
        primaryEmailAddress?: { emailAddress?: string };
        emailAddresses?: Array<{ emailAddress?: string }>;
      };
      load?: () => Promise<void>;
    };
    const clerk = (window as unknown as { Clerk?: ClerkLike }).Clerk;
    if (!clerk?.user) await clerk?.load?.();
    const user = clerk?.user;
    return {
      clerkUserId: user?.id ?? null,
      email:
        user?.primaryEmailAddress?.emailAddress ??
        user?.emailAddresses?.[0]?.emailAddress ??
        null,
    };
  });
}
