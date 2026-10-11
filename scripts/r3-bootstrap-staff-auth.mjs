#!/usr/bin/env node
/**
 * R3 — Interactive Clerk TEST storage-state bootstrap for Playwright staff specs.
 *
 * Uses a normal headed Chromium session (NOT `playwright codegen` / Inspector).
 * Codegen injects `data-pw-cursor` on <body> via the recorder overlay, which races
 * React hydration on Next.js and produces a hydration mismatch warning. This
 * bootstrap avoids the recorder entirely.
 *
 * Never prints cookies, tokens, or session values.
 */
import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

config();
config({ path: ".env.local", override: true });

const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const authDir = path.join("playwright", ".auth");
const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE ?? path.join(authDir, "staff.json");
const metaPath = path.join(authDir, "staff.meta.json");
const expectedOrgSlug =
  (process.env.PLAYWRIGHT_STAFF_ORG_SLUG ?? process.env.PLAYWRIGHT_PUBLIC_ORG_SLUG ?? "").trim() || null;
const signInTimeoutMs = Number(process.env.PLAYWRIGHT_STAFF_AUTH_TIMEOUT_MS ?? 10 * 60 * 1000);
const dryRun = process.argv.includes("--dry-run");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertTestClerkKeys() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  if (!publishableKey.startsWith("pk_test_")) {
    fail(
      publishableKey.startsWith("pk_live_")
        ? "Refused: Clerk publishable key is LIVE. Use a TEST Clerk application (pk_test_)."
        : "Refused: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY missing or not pk_test_.",
    );
  }

  const secretKey = process.env.CLERK_SECRET_KEY ?? "";
  if (secretKey.startsWith("sk_live_")) {
    fail("Refused: CLERK_SECRET_KEY is LIVE (sk_live_).");
  }
}

async function assertAppReachable() {
  try {
    const response = await fetch(`${baseURL}/sign-in`, { redirect: "manual" });
    if (response.status >= 500) {
      fail(`App at ${baseURL} returned HTTP ${response.status}. Start the app first.`);
    }
  } catch {
    fail(`App not reachable at ${baseURL}. Start with: corepack pnpm dev  (or pnpm build && pnpm start)`);
  }
}

/**
 * After sign-in, require /app and (when configured) an organization context chip
 * that does not contradict the expected non-production slug.
 */
async function assertAuthenticatedDestination(page) {
  const url = page.url();
  if (!url.includes("/app")) {
    fail(`Expected to land on /app after sign-in; current URL is not an app route.`);
  }
  if (url.includes("sign-in")) {
    fail("Still on sign-in after timeout — session was not established.");
  }

  // Soft org check: if a context chip is present and we know the expected slug,
  // ensure the page text does not look like a production-only brand mismatch.
  if (expectedOrgSlug) {
    const chip = page.locator("[data-employee-context]");
    if ((await chip.count()) > 0) {
      const text = (await chip.first().innerText()).trim().toLowerCase();
      if (text.includes("production") && text.includes("prod-only")) {
        fail("Organization context looks production-bound. Use a non-production TEST org.");
      }
      // Prefer affirmative match when the slug appears in the org name/label.
      const slugToken = expectedOrgSlug.toLowerCase().replace(/-/g, " ");
      const compact = text.replace(/[^a-z0-9]+/g, "");
      const slugCompact = expectedOrgSlug.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (
        slugCompact.length >= 4 &&
        !compact.includes(slugCompact) &&
        !text.includes(slugToken) &&
        !text.includes(expectedOrgSlug.toLowerCase())
      ) {
        console.warn(
          JSON.stringify({
            ok: true,
            warning:
              "Organization context chip did not clearly include PLAYWRIGHT_STAFF_ORG_SLUG; confirm the active org manually before trusting this session.",
            expectedOrganizationSlug: expectedOrgSlug,
          }),
        );
      }
    }
  }
}

async function main() {
  assertTestClerkKeys();
  fs.mkdirSync(authDir, { recursive: true });

  if (dryRun) {
    console.info(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          baseURL,
          storageStatePath,
          expectedOrganizationSlug: expectedOrgSlug,
          usesCodegen: false,
          note: "Recorder/codegen avoided to prevent data-pw-cursor hydration races.",
        },
        null,
        2,
      ),
    );
    return;
  }

  await assertAppReachable();

  console.info(`
R3 staff auth bootstrap (headed Chromium — no codegen)
------------------------------------------------------
1. App: ${baseURL}
2. A headed Chrome for Testing window will open at /sign-in.
3. Sign in with a dedicated Clerk TEST user.
4. Confirm you land on /app for a non-production organization
   (expected slug: ${expectedOrgSlug ?? "(unset — set PLAYWRIGHT_STAFF_ORG_SLUG)"}).
5. This script saves storage automatically once /app is stable.
   Press Ctrl+C to abort without saving.

Storage (gitignored): ${storageStatePath}
Timeout: ${Math.round(signInTimeoutMs / 1000)}s
`);

  const browser = await chromium.launch({
    headless: false,
    // No recorder / inspector — avoids body[data-pw-cursor] injection.
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Prove the recorder attribute is absent in this workflow (diagnostic, non-secret).
  page.on("load", async () => {
    try {
      const hasPwCursor = await page.evaluate(() => document.body?.hasAttribute("data-pw-cursor") ?? false);
      if (hasPwCursor) {
        console.warn(
          JSON.stringify({
            warning: "Unexpected data-pw-cursor on body — recorder may be active. Abort and retry.",
            url: page.url().split("?")[0],
          }),
        );
      }
    } catch {
      // Navigation may tear down the page during checks.
    }
  });

  try {
    await page.goto(`${baseURL}/sign-in`, { waitUntil: "domcontentloaded" });

    const initialPwCursor = await page.evaluate(() => document.body?.hasAttribute("data-pw-cursor") ?? false);
    if (initialPwCursor) {
      await browser.close();
      fail("data-pw-cursor present on first paint — refusing to continue (recorder must not be active).");
    }

    console.info("Waiting for successful navigation to /app after you sign in…");

    await page.waitForURL((url) => {
      const href = typeof url === "string" ? url : url.href;
      return href.includes("/app") && !href.includes("sign-in");
    }, { timeout: signInTimeoutMs });

    // Allow shell chrome to settle so org context is visible when present.
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(750);

    await assertAuthenticatedDestination(page);

    await context.storageState({ path: storageStatePath });
  } catch (error) {
    await browser.close().catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Timeout")) {
      fail("Timed out waiting for /app. Sign in did not complete; storage was not saved.");
    }
    fail(message);
  }

  await browser.close();

  if (!fs.existsSync(storageStatePath)) {
    fail("Storage state file was not created.");
  }

  const verify = spawnSync("node", ["scripts/r3-verify-staff-auth.mjs"], {
    stdio: "inherit",
    env: { ...process.env, PLAYWRIGHT_STORAGE_STATE: storageStatePath },
  });
  if (verify.status !== 0) {
    fail("Storage state failed verification. Delete playwright/.auth/staff.json and retry.");
  }

  const meta = {
    createdAt: new Date().toISOString(),
    baseUrl: baseURL,
    storageStatePath,
    clerkPublishableKeyKind: "test",
    expectedOrganizationSlug: expectedOrgSlug,
    bootstrapMode: "headed-chromium-no-codegen",
    note: "Non-secret metadata only. Never commit playwright/.auth/.",
  };
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });

  console.info(
    JSON.stringify(
      {
        ok: true,
        storageStatePath,
        metaPath,
        bootstrapMode: "headed-chromium-no-codegen",
        next: [
          `export PLAYWRIGHT_STORAGE_STATE="$PWD/${storageStatePath}"`,
          "corepack pnpm test:e2e:staff:auth:verify",
          "corepack pnpm test:e2e:staff:headed",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
