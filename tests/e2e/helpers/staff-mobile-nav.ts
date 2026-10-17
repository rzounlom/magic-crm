import { expect, type Page } from "@playwright/test";

/**
 * Open the mobile Primary → More dialog and return the visible dialog locator.
 * Scopes to the dialog so assertions do not match `sr-only` / sidebar labels.
 */
export async function openStaffMoreMenu(page: Page) {
  const more = page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /^More$/i });
  await expect(more).toBeVisible();
  await more.scrollIntoViewIfNeeded();
  // force: Next.js / overlay chrome can steal the hit target on narrow viewports in DEV.
  await more.click({ force: true });
  const dialog = page.getByRole("dialog", { name: /^More$/i });
  await expect(dialog).toBeVisible();
  return { more, dialog };
}
