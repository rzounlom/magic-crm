/**
 * Phase 12C visual acceptance captures (local only).
 * Uses Playwright staff storage state — no Production writes.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const OUT = path.join("docs", "design", "phase-12c-screenshots");
const STORAGE = path.join("playwright", ".auth", "staff.json");
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "430", width: 430, height: 932 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
];

const ROUTES = [
  { id: "home", path: "/app" },
  { id: "inquiries", path: "/app/inquiries" },
  { id: "schedule", path: "/app/schedule" },
  { id: "settings-team", path: "/app/admin/team" },
];

fs.mkdirSync(OUT, { recursive: true });

if (!fs.existsSync(STORAGE)) {
  console.error(`Missing ${STORAGE}`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: STORAGE,
  baseURL: BASE,
});
const page = await context.newPage();

async function settle() {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(400);
}

let signedIn = false;
await page.goto("/app", { waitUntil: "domcontentloaded" });
await settle();
const url = page.url();
if (url.includes("/sign-in")) {
  console.error("Staff storage state is not signed in (redirected to sign-in).");
  await page.screenshot({ path: path.join(OUT, "auth-blocked-sign-in.png"), fullPage: true });
} else {
  signedIn = true;
  console.log("Signed in — capturing routes");
}

if (signedIn) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of ROUTES) {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await settle();
      const file = path.join(OUT, `${route.id}-${viewport.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log("wrote", file);
    }

    if (viewport.width >= 1024) {
      await page.goto("/app", { waitUntil: "domcontentloaded" });
      await settle();
      const overflow = page.locator("[data-employee-overflow] button");
      if (await overflow.count()) {
        await overflow.first().click();
        await page.waitForTimeout(200);
        await page.screenshot({
          path: path.join(OUT, `home-overflow-${viewport.name}.png`),
          fullPage: true,
        });
        await page.keyboard.press("Escape");
      }
    } else {
      await page.goto("/app", { waitUntil: "domcontentloaded" });
      await settle();
      const more = page.getByRole("button", { name: "More" });
      if (await more.count()) {
        await more.click();
        await page.waitForTimeout(300);
        await page.screenshot({
          path: path.join(OUT, `home-more-${viewport.name}.png`),
          fullPage: true,
        });
        await page.keyboard.press("Escape").catch(() => undefined);
      }
    }
  }

  // Inquiry detail if a row exists
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/inquiries", { waitUntil: "domcontentloaded" });
  await settle();
  const firstInquiry = page.locator('a[href^="/app/inquiries/"]').first();
  if (await firstInquiry.count()) {
    await firstInquiry.click();
    await settle();
    await page.screenshot({
      path: path.join(OUT, "inquiry-detail-1440.png"),
      fullPage: true,
    });
    console.log("wrote inquiry detail");
  }
}

await browser.close();
console.log(signedIn ? "Phase 12C captures complete" : "Captures blocked — regenerate staff auth");
process.exit(signedIn ? 0 : 2);
