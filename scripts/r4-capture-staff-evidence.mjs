#!/usr/bin/env node
/**
 * R4 — Capture authenticated staff workspace screenshots (TEST Clerk + DEV tenant).
 * Never prints cookies/tokens. Writes under docs/release/r4-evidence/.
 *
 * Usage:
 *   PLAYWRIGHT_STORAGE_STATE=playwright/.auth/staff.json \
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *   node scripts/r4-capture-staff-evidence.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE ?? path.join("playwright", ".auth", "staff.json");
const fixturePath =
  process.env.PLAYWRIGHT_STAFF_INQUIRY_FIXTURE ?? path.join("playwright", ".fixtures", "staff-inquiry.json");
const outDir = path.join("docs", "release", "r4-evidence");

const VIEWPORTS = [
  { name: "320", width: 320, height: 720 },
  { name: "375", width: 375, height: 812 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
];

/** Practical matrix: key routes × key widths (not every combination). */
const CAPTURES = [
  { route: "/app", slug: "app-overview", widths: ["320", "390", "768", "1440"] },
  { route: "/app/inquiries", slug: "inquiries-list", widths: ["390", "768", "1440"] },
  { route: "__inquiry__", slug: "inquiry-detail", widths: ["320", "390", "768", "1440"] },
  { route: "/app/bookings", slug: "bookings-list", widths: ["390", "1440"] },
  { route: "__booking__", slug: "booking-detail", widths: ["390", "1440"], optional: true },
  { route: "/app/schedule", slug: "schedule", widths: ["390", "768", "1440"] },
  { route: "/app/admin/resources", slug: "admin-resources", widths: ["390", "1440"] },
  { route: "/app/admin/team", slug: "admin-team", widths: ["390", "1440"] },
  { route: "/app/admin/security-groups", slug: "admin-security-groups", widths: ["390", "1440"] },
  { route: "/app/admin/ai/knowledge", slug: "admin-knowledge", widths: ["390", "1440"] },
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  if (!fs.existsSync(storageStatePath)) {
    fail(`Storage state missing at ${storageStatePath}. Run: corepack pnpm test:e2e:staff:auth`);
  }
  const fixture = fs.existsSync(fixturePath)
    ? JSON.parse(fs.readFileSync(fixturePath, "utf8"))
    : null;

  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storageStatePath, baseURL });
  const page = await context.newPage();

  // Resolve optional booking detail from list (never invent).
  let bookingPath = null;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/bookings", { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (!page.url().includes("sign-in")) {
    const href = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href^="/app/bookings/"]')];
      const detail = links.find((a) => !a.getAttribute("href")?.endsWith("/new"));
      return detail?.getAttribute("href") ?? null;
    });
    bookingPath = href;
  }

  const inventory = [];
  const notes = [];

  for (const capture of CAPTURES) {
    let route = capture.route;
    if (route === "__inquiry__") {
      if (!fixture?.inquiryPath) {
        notes.push("Skipped inquiry-detail: fixture missing");
        continue;
      }
      route = fixture.inquiryPath;
    }
    if (route === "__booking__") {
      if (!bookingPath) {
        notes.push("Skipped booking-detail: no existing booking row in list (expected on sparse DEV)");
        continue;
      }
      route = bookingPath;
    }

    for (const widthName of capture.widths) {
      const viewport = VIEWPORTS.find((v) => v.name === widthName);
      if (!viewport) continue;
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const response = await page.goto(route, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => null);
      if (page.url().includes("sign-in")) {
        fail("Storage state expired during capture — regenerate staff auth.");
      }
      const status = response?.status() ?? 0;
      if (status >= 400) {
        notes.push(`${capture.slug}@${widthName}: HTTP ${status}`);
      }

      // Settle sticky chrome briefly; avoid arbitrary long sleeps.
      await page.waitForTimeout(250);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      const file = `${capture.slug}-${widthName}w.png`;
      const filePath = path.join(outDir, file);
      await page.screenshot({ path: filePath, fullPage: true });
      inventory.push({
        file,
        route,
        viewport: widthName,
        overflowPx: overflow,
        httpStatus: status,
      });

      // Mobile More dialog evidence once per primary shell capture.
      if (capture.slug === "app-overview" && widthName === "390") {
        const more = page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /^More$/i });
        if ((await more.count()) > 0) {
          await more.click();
          const dialog = page.getByRole("dialog", { name: /^More$/i });
          await dialog.waitFor({ state: "visible", timeout: 5_000 });
          await page.screenshot({ path: path.join(outDir, "app-overview-390w-more-open.png"), fullPage: false });
          inventory.push({
            file: "app-overview-390w-more-open.png",
            route: "/app",
            viewport: "390",
            state: "more-dialog-open",
            overflowPx: overflow,
          });
          await page.keyboard.press("Escape");
        }
      }
    }
  }

  // Inquiry readiness close-ups (desktop + mobile).
  if (fixture?.inquiryPath) {
    for (const widthName of ["390", "1440"]) {
      const viewport = VIEWPORTS.find((v) => v.name === widthName);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(fixture.inquiryPath, { waitUntil: "networkidle", timeout: 60_000 });
      const hold = page.locator("#hold-readiness");
      if ((await hold.count()) > 0) {
        await hold.scrollIntoViewIfNeeded();
        const file = `inquiry-hold-readiness-${widthName}w.png`;
        await hold.screenshot({ path: path.join(outDir, file) });
        inventory.push({ file, route: fixture.inquiryPath, viewport: widthName, state: "hold-readiness" });
      }
      const confirm = page.locator("#confirmation-readiness");
      if ((await confirm.count()) > 0) {
        await confirm.scrollIntoViewIfNeeded();
        const file = `inquiry-confirmation-readiness-${widthName}w.png`;
        await confirm.screenshot({ path: path.join(outDir, file) });
        inventory.push({ file, route: fixture.inquiryPath, viewport: widthName, state: "confirmation-readiness" });
      }
    }
  }

  await browser.close();

  const manifest = {
    createdAt: new Date().toISOString(),
    baseURL,
    organizationSlug: fixture?.organizationSlug ?? null,
    inquiryPath: fixture?.inquiryPath ?? null,
    bookingPath,
    notes,
    inventory,
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.info(JSON.stringify({ ok: true, outDir, count: inventory.length, notes, bookingPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
