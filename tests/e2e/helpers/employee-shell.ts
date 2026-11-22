import { expect, type Page } from "@playwright/test";

import {
  assertLocalhostBaseUrl,
  type E2ERole,
  isSyntheticOrgChip,
} from "./e2e-auth";
import { PERMISSION_DENIED_PATTERN } from "./employee-nav-matrix";

export function e2eBaseURL(): string {
  return assertLocalhostBaseUrl(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000");
}

export async function gotoAppHome(page: Page) {
  const base = e2eBaseURL();
  await page.goto(`${base}/app`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (page.url().includes("sign-in")) {
    throw new Error("Session redirected to sign-in — re-run pnpm test:e2e:auth");
  }
}

export async function ensureTestCenterB(page: Page) {
  await gotoAppHome(page);
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
    await page.waitForTimeout(1500);
    await gotoAppHome(page);
    chip = ((await page.locator("[data-employee-context]").first().innerText()) || "")
      .replace(/\s+/g, " ")
      .trim();
  }
  expect(isSyntheticOrgChip(chip), `Expected Test Center B, got: ${chip}`).toBeTruthy();
  return chip;
}

/** Sidebar + More destinations: collect hrefs visible for the role (desktop 1440). */
export async function collectVisibleNavHrefs(page: Page): Promise<Set<string>> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAppHome(page);
  const hrefs = new Set<string>();

  const sidebar = page.locator("[data-employee-sidebar]");
  if (await sidebar.count()) {
    const links = sidebar.getByRole("link");
    const n = await links.count();
    for (let i = 0; i < n; i += 1) {
      const href = await links.nth(i).getAttribute("href");
      if (href) hrefs.add(href.split("?")[0]!);
    }
  }

  // Also check overflow / more if present on desktop (settings often in sidebar groups).
  return hrefs;
}

export async function expectPermissionDenied(page: Page) {
  const body = await page.locator("body").innerText();
  expect(body).toMatch(PERMISSION_DENIED_PATTERN);
}

export async function expectNoServerErrorChrome(page: Page) {
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/This page couldn.?t load|application error|digest #|prisma/i);
}

export async function documentHasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
}

export function roleFromProjectName(projectName: string): E2ERole | null {
  if (projectName.includes("admin")) return "administrator";
  if (projectName.includes("event-sales") || projectName.includes("event_sales")) {
    return "event_sales";
  }
  if (projectName.includes("front-desk") || projectName.includes("front_desk")) {
    return "front_desk";
  }
  return null;
}
