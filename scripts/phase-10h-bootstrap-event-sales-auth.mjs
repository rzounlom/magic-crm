/**
 * Phase 10H — Identity-gated Event Sales Clerk TEST bootstrap.
 *
 * Root cause of prior Admin reuse: Clerk sign-in often offers "Continue as"
 * the last Google/Clerk account (Administrator). This bootstrap:
 * - uses a fresh disposable Chromium userDataDir (no prior Clerk profile)
 * - refuses to load any existing storage state
 * - after /app, resolves Clerk userId via window.Clerk and rejects Administrator
 * - requires synthetic org magiccrm-test-center-b
 * - only then writes playwright/.auth/event-sales.json
 *
 * Never prints cookies/tokens. Never bypasses Clerk.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "dotenv";
import { chromium } from "@playwright/test";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const STORAGE = path.join("playwright", ".auth", "event-sales.json");
const META = path.join("playwright", ".auth", "event-sales.meta.json");
const GATE = path.join("playwright", ".fixtures", "phase-10h-event-sales-identity-gate.json");
const TIMEOUT_MS = Number(process.env.PLAYWRIGHT_STAFF_AUTH_TIMEOUT_MS ?? 15 * 60 * 1000);

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
}

function assertTestClerk() {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  if (!pk.startsWith("pk_test_")) fail("Clerk publishable key is not TEST (pk_test_).");
  if ((process.env.CLERK_SECRET_KEY ?? "").startsWith("sk_live_")) {
    fail("Clerk secret is LIVE — refused.");
  }
}

function redactEmail(email) {
  if (!email || !email.includes("@")) return "***";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

async function main() {
  assertTestClerk();
  if (!fs.existsSync(GATE)) {
    fail(`Missing identity gate ${GATE}. Run: npx tsx --tsconfig tsconfig.json scripts/phase-10h-write-identity-gate.ts`);
  }
  const gate = JSON.parse(fs.readFileSync(GATE, "utf8"));
  const expectedClerkId = gate.eventSales?.clerkUserId;
  const expectedEmail = gate.eventSales?.email;
  const rejectClerkId = gate.rejectAdministrator?.clerkUserId;
  const rejectEmail = gate.rejectAdministrator?.email;
  if (!expectedClerkId || !expectedEmail) fail("Identity gate missing Event Sales clerkUserId/email.");

  // Clear only Event Sales storage (keep staff.json Administrator session intact).
  if (fs.existsSync(STORAGE)) {
    fs.unlinkSync(STORAGE);
    console.info(JSON.stringify({ cleared: STORAGE }));
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiccrm-event-sales-chromium-"));
  console.info(`
PHASE 10H — Event Sales-only Clerk TEST login
---------------------------------------------
App: ${BASE}
Expected account: ${redactEmail(expectedEmail)}  (Event Sales only)
Rejected account: ${redactEmail(rejectEmail)}  (Administrator)

A CLEAN Chromium profile will open (no prior Clerk "Continue as" session).

1. Sign in as the Event Sales account (${redactEmail(expectedEmail)}).
2. If Clerk offers "Continue as ${redactEmail(rejectEmail)}", choose Use another account.
3. After /app, switch org to MagicCRM Test Center B if needed.
4. This script verifies Clerk userId + org before saving storage.

Storage (saved only if identity passes): ${STORAGE}
Profile (temporary): ${userDataDir}
Timeout: ${Math.round(TIMEOUT_MS / 1000)}s
`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());

  try {
    // Force sign-in page; clear any auto-session in this fresh profile (should be none).
    await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });

    console.info("Waiting for owner to sign in as Event Sales…");
    await page.waitForURL(
      (url) => {
        const href = typeof url === "string" ? url : url.href;
        return href.includes("/app") && !href.includes("sign-in");
      },
      { timeout: TIMEOUT_MS },
    );
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(1000);

    // Switch org if needed
    let chip = "";
    try {
      chip = (await page.locator("[data-employee-context]").first().innerText())
        .replace(/\s+/g, " ")
        .trim();
    } catch {
      chip = "";
    }
    if (!/magiccrm-test-center-b/i.test(chip)) {
      console.info(
        JSON.stringify({
          info: "Active org is not synthetic yet — open org switcher and select MagicCRM Test Center B",
          chip,
        }),
      );
      const switcher = page.getByRole("button", { name: /Open organization switcher/i }).first();
      if (await switcher.count()) {
        await switcher.click();
        await page.waitForTimeout(500);
        const target = page.getByText(/MagicCRM Test Center B/i).first();
        await target.click({ timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
        chip = (await page.locator("[data-employee-context]").first().innerText())
          .replace(/\s+/g, " ")
          .trim();
      }
    }
    if (!/magiccrm-test-center-b/i.test(chip) || /generations-crm-test/i.test(chip)) {
      fail(`Active organization is not synthetic after login. Detected chip: ${chip || "(missing)"}`);
    }

    // Resolve Clerk user from client
    const clerkIdentity = await page.evaluate(async () => {
      const clerk = window.Clerk;
      if (!clerk) return { error: "window.Clerk missing" };
      if (!clerk.user) {
        await clerk.load?.();
      }
      const user = clerk.user;
      if (!user) return { error: "Clerk.user missing after load" };
      const primary =
        user.primaryEmailAddress?.emailAddress ??
        user.emailAddresses?.[0]?.emailAddress ??
        null;
      return {
        clerkUserId: user.id,
        email: primary,
        orgId: clerk.organization?.id ?? null,
        orgSlug: clerk.organization?.slug ?? null,
      };
    });

    if (clerkIdentity.error) fail(clerkIdentity.error);

    const detectedEmail = clerkIdentity.email ?? "";
    const detectedClerkId = clerkIdentity.clerkUserId ?? "";

    if (rejectClerkId && detectedClerkId === rejectClerkId) {
      fail(
        `Rejected: authenticated as Administrator (${redactEmail(rejectEmail)}). Event Sales storage was NOT saved. Sign in as ${redactEmail(expectedEmail)} instead.`,
      );
    }
    if (rejectEmail && detectedEmail.toLowerCase() === String(rejectEmail).toLowerCase()) {
      fail(
        `Rejected: authenticated as Administrator (${redactEmail(detectedEmail)}). Event Sales storage was NOT saved.`,
      );
    }
    if (detectedClerkId !== expectedClerkId) {
      fail(
        `Rejected: Clerk userId mismatch. Expected Event Sales ${expectedClerkId.slice(0, 10)}…, got ${detectedClerkId.slice(0, 10)}… (${redactEmail(detectedEmail)}). Storage NOT saved.`,
      );
    }
    if (detectedEmail.toLowerCase() !== expectedEmail.toLowerCase()) {
      fail(
        `Rejected: email mismatch. Expected ${redactEmail(expectedEmail)}, got ${redactEmail(detectedEmail)}. Storage NOT saved.`,
      );
    }

    // Server-side permission confirmation via existing inspect output expectations in gate
    const perms = gate.eventSales.permissions;
    if (perms.locationsManage !== false || perms.quotesApprove !== true || perms.priceOverride !== false) {
      fail("Identity gate permissions are not Event Sales-only — refusing to save.");
    }

    fs.mkdirSync(path.dirname(STORAGE), { recursive: true });
    await context.storageState({ path: STORAGE });
    fs.writeFileSync(
      META,
      `${JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          baseUrl: BASE,
          storageStatePath: STORAGE,
          clerkPublishableKeyKind: "test",
          expectedOrganizationSlug: "magiccrm-test-center-b",
          roleHint: "event_sales_only",
          clerkUserIdPrefix: detectedClerkId.slice(0, 10),
          emailRedacted: redactEmail(detectedEmail),
          activeOrgChip: chip,
          permissions: perms,
          bootstrapMode: "phase-10h-clean-profile-identity-gated",
          note: "Non-secret metadata only. Never commit playwright/.auth/.",
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );

    const verify = spawnSync("node", ["scripts/r3-verify-staff-auth.mjs"], {
      stdio: "inherit",
      env: { ...process.env, PLAYWRIGHT_STORAGE_STATE: STORAGE },
    });
    if (verify.status !== 0) {
      fs.unlinkSync(STORAGE);
      fail("Storage verify failed — deleted event-sales.json.");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          storageStatePath: STORAGE,
          emailRedacted: redactEmail(detectedEmail),
          clerkUserIdPrefix: detectedClerkId.slice(0, 10),
          activeOrgChip: chip,
          permissions: perms,
          note: "Event Sales-only identity verified before save.",
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (fs.existsSync(STORAGE)) {
      // Do not leave a rejected/partial file claiming to be Event Sales
      try {
        fs.unlinkSync(STORAGE);
      } catch {
        // ignore
      }
    }
    if (message.includes("Timeout")) {
      fail("Timed out waiting for /app. Storage was not saved.");
    }
    fail(message);
  } finally {
    await context.close().catch(() => undefined);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // ignore temp cleanup failures
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
