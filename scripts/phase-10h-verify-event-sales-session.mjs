/**
 * Phase 10H — Verify Event Sales storage without printing secrets.
 * Confirms authenticated /app on synthetic org and captures non-secret permission signals from UI.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { chromium } from "@playwright/test";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const STORAGE = process.env.PLAYWRIGHT_EVENT_SALES_STORAGE_STATE ?? "playwright/.auth/event-sales.json";
const META = path.join("playwright", ".auth", "event-sales.meta.json");
const OUT = path.join("playwright", ".fixtures", "phase-10h-event-sales-session.json");

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
}

const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
if (!pk.startsWith("pk_test_")) fail("Clerk publishable key is not TEST.");
if ((process.env.CLERK_SECRET_KEY ?? "").startsWith("sk_live_")) fail("Clerk secret is LIVE.");
if (!fs.existsSync(STORAGE)) fail(`Missing storage at ${STORAGE}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: STORAGE });
const page = await context.newPage();

try {
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  if (page.url().includes("sign-in")) fail("Session not authenticated — redirected to sign-in.");
  const chip = (await page.locator("[data-employee-context]").first().innerText())
    .replace(/\s+/g, " ")
    .trim();
  if (!/magiccrm-test-center-b/i.test(chip)) {
    fail(`Active org is not synthetic: ${chip}`);
  }
  if (/generations-crm-test/i.test(chip)) fail(`Active org is Generations: ${chip}`);

  // Soft UI signals: Event Sales should see inquiries, not team admin / hours management
  await page.goto(`${BASE}/app/inquiries`, { waitUntil: "networkidle" });
  const inquiriesOk = (await page.getByRole("heading", { name: /inquir/i }).count()) > 0 ||
    page.url().includes("/app/inquiries");

  await page.goto(`${BASE}/app/admin/operating-hours`, { waitUntil: "networkidle" });
  const hoursHeading = (await page.getByRole("heading", { name: "Operating hours" }).count()) > 0;
  const hoursManage =
    (await page.getByRole("button", { name: /Save draft|Verify|Add exception/i }).count()) > 0;

  const payload = {
    ok: true,
    storageStatePath: STORAGE,
    clerkPublishableKeyKind: "test",
    baseUrl: BASE,
    activeOrgChip: chip,
    inquiriesAccessible: Boolean(inquiriesOk),
    operatingHoursHeadingVisible: hoursHeading,
    operatingHoursManageControlsVisible: hoursManage,
    note: "Cookie values omitted. Confirm Event Sales-only via server-side identity inspect + browser checks.",
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  if (fs.existsSync(META)) {
    // leave meta as written by bootstrap
  }
  console.log(JSON.stringify(payload, null, 2));
  if (hoursManage) {
    fail("Event Sales session appears to have operating-hours manage controls.");
  }
} finally {
  await browser.close();
}
