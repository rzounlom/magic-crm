#!/usr/bin/env node
/**
 * R3 — Interactive Clerk TEST storage-state bootstrap for Playwright staff specs.
 *
 * Opens Playwright codegen against /app, waits for human sign-in, saves storage
 * to playwright/.auth/staff.json (gitignored), and writes a non-secret meta file.
 *
 * Never prints cookies, tokens, or session values.
 */
import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

config();
config({ path: ".env.local", override: true });

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const authDir = path.join("playwright", ".auth");
const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE ?? path.join(authDir, "staff.json");
const metaPath = path.join(authDir, "staff.meta.json");
const expectedOrgSlug = (process.env.PLAYWRIGHT_STAFF_ORG_SLUG ?? process.env.PLAYWRIGHT_PUBLIC_ORG_SLUG ?? "").trim() || null;

function fail(message) {
  console.error(message);
  process.exit(1);
}

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

fs.mkdirSync(authDir, { recursive: true });

console.info(`
R3 staff auth bootstrap
-----------------------
1. Ensure the app is running at ${baseURL} (corepack pnpm dev or pnpm start).
2. Sign in with a dedicated Clerk TEST user in the headed window.
3. Confirm you land on /app for a non-production organization.
4. Close the codegen window when done — storage is saved automatically.

Storage (gitignored): ${storageStatePath}
Expected org slug:    ${expectedOrgSlug ?? "(unset — set PLAYWRIGHT_STAFF_ORG_SLUG)"}
`);

const result = spawnSync(
  "corepack",
  ["pnpm", "exec", "playwright", "codegen", `${baseURL}/app`, `--save-storage=${storageStatePath}`],
  { stdio: "inherit", shell: process.platform === "win32" },
);

if (result.status !== 0 && result.status !== null) {
  fail(`Playwright codegen exited with status ${result.status}.`);
}

if (!fs.existsSync(storageStatePath)) {
  fail("Storage state file was not created. Complete sign-in before closing codegen.");
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
  note: "Non-secret metadata only. Never commit playwright/.auth/.",
};
fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });

console.info(
  JSON.stringify(
    {
      ok: true,
      storageStatePath,
      metaPath,
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
