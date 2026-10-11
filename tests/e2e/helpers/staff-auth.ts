import fs from "node:fs";
import path from "node:path";

export const DEFAULT_STAFF_STORAGE_STATE = path.join("playwright", ".auth", "staff.json");
export const DEFAULT_STAFF_AUTH_META = path.join("playwright", ".auth", "staff.meta.json");

export type StaffAuthMeta = {
  createdAt: string;
  baseUrl: string;
  storageStatePath: string;
  clerkPublishableKeyKind: "test" | "unknown";
  expectedOrganizationSlug: string | null;
  note: string;
};

export type StaffAuthResolution =
  | { ok: true; storageStatePath: string; meta: StaffAuthMeta | null }
  | { ok: false; reason: string };

type StorageCookie = { name?: string };

type StorageStateFile = {
  cookies?: StorageCookie[];
  origins?: unknown[];
};

function looksLikeClerkCookie(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("clerk") ||
    lower === "__session" ||
    lower.startsWith("__client") ||
    lower.startsWith("__refresh")
  );
}

/**
 * Resolve Playwright storage state for authenticated staff specs.
 * Never logs cookie values or session tokens.
 */
export function resolveStaffAuth(options?: {
  storageStatePath?: string;
  metaPath?: string;
  requireMeta?: boolean;
}): StaffAuthResolution {
  const storageStatePath = options?.storageStatePath ?? process.env.PLAYWRIGHT_STORAGE_STATE ?? DEFAULT_STAFF_STORAGE_STATE;
  const metaPath = options?.metaPath ?? DEFAULT_STAFF_AUTH_META;

  if (!storageStatePath) {
    return {
      ok: false,
      reason: "PLAYWRIGHT_STORAGE_STATE unset and default playwright/.auth/staff.json missing.",
    };
  }

  if (!fs.existsSync(storageStatePath)) {
    return {
      ok: false,
      reason: `Storage state file not found at ${storageStatePath}. Run: corepack pnpm test:e2e:staff:auth`,
    };
  }

  let parsed: StorageStateFile;
  try {
    parsed = JSON.parse(fs.readFileSync(storageStatePath, "utf8")) as StorageStateFile;
  } catch {
    return { ok: false, reason: `Storage state at ${storageStatePath} is not valid JSON.` };
  }

  const cookies = Array.isArray(parsed.cookies) ? parsed.cookies : [];
  if (cookies.length === 0) {
    return { ok: false, reason: "Storage state has no cookies — session was not saved." };
  }

  const cookieNames = cookies.map((row) => row.name ?? "").filter(Boolean);
  if (!cookieNames.some(looksLikeClerkCookie)) {
    return {
      ok: false,
      reason: "Storage state cookies do not look like a Clerk session. Re-run staff auth bootstrap against the TEST Clerk app.",
    };
  }

  let meta: StaffAuthMeta | null = null;
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as StaffAuthMeta;
    } catch {
      return { ok: false, reason: `Auth meta at ${metaPath} is not valid JSON.` };
    }
    if (meta.clerkPublishableKeyKind !== "test") {
      return {
        ok: false,
        reason: "Auth meta is not bound to a Clerk TEST publishable key (pk_test_). Refusing to use this session.",
      };
    }
  } else if (options?.requireMeta) {
    return {
      ok: false,
      reason: `Missing ${metaPath}. Re-run corepack pnpm test:e2e:staff:auth so environment binding is recorded.`,
    };
  }

  return { ok: true, storageStatePath, meta };
}

export function staffAuthSkipReason(): string {
  const resolved = resolveStaffAuth();
  return resolved.ok
    ? ""
    : `${resolved.reason} Authenticated staff browser coverage remains BLOCKED until a human completes Clerk TEST sign-in.`;
}
