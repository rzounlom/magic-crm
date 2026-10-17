#!/usr/bin/env node
/**
 * R8 — Measure elapsed ms from mutation confirm/submit to visible UI update.
 * Uncontended local samples; no artificial sleeps as product workarounds.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const storageStatePath =
  process.env.PLAYWRIGHT_STORAGE_STATE ?? path.join("playwright", ".auth", "staff.json");
const lifecyclePath = path.join("playwright", ".fixtures", "r5-lifecycle.json");
const outPath = path.join("docs", "release", "r8-evidence", "mutation-latency.json");

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function openDialogConfirm(page, button, confirmName) {
  await button.scrollIntoViewIfNeeded();
  await button.click({ force: true });
  await page.waitForFunction(() => [...document.querySelectorAll("dialog")].some((d) => d.open), null, {
    timeout: 15_000,
  });
  const idx = await page.locator("dialog").evaluateAll((nodes) =>
    nodes.findIndex((n) => n.open),
  );
  const dialog = page.locator("dialog").nth(idx);
  const confirm = dialog.getByRole("button", { name: confirmName });
  const t0 = Date.now();
  await confirm.click();
  return t0;
}

async function main() {
  if (!fs.existsSync(storageStatePath)) {
    console.error("Missing staff storage state");
    process.exit(1);
  }
  if (!fs.existsSync(lifecyclePath)) {
    console.error("Missing r5-lifecycle.json — run pnpm test:e2e:staff:r5-fixture");
    process.exit(1);
  }
  const lifecycle = JSON.parse(fs.readFileSync(lifecyclePath, "utf8"));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storageStatePath, baseURL });
  const page = await context.newPage();
  const samples = {
    startWorking: [],
    checkAvailability: [],
    placeHold: [],
    releaseHold: [],
    confirmBooking: [],
    cancelBooking: [],
  };
  const notes = [];

  // --- HOLD path: Start Working, Check Availability, Place HOLD, Release ---
  await page.goto(lifecycle.hold.inquiryPath, { waitUntil: "networkidle" });
  if (page.url().includes("sign-in")) {
    console.error("Signed out");
    process.exit(1);
  }

  const start = page.getByRole("button", { name: /^Start Working$/i }).first();
  if ((await start.count()) > 0 && (await start.isEnabled().catch(() => false))) {
    const t0 = Date.now();
    await start.click({ force: true });
    await page.getByText(/Assigned to|Being worked by|In progress/i).first().waitFor({ timeout: 60_000 });
    samples.startWorking.push(Date.now() - t0);
  } else {
    notes.push("startWorking: skipped (already assigned)");
  }

  const check = page.getByRole("button", { name: /^Check Availability$/i }).first();
  if ((await check.count()) > 0 && (await check.isEnabled().catch(() => false))) {
    const t0 = Date.now();
    await check.click({ force: true });
    await page
      .getByText(/Available|Availability checked|Within operating|Unavailable/i)
      .first()
      .waitFor({ timeout: 60_000 });
    samples.checkAvailability.push(Date.now() - t0);
  } else {
    notes.push("checkAvailability: skipped (not available)");
  }

  const placeHold = page.locator("#hold-readiness").getByRole("button", { name: /^Place HOLD$/i }).first();
  if ((await placeHold.count()) > 0 && (await placeHold.isEnabled().catch(() => false))) {
    const t0 = await openDialogConfirm(page, placeHold, /^Place HOLD$/i);
    await page.locator("#hold-readiness").getByText(/^Active \(/i).waitFor({ timeout: 90_000 });
    samples.placeHold.push(Date.now() - t0);
  } else {
    notes.push("placeHold: skipped (control unavailable)");
  }

  const release = page.getByRole("button", { name: /Release hold/i }).first();
  if ((await release.count()) > 0 && (await release.isEnabled().catch(() => false))) {
    const t0 = await openDialogConfirm(page, release, /Release/i);
    await page.getByText(/Holds released|Hold released|No active HOLD/i).first().waitFor({ timeout: 90_000 });
    samples.releaseHold.push(Date.now() - t0);
  } else {
    notes.push("releaseHold: skipped (control unavailable)");
  }

  // --- Confirm path ---
  await page.goto(lifecycle.confirm.inquiryPath, { waitUntil: "networkidle" });
  const start2 = page.getByRole("button", { name: /^Start Working$/i }).first();
  if ((await start2.count()) > 0 && (await start2.isEnabled().catch(() => false))) {
    const t0 = Date.now();
    await start2.click({ force: true });
    await page.getByText(/Assigned to|Being worked by|In progress/i).first().waitFor({ timeout: 60_000 });
    samples.startWorking.push(Date.now() - t0);
  }
  const check2 = page.getByRole("button", { name: /^Check Availability$/i }).first();
  if ((await check2.count()) > 0 && (await check2.isEnabled().catch(() => false))) {
    const t0 = Date.now();
    await check2.click({ force: true });
    await page
      .getByText(/Available|Availability checked|Within operating|Unavailable/i)
      .first()
      .waitFor({ timeout: 60_000 });
    samples.checkAvailability.push(Date.now() - t0);
  }

  const confirmBtn = page.getByRole("button", { name: /^Confirm booking$/i, disabled: false }).first();
  if ((await confirmBtn.count()) > 0 && (await confirmBtn.isEnabled().catch(() => false))) {
    const t0 = await openDialogConfirm(page, confirmBtn, /^Confirm booking$/i);
    await page.waitForURL(/\/app\/bookings\/[^/]+/, { timeout: 120_000 });
    samples.confirmBooking.push(Date.now() - t0);

    // Cancel from booking detail
    const cancel = page.getByRole("button", { name: /^Cancel Booking$/i }).first();
    if ((await cancel.count()) > 0 && (await cancel.isEnabled().catch(() => false))) {
      const t1 = await openDialogConfirm(page, cancel, /^Cancel booking$/i);
      await page.getByText(/Booking cancelled|Cancelled/i).first().waitFor({ timeout: 90_000 });
      samples.cancelBooking.push(Date.now() - t1);
    } else {
      notes.push("cancelBooking: skipped (control unavailable on booking detail)");
    }
  } else {
    notes.push("confirmBooking: skipped (control unavailable)");
  }

  // Second HOLD sample on a fresh navigation if Place HOLD still possible after release
  await page.goto(lifecycle.hold.inquiryPath, { waitUntil: "networkidle" });
  const place2 = page.locator("#hold-readiness").getByRole("button", { name: /^Place HOLD$/i }).first();
  if ((await place2.count()) > 0 && (await place2.isEnabled().catch(() => false))) {
    const t0 = await openDialogConfirm(page, place2, /^Place HOLD$/i);
    await page.locator("#hold-readiness").getByText(/^Active \(/i).waitFor({ timeout: 90_000 });
    samples.placeHold.push(Date.now() - t0);
    const release2 = page.getByRole("button", { name: /Release hold/i }).first();
    if ((await release2.count()) > 0 && (await release2.isEnabled().catch(() => false))) {
      const t1 = await openDialogConfirm(page, release2, /Release/i);
      await page.getByText(/Holds released|Hold released|No active HOLD/i).first().waitFor({ timeout: 90_000 });
      samples.releaseHold.push(Date.now() - t1);
    }
  }

  const summary = {};
  for (const [key, values] of Object.entries(samples)) {
    summary[key] = {
      samplesMs: values,
      count: values.length,
      medianMs: median(values),
      worstMs: values.length ? Math.max(...values) : null,
      hardReloadRequired: false,
    };
  }

  const payload = {
    createdAt: new Date().toISOString(),
    baseURL,
    hardReloadRequiredOverall: false,
    notes,
    summary,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.info(JSON.stringify(payload, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
