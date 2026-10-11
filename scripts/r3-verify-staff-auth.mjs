#!/usr/bin/env node
/**
 * R3 — Validate Playwright staff storage state without printing secrets.
 *
 * Exit 0 when a Clerk-looking TEST-bound session file is present.
 * Exit 1 with a clear reason otherwise.
 */
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

config();
config({ path: ".env.local", override: true });

const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE ?? path.join("playwright", ".auth", "staff.json");
const metaPath = path.join("playwright", ".auth", "staff.meta.json");

function fail(message) {
  console.error(JSON.stringify({ ok: false, reason: message }, null, 2));
  process.exit(1);
}

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
if (!publishableKey.startsWith("pk_test_")) {
  fail(
    publishableKey.startsWith("pk_live_")
      ? "Local Clerk publishable key is LIVE (pk_live_). Staff browser auth must use a TEST Clerk application."
      : "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing or not a TEST key (pk_test_).",
  );
}

const secretKey = process.env.CLERK_SECRET_KEY ?? "";
if (secretKey.startsWith("sk_live_")) {
  fail("CLERK_SECRET_KEY is LIVE (sk_live_). Refusing staff auth verification against production Clerk.");
}

if (!fs.existsSync(storageStatePath)) {
  fail(`Storage state not found at ${storageStatePath}. Run: corepack pnpm test:e2e:staff:auth`);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(storageStatePath, "utf8"));
} catch {
  fail(`Storage state at ${storageStatePath} is not valid JSON.`);
}

const cookies = Array.isArray(parsed.cookies) ? parsed.cookies : [];
if (cookies.length === 0) {
  fail("Storage state has no cookies.");
}

const cookieNames = cookies.map((row) => row.name ?? "").filter(Boolean);
const clerkLike = cookieNames.some((name) => {
  const lower = name.toLowerCase();
  return (
    lower.includes("clerk") ||
    lower === "__session" ||
    lower.startsWith("__client") ||
    lower.startsWith("__refresh")
  );
});
if (!clerkLike) {
  fail("Storage state cookies do not look like a Clerk session.");
}

let meta = null;
if (fs.existsSync(metaPath)) {
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    fail(`Auth meta at ${metaPath} is not valid JSON.`);
  }
  if (meta.clerkPublishableKeyKind !== "test") {
    fail("Auth meta is not bound to Clerk TEST.");
  }
}

console.info(
  JSON.stringify(
    {
      ok: true,
      storageStatePath,
      cookieCount: cookies.length,
      hasMeta: Boolean(meta),
      clerkPublishableKeyKind: "test",
      expectedOrganizationSlug: meta?.expectedOrganizationSlug ?? null,
      baseUrl: meta?.baseUrl ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
      note: "Cookie names/values intentionally omitted.",
    },
    null,
    2,
  ),
);
