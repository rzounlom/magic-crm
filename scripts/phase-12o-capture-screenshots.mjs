/**
 * Phase 12O — after screenshots for copy clarity (read-only).
 * Usage: PLAYWRIGHT_BASE_URL=http://localhost:3000 node scripts/phase-12o-capture-screenshots.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = path.join("docs/design/phase-12o-screenshots");
const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "430", width: 430, height: 932 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
];

fs.mkdirSync(OUT, { recursive: true });

async function ensureOrg(page) {
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (page.url().includes("sign-in")) throw new Error("Auth expired — run pnpm test:e2e:auth");
  let chip = "";
  try {
    chip = (await page.locator("[data-employee-context]").first().innerText())
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    chip = "";
  }
  if (!/Test Center B/i.test(chip)) {
    const orgBtn = page.getByRole("button", { name: /organization|Open organization/i }).first();
    if (await orgBtn.count()) {
      await orgBtn.click();
      await page
        .getByRole("button", { name: /MagicCRM Test Center B/i })
        .first()
        .click({ timeout: 15_000 });
      await page.waitForTimeout(1200);
      await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
    }
  }
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
}

const evidence = { startedAt: new Date().toISOString(), baseURL: BASE, shots: [], responsive: [] };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: "playwright/.clerk/administrator.json",
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

try {
  await ensureOrg(page);

  await page.goto(`${BASE}/app/schedule`, { waitUntil: "networkidle" });
  evidence.shots.push({
    name: "after-schedule-pending-confirmation-1440",
    path: await shot(page, "after-schedule-pending-confirmation-1440"),
    hasPendingConfirmation: /Pending confirmation/i.test(await page.locator("body").innerText()),
    hasUnpaid: /unpaid/i.test(await page.locator("body").innerText()),
  });

  await page.goto(`${BASE}/app/bookings`, { waitUntil: "networkidle" });
  evidence.shots.push({
    name: "after-bookings-1440",
    path: await shot(page, "after-bookings-1440"),
  });
  const booking = page.locator("[data-booking-row]").first();
  if ((await booking.count()) > 0) {
    await booking.click();
    await page.waitForURL(/\/app\/bookings\//);
    evidence.shots.push({
      name: "after-booking-detail-1440",
      path: await shot(page, "after-booking-detail-1440"),
    });
  }

  const wpPath = "playwright/.fixtures/phase-10g-wp-inquiry.json";
  if (fs.existsSync(wpPath)) {
    const wp = JSON.parse(fs.readFileSync(wpPath, "utf8"));
    await page.goto(`${BASE}${wp.inquiryPath}`, { waitUntil: "networkidle" });
    evidence.shots.push({
      name: "after-inquiry-contact-manual-1440",
      path: await shot(page, "after-inquiry-contact-manual-1440"),
      hasManualContact: /Contact customer manually/i.test(await page.locator("body").innerText()),
      deliveryBannerCount: await page.locator("[data-wp-quote-delivery-banner]").count(),
    });
    const quoteTab = page.getByRole("tab", { name: /Staff quote|Quote/i }).first();
    if ((await quoteTab.count()) > 0) {
      await quoteTab.click();
      await page.waitForTimeout(500);
    }
    evidence.shots.push({
      name: "after-staff-quote-delivery-discrepancy-1440",
      path: await shot(page, "after-staff-quote-delivery-discrepancy-1440"),
      hasCanonicalDelivery: /approval does not send it/i.test(await page.locator("body").innerText()),
      hasWhatDiffers: /What differs/i.test(await page.locator("body").innerText()),
    });
  }

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${BASE}/app/schedule`, { waitUntil: "domcontentloaded" });
    const scheduleOverflow = await overflow(page);
    await shot(page, `after-schedule-${vp.name}`);
    await page.goto(`${BASE}/app/bookings`, { waitUntil: "domcontentloaded" });
    const bookingsOverflow = await overflow(page);
    await shot(page, `after-bookings-${vp.name}`);
    evidence.responsive.push({
      viewport: vp.name,
      scheduleOverflow,
      bookingsOverflow,
    });
  }
} finally {
  await browser.close();
}

evidence.finishedAt = new Date().toISOString();
fs.writeFileSync(
  path.join("planning/employee-ux/phase-12o/screenshot-evidence.json"),
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence, null, 2));
