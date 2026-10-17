#!/usr/bin/env node
/**
 * R7 — Capture inquiry/booking/schedule screenshots across viewports.
 * Writes under docs/release/r7-evidence/.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const storageStatePath =
  process.env.PLAYWRIGHT_STORAGE_STATE ?? path.join("playwright", ".auth", "staff.json");
const lifecyclePath =
  process.env.PLAYWRIGHT_R5_LIFECYCLE_FIXTURE ?? path.join("playwright", ".fixtures", "r5-lifecycle.json");
const staffFixturePath =
  process.env.PLAYWRIGHT_STAFF_INQUIRY_FIXTURE ?? path.join("playwright", ".fixtures", "staff-inquiry.json");
const outDir = path.join("docs", "release", "r7-evidence");

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
];

async function shot(page, file, fullPage = true) {
  await page.screenshot({ path: path.join(outDir, file), fullPage });
}

async function main() {
  if (!fs.existsSync(storageStatePath)) {
    console.error(`Storage state missing at ${storageStatePath}`);
    process.exit(1);
  }
  const lifecycle = fs.existsSync(lifecyclePath)
    ? JSON.parse(fs.readFileSync(lifecyclePath, "utf8"))
    : null;
  const staffFixture = fs.existsSync(staffFixturePath)
    ? JSON.parse(fs.readFileSync(staffFixturePath, "utf8"))
    : null;

  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storageStatePath, baseURL });
  const page = await context.newPage();
  const inventory = [];

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    // Unassigned / in-progress inquiry (staff fixture when available)
    if (staffFixture?.inquiryPath) {
      await page.goto(staffFixture.inquiryPath, { waitUntil: "networkidle", timeout: 60_000 });
      const file = `inquiry-unassigned-or-working-${viewport.name}w.png`;
      await shot(page, file);
      inventory.push({ file, kind: "inquiry-working", ...viewport });
    }

    // Active HOLD inquiry — lifecycle hold path if present
    if (lifecycle?.hold?.inquiryPath) {
      await page.goto(lifecycle.hold.inquiryPath, { waitUntil: "networkidle", timeout: 60_000 });
      const file = `inquiry-hold-${viewport.name}w.png`;
      await shot(page, file);
      inventory.push({ file, kind: "inquiry-hold", ...viewport });
    }

    // Confirmed inquiry — lifecycle confirm path
    if (lifecycle?.confirm?.inquiryPath) {
      await page.goto(lifecycle.confirm.inquiryPath, { waitUntil: "networkidle", timeout: 60_000 });
      const file = `inquiry-confirmed-${viewport.name}w.png`;
      await shot(page, file);
      inventory.push({ file, kind: "inquiry-confirmed", ...viewport });

      const openBooking = page.getByRole("link", { name: /^Open Booking$/i }).first();
      if ((await openBooking.count()) > 0 && (await openBooking.isVisible().catch(() => false))) {
        await openBooking.click();
        await page.waitForURL(/\/app\/bookings\//, { timeout: 30_000 }).catch(() => undefined);
      } else {
        // Confirm fixture may already be cancelled — fall back to bookings list.
        await page.goto("/app/bookings", { waitUntil: "networkidle", timeout: 60_000 });
        const anyBooking = page.locator('a[href^="/app/bookings/"]').filter({ hasNotText: /new/i }).first();
        if ((await anyBooking.count()) > 0) {
          await anyBooking.click();
          await page.waitForURL(/\/app\/bookings\/[^/]+/, { timeout: 30_000 }).catch(() => undefined);
        }
      }
      if (page.url().includes("/app/bookings/") && !page.url().endsWith("/bookings") && !page.url().includes("/new")) {
        const bookingFile = `booking-detail-${viewport.name}w.png`;
        await shot(page, bookingFile);
        inventory.push({ file: bookingFile, kind: "booking-detail", url: page.url(), ...viewport });
      }
    }

    const scheduleDate = lifecycle?.confirm?.preferredDate ?? lifecycle?.hold?.preferredDate ?? "2027-01-12";
    await page.goto(`/app/schedule?date=${scheduleDate}`, { waitUntil: "networkidle", timeout: 60_000 });
    const scheduleFile = `schedule-${viewport.name}w.png`;
    await shot(page, scheduleFile);
    inventory.push({ file: scheduleFile, kind: "schedule", ...viewport });
  }

  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify({ createdAt: new Date().toISOString(), inventory }, null, 2)}\n`,
  );
  console.info(JSON.stringify({ ok: true, outDir, count: inventory.length }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
