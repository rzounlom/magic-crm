#!/usr/bin/env node
/**
 * Capture idle top-of-form screenshots for Phase 12A visual acceptance.
 *
 * Usage:
 *   node scripts/phase-12a-visual-regression.mjs --label before --base https://magic-crm-eta.vercel.app
 *   node scripts/phase-12a-visual-regression.mjs --label after --base http://127.0.0.1:3000
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const outDir = join(repoRoot, "docs/design/phase-12a-screenshots");

const args = process.argv.slice(2);
function flag(name, fallback = "") {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const label = flag("label", "shot");
const base = flag("base", "https://magic-crm-eta.vercel.app").replace(/\/$/, "");
const slug = flag("slug", "generations-crm-test-1788129640704833684");
const url = `${base}/inquire/${slug}`;

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "430", width: 430, height: 932 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
];

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

for (const viewport of VIEWPORTS) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("heading", { name: "Plan your event" }).waitFor({ state: "visible" });
  const path = join(outDir, `${label}-${viewport.name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`wrote ${path}`);
}

await browser.close();
