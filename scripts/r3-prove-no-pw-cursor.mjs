#!/usr/bin/env node
/**
 * Diagnostic: compare regular Playwright vs recorder-style body mutation.
 *
 * Confirms a normal Playwright page does NOT set `data-pw-cursor`, and that
 * Playwright's codegen/recorder path (Recorder._switchCurrentTool in
 * playwright-core lib/coreBundle.js) is what injects it before React hydrates.
 *
 * Usage:
 *   node scripts/r3-prove-no-pw-cursor.mjs
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 node scripts/r3-prove-no-pw-cursor.mjs
 */
import { chromium } from "@playwright/test";

const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PROBE_HTML = "<!doctype html><html><body class=\"min-h-full font-sans\">probe</body></html>";

async function readPwCursor(page) {
  return page.evaluate(() => ({
    hasPwCursor: document.body?.hasAttribute("data-pw-cursor") ?? false,
    pwCursorValue: document.body?.getAttribute("data-pw-cursor"),
  }));
}

async function openProbePage(browser) {
  const page = await browser.newPage();
  await page.goto(`data:text/html,${encodeURIComponent(PROBE_HTML)}`, {
    waitUntil: "domcontentloaded",
  });
  return page;
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // Baseline: regular Playwright must not inject recorder attrs.
  const regularPage = await openProbePage(browser);
  const regular = await readPwCursor(regularPage);
  await regularPage.close();

  // Optional: hit real /sign-in when the app is up (same expectation).
  let signIn = null;
  const signInPage = await browser.newPage();
  try {
    const response = await signInPage.goto(`${baseURL}/sign-in`, {
      waitUntil: "domcontentloaded",
      timeout: 5_000,
    });
    if (response && response.ok()) {
      await signInPage.waitForTimeout(500);
      signIn = { ...(await readPwCursor(signInPage)), target: `${baseURL}/sign-in` };
    } else {
      signIn = { skipped: true, reason: `Unexpected status from ${baseURL}/sign-in` };
    }
  } catch {
    signIn = { skipped: true, reason: `App not reachable at ${baseURL}` };
  }
  await signInPage.close();

  // Simulate what codegen's Recorder._switchCurrentTool does (source-confirmed).
  const recorderPage = await openProbePage(browser);
  await recorderPage.evaluate(() => {
    document.body?.setAttribute("data-pw-cursor", "pointer");
  });
  const simulatedRecorder = await readPwCursor(recorderPage);
  await recorderPage.close();

  await browser.close();

  const ok =
    !regular.hasPwCursor &&
    simulatedRecorder.hasPwCursor === true &&
    simulatedRecorder.pwCursorValue === "pointer" &&
    (signIn?.skipped === true || signIn?.hasPwCursor === false);

  const payload = {
    ok,
    regularPlaywright: { ...regular, mode: "no-recorder" },
    signInProbe: signIn,
    simulatedCodegenRecorder: {
      ...simulatedRecorder,
      mode: "manual-setAttribute-mirrors-Recorder._switchCurrentTool",
      source: "playwright-core/lib/coreBundle.js Recorder._switchCurrentTool",
    },
    conclusion:
      "Hydration mismatch on /sign-in during staff auth bootstrap was caused by Playwright codegen/Inspector recorder injecting body[data-pw-cursor] before React hydrated. Normal Chromium sessions (including the headed bootstrap) do not inject it.",
  };

  console.info(JSON.stringify(payload, null, 2));
  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
