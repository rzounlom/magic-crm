/**
 * Capture Staff quote editor screenshots (before/after). DEV localhost only.
 */
import fs from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";
import { config } from "dotenv";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE ?? "playwright/.clerk/administrator.json";
const FIXTURE = "playwright/.fixtures/phase-10g-wp-inquiry.json";
const OUT = "docs/design/phase-12k-screenshots";
const PREFIX = process.argv[2] === "after" ? "after" : "before";

async function main() {
  if (BASE.includes("127.0.0.1")) {
    throw new Error("Use localhost, not 127.0.0.1");
  }
  if (!fs.existsSync(STORAGE) || !fs.existsSync(FIXTURE)) {
    throw new Error("Missing administrator storage or WP fixture.");
  }
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as {
    organizationSlug: string;
    inquiryPath: string;
  };
  if (fixture.organizationSlug !== "magiccrm-test-center-b") {
    throw new Error("Fixture must be magiccrm-test-center-b");
  }

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: STORAGE,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("sign-in")) {
    throw new Error("Signed out — run pnpm test:e2e:auth");
  }
  await page.goto(`${BASE}${fixture.inquiryPath}`, { waitUntil: "networkidle" });
  const tab = page.getByRole("tab", { name: /Staff quote/i });
  if (await tab.count()) {
    await tab.click();
  }
  await page.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 20_000 });

  for (const width of [375, 768, 1440, 1920] as const) {
    await page.setViewportSize({ width, height: width < 800 ? 812 : 900 });
    await page.waitForTimeout(350);
    const target = page.locator("[data-wp-staff-quote-draft]");
    await target.scrollIntoViewIfNeeded();
    await target.screenshot({
      path: path.join(OUT, `${PREFIX}-quote-editor-${width}.png`),
    });
  }

  console.log(JSON.stringify({ ok: true, prefix: PREFIX, out: OUT }));
  await browser.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
