#!/usr/bin/env node
/**
 * R8 — Release-candidate UX evidence at 390/768/1024/1440.
 * Authenticated staff + public surfaces. No mutations.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const storageStatePath =
  process.env.PLAYWRIGHT_STORAGE_STATE ?? path.join("playwright", ".auth", "staff.json");
const staffInquiryPath = path.join("playwright", ".fixtures", "staff-inquiry.json");
const lifecyclePath = path.join("playwright", ".fixtures", "r5-lifecycle.json");
const proposalPath = path.join("playwright", ".fixtures", "proposal.json");
const outDir = path.join("docs", "release", "r8-evidence", "ux");

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
];

function loadJson(p) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

async function shot(page, file, notes, inventory, viewport, route) {
  const dest = path.join(outDir, file);
  await page.screenshot({ path: dest, fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  inventory.push({
    file,
    route,
    width: viewport.width,
    height: viewport.height,
    overflowPx: overflow,
    notes,
    finalUrl: page.url(),
  });
}

async function main() {
  if (!fs.existsSync(storageStatePath)) {
    console.error("Missing staff storage state");
    process.exit(1);
  }
  const staffInquiry = loadJson(staffInquiryPath);
  const lifecycle = loadJson(lifecyclePath);
  const proposal = loadJson(proposalPath);
  const orgSlug =
    process.env.PLAYWRIGHT_PUBLIC_ORG_SLUG ||
    staffInquiry?.organizationSlug ||
    "magiccrm-test-center-b";

  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const inventory = [];
  const findings = [];

  // Public (no auth)
  const publicCtx = await browser.newContext({ baseURL });
  const publicPage = await publicCtx.newPage();
  for (const viewport of VIEWPORTS) {
    await publicPage.setViewportSize({ width: viewport.width, height: viewport.height });
    await publicPage.goto(`/inquire/${orgSlug}`, { waitUntil: "networkidle", timeout: 60_000 });
    await shot(publicPage, `public-inquire-${viewport.name}w.png`, "public inquiry", inventory, viewport, `/inquire/${orgSlug}`);
    if (proposal?.planPath || proposal?.token) {
      const planRoute = proposal.planPath || `/plan/${proposal.token}`;
      await publicPage.goto(planRoute, { waitUntil: "networkidle", timeout: 60_000 });
      await shot(publicPage, `public-proposal-${viewport.name}w.png`, "public proposal", inventory, viewport, planRoute);
    }
    await publicPage.goto("/sign-in", { waitUntil: "networkidle", timeout: 60_000 });
    await shot(publicPage, `sign-in-${viewport.name}w.png`, "sign-in", inventory, viewport, "/sign-in");
  }
  await publicCtx.close();

  // Authenticated staff
  const staffCtx = await browser.newContext({ storageState: storageStatePath, baseURL });
  const page = await staffCtx.newPage();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.goto("/app", { waitUntil: "networkidle", timeout: 60_000 });
    if (page.url().includes("sign-in")) {
      findings.push({ severity: "P0", area: "auth", detail: "Staff storage state redirected to sign-in" });
      break;
    }
    await shot(page, `staff-shell-${viewport.name}w.png`, "workspace shell", inventory, viewport, "/app");

    await page.goto("/app/inquiries", { waitUntil: "networkidle", timeout: 60_000 });
    await shot(page, `inquiry-queue-${viewport.name}w.png`, "inquiry queue", inventory, viewport, "/app/inquiries");

    if (staffInquiry?.inquiryPath) {
      await page.goto(staffInquiry.inquiryPath, { waitUntil: "networkidle", timeout: 60_000 });
      await shot(page, `inquiry-detail-${viewport.name}w.png`, "inquiry detail", inventory, viewport, staffInquiry.inquiryPath);
      const hold = page.locator("#hold-readiness");
      if (await hold.count()) {
        await hold.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: path.join(outDir, `hold-readiness-${viewport.name}w.png`),
          fullPage: false,
        });
        inventory.push({
          file: `hold-readiness-${viewport.name}w.png`,
          route: staffInquiry.inquiryPath,
          width: viewport.width,
          notes: "hold readiness panel",
        });
      }
    }

    if (lifecycle?.hold?.inquiryPath) {
      await page.goto(lifecycle.hold.inquiryPath, { waitUntil: "networkidle", timeout: 60_000 });
      await shot(page, `lifecycle-hold-${viewport.name}w.png`, "HOLD workflow inquiry", inventory, viewport, lifecycle.hold.inquiryPath);
    }
    if (lifecycle?.confirm?.inquiryPath) {
      await page.goto(lifecycle.confirm.inquiryPath, { waitUntil: "networkidle", timeout: 60_000 });
      await shot(page, `lifecycle-confirm-${viewport.name}w.png`, "confirm-ready inquiry", inventory, viewport, lifecycle.confirm.inquiryPath);
    }

    await page.goto("/app/schedule", { waitUntil: "networkidle", timeout: 60_000 });
    await shot(page, `master-schedule-${viewport.name}w.png`, "master schedule", inventory, viewport, "/app/schedule");

    await page.goto("/app/bookings", { waitUntil: "networkidle", timeout: 60_000 });
    await shot(page, `bookings-list-${viewport.name}w.png`, "bookings list", inventory, viewport, "/app/bookings");

    // First booking detail if any link present
    const bookingLink = page.locator('a[href^="/app/bookings/"]').first();
    if ((await bookingLink.count()) > 0) {
      const href = await bookingLink.getAttribute("href");
      if (href && !href.endsWith("/new") && !href.endsWith("/bookings")) {
        await page.goto(href, { waitUntil: "networkidle", timeout: 60_000 });
        await shot(page, `booking-detail-${viewport.name}w.png`, "booking detail", inventory, viewport, href);
      }
    }

    // Mobile nav presence check
    if (viewport.width <= 768) {
      const mobileNav = page.locator("[data-employee-mobile-nav]");
      const more = page.getByRole("button", { name: /^More$/i });
      const mobileOk = (await mobileNav.count()) > 0 || (await more.count()) > 0;
      if (!mobileOk) {
        findings.push({
          severity: "P1",
          area: "mobile-nav",
          detail: `No mobile nav affordance at ${viewport.width}w on ${page.url()}`,
        });
      }
    }
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    baseURL,
    orgSlug,
    inventory,
    findings,
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.info(JSON.stringify({ ok: true, outDir, count: inventory.length, findings }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
