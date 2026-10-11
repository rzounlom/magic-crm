import { expect, type Page } from "@playwright/test";

/**
 * Open the mobile Primary → More dialog and return the visible dialog locator.
 * Scopes to the dialog so assertions do not match `sr-only` / sidebar labels.
 */
export async function openStaffMoreMenu(page: Page) {
  const more = page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /^More$/i });
  await expect(more).toBeVisible();
  await more.click();
  const dialog = page.getByRole("dialog", { name: /^More$/i });
  await expect(dialog).toBeVisible();
  return { more, dialog };
}
