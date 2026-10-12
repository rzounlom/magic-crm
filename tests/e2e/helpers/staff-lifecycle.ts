import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Claim the inquiry when the coach still shows Start Working. */
export async function startWorkingIfNeeded(page: Page) {
  const start = page.getByRole("button", { name: /^Start Working$/i }).first();
  if ((await start.count()) === 0 || !(await start.isEnabled().catch(() => false))) {
    return;
  }
  await start.click({ force: true });
  // Soft refresh must surface assignment without a hard reload.
  await expect(page.getByText(/Assigned to|Being worked by/i).first()).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByRole("button", { name: /^Start Working$/i })).toHaveCount(0);
}

/** Run Check Availability so confirmation coach can enable Confirm booking. */
export async function checkAvailabilityIfNeeded(page: Page) {
  const check = page.getByRole("button", { name: /^Check Availability$/i }).first();
  if ((await check.count()) === 0 || !(await check.isEnabled().catch(() => false))) {
    return;
  }
  await check.click({ force: true });
  await expect(
    page.getByText(/Availability checked|Available|availability|validated|Within operating/i).first(),
  ).toBeVisible({ timeout: 25_000 });
}

/**
 * Start working + check availability. Relies on server `refresh()` + awaited
 * `router.refresh()` — must not require a hard navigation.
 */
export async function prepareInquiryForMutation(page: Page, inquiryPath: string) {
  await page.goto(inquiryPath, { waitUntil: "networkidle" });
  await startWorkingIfNeeded(page);
  await checkAvailabilityIfNeeded(page);
}

/** Open the confirm dialog for a staff mutation control (force click avoids sticky overlays). */
export async function openMutationDialog(button: Locator) {
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.scrollIntoViewIfNeeded();
  await button.click({ force: true });
}

async function openDialogIndex(page: Page): Promise<number> {
  return page.locator("dialog").evaluateAll((nodes) =>
    nodes.findIndex((node) => (node as HTMLDialogElement).open),
  );
}

/** Confirm the currently open native <dialog>. */
export async function confirmOpenDialog(page: Page, confirmName: RegExp) {
  await expect.poll(async () => openDialogIndex(page)).not.toBe(-1);
  const openDialog = page.locator("dialog").nth(await openDialogIndex(page));
  const confirm = openDialog.getByRole("button", { name: confirmName });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect.poll(async () => openDialogIndex(page)).toBe(-1);
}
