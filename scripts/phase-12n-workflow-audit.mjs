/**
 * Phase 12N — authenticated employee journey audit (read-only).
 * Synthetic Test Center B only. No booking/HOLD/confirm mutations.
 *
 * Usage (server on :3000): node scripts/phase-12n-workflow-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = path.join("docs/design/phase-12n-screenshots");
const FINDINGS = path.join("planning/employee-ux/phase-12n/journey-evidence.json");
const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "430", width: 430, height: 932 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
];

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.dirname(FINDINGS), { recursive: true });

const evidence = {
  startedAt: new Date().toISOString(),
  baseURL: BASE,
  journeys: {},
  responsive: [],
  notes: [],
};

async function ensureOrg(page) {
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (page.url().includes("sign-in")) throw new Error("Auth expired — run pnpm test:e2e:auth");
  let chip = "";
  try {
    chip = (await page.locator("[data-employee-context]").first().innerText()).replace(/\s+/g, " ").trim();
  } catch {
    chip = "";
  }
  if (!/Test Center B/i.test(chip)) {
    const orgBtn = page.getByRole("button", { name: /organization|Open organization/i }).first();
    if (await orgBtn.count()) {
      await orgBtn.click();
      await page.getByRole("button", { name: /MagicCRM Test Center B/i }).first().click({ timeout: 15_000 });
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

async function collectBodyHints(page) {
  const text = (await page.locator("body").innerText()).slice(0, 8000);
  const flags = [];
  const patterns = [
    [/Unit cents|unitCents/i, "technical:unit-cents"],
    [/tenant_live|approved_plugin_baseline/i, "technical:pricing-source-raw"],
    [/before customer send/i, "framing:customer-send"],
    [/You don't have permission|permission to create/i, "permission-panel"],
    [/HOLD — temporary|HOLD/i, "hold-label"],
    [/not collected|does not collect payment/i, "payment-neutral"],
    [/Approve internal quote|delivery/i, "quote-delivery"],
    [/Ready for Live Agent/i, "queue:ready-for-la"],
  ];
  for (const [re, tag] of patterns) {
    if (re.test(text)) flags.push(tag);
  }
  return { flags, sample: text.slice(0, 400) };
}

async function runAdmin(browser) {
  const context = await browser.newContext({
    storageState: "playwright/.clerk/administrator.json",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const log = { role: "administrator", steps: [] };
  try {
    await ensureOrg(page);
    log.steps.push({ step: "home", shot: await shot(page, "admin-home-1440"), hints: await collectBodyHints(page) });

    await page.goto(`${BASE}/app/inquiries`, { waitUntil: "networkidle" });
    log.steps.push({
      step: "inquiry-queue",
      shot: await shot(page, "admin-inquiries-1440"),
      hints: await collectBodyHints(page),
    });

    const wpPath = (() => {
      try {
        const f = JSON.parse(fs.readFileSync("playwright/.fixtures/phase-10g-wp-inquiry.json", "utf8"));
        return f.inquiryPath || null;
      } catch {
        return null;
      }
    })();
    // Prefer fixture; else first queue card
    if (wpPath) {
      await page.goto(`${BASE}${wpPath}`, { waitUntil: "networkidle" });
    } else {
      const card = page.locator("a[href*='/app/inquiries/']").first();
      if (await card.count()) await card.click();
      await page.waitForURL(/\/app\/inquiries\//, { timeout: 15_000 });
    }
    log.steps.push({
      step: "inquiry-detail",
      url: page.url(),
      shot: await shot(page, "admin-inquiry-detail-1440"),
      hints: await collectBodyHints(page),
    });

    const quoteTab = page.getByRole("tab", { name: /Staff quote|Quote/i }).or(page.getByRole("button", { name: /Staff quote/i }));
    if (await quoteTab.count()) {
      await quoteTab.first().click();
      await page.waitForTimeout(800);
    }
    log.steps.push({
      step: "staff-quote",
      shot: await shot(page, "admin-staff-quote-1440"),
      hints: await collectBodyHints(page),
      hasUnitDollars: (await page.locator("input[name^='lineUnitPriceDollars_']").count()) > 0,
      hasApprove: (await page.getByRole("button", { name: /Approve internal quote/i }).count()) > 0,
      hasAvailability: (await page.getByRole("button", { name: /Check availability|availability/i }).count()) > 0,
    });

    await page.goto(`${BASE}/app/bookings`, { waitUntil: "domcontentloaded" });
    log.steps.push({
      step: "bookings",
      shot: await shot(page, "admin-bookings-1440"),
      hints: await collectBodyHints(page),
      hasNewBooking: (await page.getByRole("link", { name: /New Booking/i }).count()) > 0,
    });

    await page.goto(`${BASE}/app/schedule`, { waitUntil: "domcontentloaded" });
    log.steps.push({
      step: "schedule",
      shot: await shot(page, "admin-schedule-1440"),
      hints: await collectBodyHints(page),
      hasLegend: (await page.getByText(/HOLD — temporary, not confirmed/i).count()) > 0,
    });

    await page.goto(`${BASE}/app/admin/operating-hours`, { waitUntil: "domcontentloaded" });
    log.steps.push({
      step: "settings-hours",
      shot: await shot(page, "admin-hours-1440"),
      hints: await collectBodyHints(page),
    });
  } catch (error) {
    log.error = String(error?.message || error);
    await shot(page, "admin-error").catch(() => {});
  }
  await context.close();
  evidence.journeys.administrator = log;
}

async function runEventSales(browser) {
  const context = await browser.newContext({
    storageState: "playwright/.clerk/event-sales.json",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const log = { role: "event_sales", steps: [] };
  try {
    await ensureOrg(page);
    log.steps.push({ step: "home", shot: await shot(page, "sales-home-1440"), hints: await collectBodyHints(page) });

    await page.goto(`${BASE}/app/inquiries`, { waitUntil: "networkidle" });
    log.steps.push({
      step: "queue",
      shot: await shot(page, "sales-inquiries-1440"),
      hints: await collectBodyHints(page),
    });

    try {
      const f = JSON.parse(fs.readFileSync("playwright/.fixtures/phase-10g-wp-inquiry.json", "utf8"));
      if (f.inquiryPath) {
        await page.goto(`${BASE}${f.inquiryPath}`, { waitUntil: "networkidle" });
        const quoteTab = page.getByRole("tab", { name: /Staff quote|Quote/i }).or(page.getByRole("button", { name: /Staff quote/i }));
        if (await quoteTab.count()) await quoteTab.first().click();
        await page.waitForTimeout(800);
        const unit = page.locator("input[name^='lineUnitPriceDollars_']").first();
        const locked = (await unit.count()) ? !(await unit.isEditable()) : null;
        log.steps.push({
          step: "wp-quote",
          shot: await shot(page, "sales-staff-quote-1440"),
          unitPriceLocked: locked,
          hints: await collectBodyHints(page),
        });
      }
    } catch (e) {
      log.steps.push({ step: "wp-quote", error: String(e?.message || e) });
    }

    await page.goto(`${BASE}/app/bookings`, { waitUntil: "domcontentloaded" });
    log.steps.push({
      step: "bookings",
      shot: await shot(page, "sales-bookings-1440"),
      hasNewBooking: (await page.getByRole("link", { name: /New Booking/i }).count()) > 0,
    });
    await page.goto(`${BASE}/app/schedule`, { waitUntil: "domcontentloaded" });
    log.steps.push({
      step: "schedule",
      shot: await shot(page, "sales-schedule-1440"),
      hasCreate: (await page.getByRole("button", { name: /Create Event/i }).count()) > 0,
    });
    await page.goto(`${BASE}/app/admin/resources`, { waitUntil: "domcontentloaded" });
    log.steps.push({
      step: "denied-resources",
      shot: await shot(page, "sales-resources-denied-1440"),
      hints: await collectBodyHints(page),
    });
  } catch (error) {
    log.error = String(error?.message || error);
  }
  await context.close();
  evidence.journeys.event_sales = log;
}

async function runFrontDesk(browser) {
  const context = await browser.newContext({
    storageState: "playwright/.clerk/front-desk.json",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const log = { role: "front_desk", steps: [] };
  try {
    await ensureOrg(page);
    log.steps.push({
      step: "home",
      shot: await shot(page, "desk-home-1440"),
      hints: await collectBodyHints(page),
      hasInquiriesNav: (await page.getByRole("link", { name: /^Inquiries$/i }).count()) > 0,
    });

    await page.goto(`${BASE}/app/inquiries`, { waitUntil: "domcontentloaded" });
    log.steps.push({
      step: "inquiries-denied",
      shot: await shot(page, "desk-inquiries-denied-1440"),
      hints: await collectBodyHints(page),
    });

    await page.goto(`${BASE}/app/bookings`, { waitUntil: "domcontentloaded" });
    log.steps.push({
      step: "bookings",
      shot: await shot(page, "desk-bookings-1440"),
      hasNewBooking: (await page.getByRole("link", { name: /New Booking/i }).count()) > 0,
      hints: await collectBodyHints(page),
    });

    await page.goto(`${BASE}/app/bookings/new`, { waitUntil: "domcontentloaded" });
    log.steps.push({
      step: "new-booking-denied",
      shot: await shot(page, "desk-new-booking-denied-1440"),
      hints: await collectBodyHints(page),
    });

    await page.goto(`${BASE}/app/schedule`, { waitUntil: "domcontentloaded" });
    log.steps.push({
      step: "schedule",
      shot: await shot(page, "desk-schedule-1440"),
      hasCreate: (await page.getByRole("button", { name: /Create Event/i }).count()) > 0,
      hasLegend: (await page.getByText(/HOLD — temporary, not confirmed/i).count()) > 0,
      hints: await collectBodyHints(page),
    });
  } catch (error) {
    log.error = String(error?.message || error);
  }
  await context.close();
  evidence.journeys.front_desk = log;
}

async function runResponsive(browser) {
  const context = await browser.newContext({
    storageState: "playwright/.clerk/administrator.json",
  });
  const page = await context.newPage();
  await ensureOrg(page);
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const row = { viewport: vp.name, pages: {} };
    for (const route of [
      { key: "home", path: "/app" },
      { key: "inquiries", path: "/app/inquiries" },
      { key: "bookings", path: "/app/bookings" },
      { key: "schedule", path: "/app/schedule" },
    ]) {
      await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded" });
      const ov = await overflow(page);
      const file = await shot(page, `responsive-${route.key}-${vp.name}`);
      row.pages[route.key] = { overflow: ov, shot: file };
      if (ov) evidence.notes.push(`overflow:${route.key}@${vp.name}`);
    }
    evidence.responsive.push(row);
  }
  await context.close();
}

const browser = await chromium.launch();
try {
  await runAdmin(browser);
  await runEventSales(browser);
  await runFrontDesk(browser);
  try {
    await runResponsive(browser);
  } catch (error) {
    evidence.notes.push(`responsive-aborted:${String(error?.message || error)}`);
  }
} finally {
  await browser.close();
}
evidence.finishedAt = new Date().toISOString();
fs.writeFileSync(FINDINGS, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ findings: FINDINGS, shots: OUT, notes: evidence.notes }, null, 2));
