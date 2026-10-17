#!/usr/bin/env node
/**
 * R9 — Measure HOLD/Confirm latency with reliable browser-visible transitions.
 * Does not treat pre-existing "Available" copy as completion.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const storageStatePath =
  process.env.PLAYWRIGHT_STORAGE_STATE ?? path.join("playwright", ".auth", "staff.json");
const lifecyclePath = path.join("playwright", ".fixtures", "r5-lifecycle.json");
const outPath = path.join("docs", "release", "r9-evidence", "mutation-latency.json");

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
  const idx = await page.locator("dialog").evaluateAll((nodes) => nodes.findIndex((n) => n.open));
  const dialog = page.locator("dialog").nth(idx);
  const confirm = dialog.getByRole("button", { name: confirmName });
  const t0 = Date.now();
  await confirm.click();
  return t0;
}

async function main() {
  if (!fs.existsSync(storageStatePath) || !fs.existsSync(lifecyclePath)) {
    console.error("Missing staff auth or r5-lifecycle fixture");
    process.exit(1);
  }
  const lifecycle = JSON.parse(fs.readFileSync(lifecyclePath, "utf8"));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storageStatePath, baseURL });
  const page = await context.newPage();
  const samples = {
    placeHold: [],
    confirmBooking: [],
  };
  const notes = [];

  // --- Place HOLD: require transition into Active HOLD text ---
  await page.goto(lifecycle.hold.inquiryPath, { waitUntil: "domcontentloaded" });
  if (page.url().includes("sign-in")) {
    console.error("Signed out");
    process.exit(1);
  }

  const holdPanel = page.locator("#hold-readiness");
  const alreadyActive = await holdPanel.getByText(/^Active \(/i).count();
  if (alreadyActive > 0) {
    notes.push("placeHold: fixture already active; releasing first");
    const release = page.getByRole("button", { name: /Release hold/i }).first();
    if ((await release.count()) > 0) {
      const tRel = await openDialogConfirm(page, release, /Release/i);
      await holdPanel.getByText(/No active HOLD/i).waitFor({ timeout: 90_000 });
      notes.push(`preReleaseMs=${Date.now() - tRel}`);
    }
  }

  // Ensure Place HOLD is enabled (wait for control state — not pre-existing Available copy)
  const check = page.getByRole("button", { name: /^Check Availability$/i }).first();
  const placeHold = holdPanel.getByRole("button", { name: /^Place HOLD$/i }).first();
  if ((await placeHold.count()) === 0 || !(await placeHold.isEnabled().catch(() => false))) {
    if ((await check.count()) > 0 && (await check.isEnabled().catch(() => false))) {
      await check.click({ force: true });
      await placeHold.waitFor({ state: "visible", timeout: 60_000 });
      await expectEnabled(placeHold, 60_000);
    }
  }

  if ((await placeHold.count()) > 0 && (await placeHold.isEnabled().catch(() => false))) {
    // Capture absence of Active before confirm
    await expectAbsentActive(holdPanel);
    const t0 = await openDialogConfirm(page, placeHold, /^Place HOLD$/i);
    await holdPanel.getByText(/^Active \(/i).waitFor({ timeout: 90_000 });
    samples.placeHold.push(Date.now() - t0);
  } else {
    notes.push("placeHold: control unavailable");
  }

  // --- Confirm: URL change to booking detail is the completion signal ---
  await page.goto(lifecycle.confirm.inquiryPath, { waitUntil: "domcontentloaded" });
  const start = page.getByRole("button", { name: /^Start Working$/i }).first();
  if ((await start.count()) > 0 && (await start.isEnabled().catch(() => false))) {
    await start.click({ force: true });
    await page.getByText(/Assigned to|Being worked by|In progress/i).first().waitFor({ timeout: 60_000 });
  }
  const confirmBtn = page.getByRole("button", { name: /^Confirm booking$/i }).first();
  const check2 = page.getByRole("button", { name: /^Check Availability$/i }).first();
  if ((await confirmBtn.count()) === 0 || !(await confirmBtn.isEnabled().catch(() => false))) {
    if ((await check2.count()) > 0 && (await check2.isEnabled().catch(() => false))) {
      await check2.click({ force: true });
      await expectEnabled(confirmBtn, 60_000);
    }
  }
  if ((await confirmBtn.count()) > 0 && (await confirmBtn.isEnabled().catch(() => false))) {
    const t0 = await openDialogConfirm(page, confirmBtn, /^Confirm booking$/i);
    await page.waitForURL(/\/app\/bookings\/[^/]+/, { timeout: 120_000 });
    samples.confirmBooking.push(Date.now() - t0);
  } else {
    notes.push("confirmBooking: control unavailable");
  }

  // Second HOLD sample on fresh fixture path if still placeable after release
  await page.goto(lifecycle.hold.inquiryPath, { waitUntil: "domcontentloaded" });
  const release2 = page.getByRole("button", { name: /Release hold/i }).first();
  if ((await release2.count()) > 0 && (await release2.isEnabled().catch(() => false))) {
    await openDialogConfirm(page, release2, /Release/i);
    await page.locator("#hold-readiness").getByText(/No active HOLD/i).waitFor({ timeout: 90_000 });
  }
  const place2 = page.locator("#hold-readiness").getByRole("button", { name: /^Place HOLD$/i }).first();
  if ((await place2.count()) > 0 && (await place2.isEnabled().catch(() => false))) {
    const t0 = await openDialogConfirm(page, place2, /^Place HOLD$/i);
    await page.locator("#hold-readiness").getByText(/^Active \(/i).waitFor({ timeout: 90_000 });
    samples.placeHold.push(Date.now() - t0);
  }

  const summary = {};
  for (const [key, values] of Object.entries(samples)) {
    summary[key] = {
      samplesMs: values,
      count: values.length,
      medianMs: median(values),
      worstMs: values.length ? Math.max(...values) : null,
      hardReloadRequired: false,
      completionSignal:
        key === "placeHold" ? "hold-readiness Active (…)" : "URL /app/bookings/:id",
    };
  }
  const payload = {
    createdAt: new Date().toISOString(),
    baseURL,
    hardReloadRequiredOverall: false,
    notes,
    summary,
    r8BaselineMedianMs: { placeHold: 4858, confirmBooking: 5000 },
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.info(JSON.stringify(payload, null, 2));
  await browser.close();
}

async function expectAbsentActive(holdPanel) {
  const count = await holdPanel.getByText(/^Active \(/i).count();
  if (count > 0) {
    throw new Error("Expected no Active HOLD before Place HOLD measurement");
  }
}

async function expectEnabled(locator, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await locator.count()) > 0 && (await locator.isEnabled().catch(() => false))) {
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Control did not become enabled in time");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
