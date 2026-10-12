#!/usr/bin/env node
/**
 * R6 — Capture desktop/mobile navigation screenshots.
 * Writes under docs/release/r6-evidence/nav/.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const storageStatePath =
  process.env.PLAYWRIGHT_STORAGE_STATE ?? path.join("playwright", ".auth", "staff.json");
const fixturePath =
  process.env.PLAYWRIGHT_STAFF_INQUIRY_FIXTURE ?? path.join("playwright", ".fixtures", "staff-inquiry.json");
const outDir = path.join("docs", "release", "r6-evidence", "nav");

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
];

async function main() {
  if (!fs.existsSync(storageStatePath)) {
    console.error(`Storage state missing at ${storageStatePath}`);
    process.exit(1);
  }
  const fixture = fs.existsSync(fixturePath)
    ? JSON.parse(fs.readFileSync(fixturePath, "utf8"))
    : null;
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storageStatePath, baseURL });
  const page = await context.newPage();
  const inventory = [];

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/app", { waitUntil: "networkidle", timeout: 60_000 });
    if (page.url().includes("sign-in")) {
      console.error("Signed out — regenerate staff auth storage state.");
      process.exit(1);
    }

    const navState = await page.evaluate(() => {
      const mobile = document.querySelector("[data-employee-mobile-nav]");
      const desktop = document.querySelector("[data-employee-desktop-nav], header nav, .employee-desktop-nav");
      const actionBar = document.querySelector(".booking-mobile-action-bar");
      const style = (el) => (el ? getComputedStyle(el).display : null);
      return {
        mobileDisplay: style(mobile),
        desktopPresent: Boolean(desktop),
        actionBarDisplay: style(actionBar),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    const file = `shell-${viewport.name}w.png`;
    await page.screenshot({ path: path.join(outDir, file), fullPage: true });
    inventory.push({ file, route: "/app", ...viewport, ...navState });

    if (fixture?.inquiryPath) {
      await page.goto(fixture.inquiryPath, { waitUntil: "networkidle", timeout: 60_000 });
      const inquiryFile = `inquiry-${viewport.name}w.png`;
      await page.screenshot({ path: path.join(outDir, inquiryFile), fullPage: true });
      const hold = page.locator("#hold-readiness");
      if (await hold.count()) {
        await hold.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: path.join(outDir, `inquiry-hold-readiness-${viewport.name}w.png`),
          fullPage: false,
        });
      }
      inventory.push({ file: inquiryFile, route: fixture.inquiryPath, ...viewport });
    }
  }

  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify({ createdAt: new Date().toISOString(), inventory }, null, 2)}\n`,
  );
  console.info(JSON.stringify({ ok: true, outDir, count: inventory.length }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
