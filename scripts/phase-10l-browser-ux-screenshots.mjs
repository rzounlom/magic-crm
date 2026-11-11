/**
 * Phase 10L — Capture public + employee inquiry UX screenshots (synthetic only).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium, devices } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const OUT_DIR = path.join("playwright", ".fixtures", "phase-10l-screenshots");
const AUTH = path.join("playwright", ".auth", "staff.json");
const FIXTURE = path.join("playwright", ".fixtures", "phase-10g-wp-inquiry.json");

mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function main() {
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
  if (fixture.organizationSlug !== "magiccrm-test-center-b") {
    throw new Error("Refused: fixture is not synthetic test-center-b.");
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];

  // Public inquire — desktop
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/inquire/magiccrm-test-center-b`, { waitUntil: "networkidle" });
    await page.waitForSelector("form", { timeout: 20000 });
    results.push({ view: "public-desktop-1440", file: await shot(page, "public-desktop-1440") });
    await context.close();
  }

  // Public inquire — mobile
  {
    const context = await browser.newContext({
      ...devices["iPhone 13"],
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/inquire/magiccrm-test-center-b`, { waitUntil: "networkidle" });
    await page.waitForSelector("form", { timeout: 20000 });
    results.push({ view: "public-mobile-375", file: await shot(page, "public-mobile-375") });
    await context.close();
  }

  // Employee inquiry — desktop (staff auth)
  {
    const context = await browser.newContext({
      storageState: AUTH,
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/app/inquiries/${fixture.inquiryId}`, { waitUntil: "networkidle" });
    // Org switcher if needed
    const switcher = page.getByRole("button", { name: /organization switcher|Open organization/i });
    if (await switcher.isVisible().catch(() => false)) {
      await switcher.click();
      const target = page.getByText(/MagicCRM Test Center B/i).first();
      if (await target.isVisible().catch(() => false)) {
        await target.click();
        await page.waitForTimeout(1500);
        await page.goto(`${BASE}/app/inquiries/${fixture.inquiryId}`, { waitUntil: "networkidle" });
      }
    }
    await page.waitForSelector("[data-employee-inquiry-tabs], h1", { timeout: 30000 });
    results.push({ view: "employee-desktop-overview", file: await shot(page, "employee-desktop-overview") });
    const quoteTab = page.getByRole("tab", { name: /Staff quote/i });
    if (await quoteTab.isVisible().catch(() => false)) {
      await quoteTab.click();
      await page.waitForTimeout(400);
      results.push({ view: "employee-desktop-quote", file: await shot(page, "employee-desktop-quote") });
    }
    const recTab = page.getByRole("tab", { name: /Recommendations/i });
    if (await recTab.isVisible().catch(() => false)) {
      await recTab.click();
      await page.waitForTimeout(400);
      results.push({ view: "employee-desktop-recommendations", file: await shot(page, "employee-desktop-recommendations") });
    }
    await context.close();
  }

  // Employee inquiry — mobile
  {
    const context = await browser.newContext({
      storageState: AUTH,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/app/inquiries/${fixture.inquiryId}`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-employee-inquiry-tabs], h1", { timeout: 30000 });
    results.push({ view: "employee-mobile-390", file: await shot(page, "employee-mobile-390") });
    await context.close();
  }

  await browser.close();
  const summary = { ok: true, base: BASE, inquiryId: fixture.inquiryId, results };
  writeFileSync(path.join(OUT_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
