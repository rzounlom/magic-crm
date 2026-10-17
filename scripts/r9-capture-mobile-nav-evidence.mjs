#!/usr/bin/env node
/**
 * R9 — Capture staff shell / inquiry nav at 390/768/1024/1440 for mobile nav fix evidence.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const storageStatePath =
  process.env.PLAYWRIGHT_STORAGE_STATE ?? path.join("playwright", ".auth", "staff.json");
const fixturePath = path.join("playwright", ".fixtures", "staff-inquiry.json");
const outDir = path.join("docs", "release", "r9-evidence", "ux");

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const fixture = fs.existsSync(fixturePath)
    ? JSON.parse(fs.readFileSync(fixturePath, "utf8"))
    : null;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storageStatePath, baseURL });
  const page = await context.newPage();
  const inventory = [];

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/app", { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (page.url().includes("sign-in")) {
      console.error("Signed out");
      process.exit(1);
    }
    const nav = page.locator("[data-employee-mobile-nav]");
    const inquiries = page.getByRole("link", { name: /^Inquiries$/i }).first();
    const metrics = await page.evaluate(() => {
      const mobile = document.querySelector("[data-employee-mobile-nav]");
      const nextBadge = document.querySelector("nextjs-portal, [data-nextjs-dev-indicator], #__next-build-watcher");
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const link = [...document.querySelectorAll("a")].find((a) => /^Inquiries$/i.test(a.textContent || ""));
      const linkBox = link ? link.getBoundingClientRect() : null;
      return {
        mobileDisplay: mobile ? getComputedStyle(mobile).display : null,
        overflowPx: overflow,
        inquiriesBox: linkBox
          ? { top: linkBox.top, left: linkBox.left, width: linkBox.width, height: linkBox.height, bottom: linkBox.bottom }
          : null,
        nextIndicatorPresent: Boolean(nextBadge),
      };
    });

    const shellFile = `staff-shell-${viewport.name}w.png`;
    await page.screenshot({ path: path.join(outDir, shellFile), fullPage: false });
    inventory.push({ file: shellFile, route: "/app", ...viewport, ...metrics });

    if (fixture?.inquiryPath) {
      await page.goto(fixture.inquiryPath, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const inquiryFile = `inquiry-detail-${viewport.name}w.png`;
      await page.screenshot({ path: path.join(outDir, inquiryFile), fullPage: false });
      inventory.push({ file: inquiryFile, route: fixture.inquiryPath, ...viewport });
    }

    // Accessibility: Inquiries control should be hittable on mobile
    if (viewport.width < 1024) {
      await page.goto("/app", { waitUntil: "domcontentloaded" });
      await inquiries.waitFor({ state: "visible", timeout: 15_000 });
      const box = await inquiries.boundingBox();
      if (!box || box.width < 8 || box.height < 8) {
        throw new Error(`Inquiries control not hittable at ${viewport.width}w`);
      }
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
  console.error(error);
  process.exit(1);
});
