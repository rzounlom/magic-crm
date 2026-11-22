import fs from "node:fs";
import path from "node:path";

export type E2ERole = "administrator" | "event_sales" | "front_desk";

export const E2E_CLERK_AUTH_DIR = path.join("playwright", ".clerk");
export const E2E_IDENTITIES_FIXTURE = path.join(
  "playwright",
  ".fixtures",
  "e2e-test-identities.json",
);
export const E2E_WP_INQUIRY_FIXTURE = path.join(
  "playwright",
  ".fixtures",
  "phase-10g-wp-inquiry.json",
);

export const E2E_ROLE_STORAGE: Record<E2ERole, string> = {
  administrator: path.join(E2E_CLERK_AUTH_DIR, "administrator.json"),
  event_sales: path.join(E2E_CLERK_AUTH_DIR, "event-sales.json"),
  front_desk: path.join(E2E_CLERK_AUTH_DIR, "front-desk.json"),
};

export const E2E_ROLE_META: Record<E2ERole, string> = {
  administrator: path.join(E2E_CLERK_AUTH_DIR, "administrator.meta.json"),
  event_sales: path.join(E2E_CLERK_AUTH_DIR, "event-sales.meta.json"),
  front_desk: path.join(E2E_CLERK_AUTH_DIR, "front-desk.meta.json"),
};

export type E2EIdentityRow = {
  role: E2ERole;
  email: string;
  emailRedacted: string;
  emailEnv: string;
  clerkUserId: string;
  clerkUserIdPrefix: string;
  userProfileId: string;
  systemKey: string;
  hasPriceOverride: boolean;
  hasQuotesApprove: boolean;
  hasInquiriesManage: boolean;
  hasInquiriesView: boolean;
};

export type E2EIdentitiesFixture = {
  ok: boolean;
  organizationSlug: string;
  organizationId: string;
  clerkOrganizationId: string;
  identities: E2EIdentityRow[];
};

export type E2EWpInquiryFixture = {
  organizationId: string;
  organizationSlug: string;
  inquiryId: string;
  inquiryPath: string;
};

export type E2EAuthMeta = {
  createdAt: string;
  role: E2ERole;
  baseUrl: string;
  storageStatePath: string;
  clerkUserIdPrefix: string;
  emailRedacted: string;
  organizationSlug: string;
  clerkOrganizationIdPrefix: string;
  clerkPublishableKeyKind: "test" | "unknown";
  note: string;
};

type StorageCookie = { name?: string };
type StorageStateFile = { cookies?: StorageCookie[] };

function looksLikeClerkCookie(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("clerk") ||
    lower === "__session" ||
    lower.startsWith("__client") ||
    lower.startsWith("__refresh")
  );
}

export function assertLocalhostBaseUrl(raw: string): string {
  const base = raw.replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error(`Invalid PLAYWRIGHT_BASE_URL: ${raw}`);
  }
  if (parsed.hostname === "127.0.0.1") {
    throw new Error(
      "PLAYWRIGHT_BASE_URL must use http://localhost:3000 — never 127.0.0.1 (self-proxy 500).",
    );
  }
  if (parsed.hostname !== "localhost") {
    throw new Error(`PLAYWRIGHT_BASE_URL host must be localhost for E2E (got ${parsed.hostname}).`);
  }
  return base;
}

export function resolveE2EIdentities():
  | { ok: true; fixture: E2EIdentitiesFixture }
  | { ok: false; reason: string } {
  if (!fs.existsSync(E2E_IDENTITIES_FIXTURE)) {
    return {
      ok: false,
      reason: `Missing ${E2E_IDENTITIES_FIXTURE}. Run: pnpm test:e2e:provision`,
    };
  }
  try {
    const fixture = JSON.parse(fs.readFileSync(E2E_IDENTITIES_FIXTURE, "utf8")) as E2EIdentitiesFixture;
    if (!fixture.ok || !fixture.clerkOrganizationId || fixture.identities.length < 3) {
      return { ok: false, reason: "E2E identities fixture is incomplete." };
    }
    if (fixture.organizationSlug !== "magiccrm-test-center-b") {
      return { ok: false, reason: "E2E identities fixture is not magiccrm-test-center-b." };
    }
    return { ok: true, fixture };
  } catch {
    return { ok: false, reason: "E2E identities fixture is not valid JSON." };
  }
}

export function identityForRole(
  fixture: E2EIdentitiesFixture,
  role: E2ERole,
): E2EIdentityRow | null {
  return fixture.identities.find((row) => row.role === role) ?? null;
}

export function resolveE2EWpInquiry():
  | { ok: true; fixture: E2EWpInquiryFixture }
  | { ok: false; reason: string } {
  if (!fs.existsSync(E2E_WP_INQUIRY_FIXTURE)) {
    return {
      ok: false,
      reason: `Missing synthetic WP fixture at ${E2E_WP_INQUIRY_FIXTURE}.`,
    };
  }
  try {
    const fixture = JSON.parse(fs.readFileSync(E2E_WP_INQUIRY_FIXTURE, "utf8")) as E2EWpInquiryFixture;
    if (fixture.organizationSlug !== "magiccrm-test-center-b") {
      return { ok: false, reason: "WP fixture org is not synthetic magiccrm-test-center-b." };
    }
    if (!fixture.inquiryId || !fixture.inquiryPath || !fixture.organizationId) {
      return { ok: false, reason: "WP fixture is incomplete." };
    }
    return { ok: true, fixture };
  } catch {
    return { ok: false, reason: "WP fixture is not valid JSON." };
  }
}

export function resolveE2ERoleAuth(role: E2ERole):
  | { ok: true; storageStatePath: string; meta: E2EAuthMeta | null }
  | { ok: false; reason: string } {
  const storageStatePath = E2E_ROLE_STORAGE[role];
  if (!fs.existsSync(storageStatePath)) {
    return {
      ok: false,
      reason: `Missing ${storageStatePath}. Run: pnpm test:e2e:auth (after pnpm test:e2e:provision).`,
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
    return { ok: false, reason: `Storage state for ${role} has no cookies.` };
  }
  const cookieNames = cookies.map((row) => row.name ?? "").filter(Boolean);
  if (!cookieNames.some(looksLikeClerkCookie)) {
    return {
      ok: false,
      reason: `Storage state for ${role} does not look like a Clerk session.`,
    };
  }

  let meta: E2EAuthMeta | null = null;
  const metaPath = E2E_ROLE_META[role];
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as E2EAuthMeta;
    } catch {
      return { ok: false, reason: `Auth meta at ${metaPath} is not valid JSON.` };
    }
    if (meta.clerkPublishableKeyKind !== "test") {
      return {
        ok: false,
        reason: `Auth meta for ${role} is not bound to a Clerk TEST publishable key.`,
      };
    }
  }

  return { ok: true, storageStatePath, meta };
}

export function e2eRoleEmailEnv(role: E2ERole): string {
  switch (role) {
    case "administrator":
      return "E2E_CLERK_ADMIN_EMAIL";
    case "event_sales":
      return "E2E_CLERK_EVENT_SALES_EMAIL";
    case "front_desk":
      return "E2E_CLERK_FRONT_DESK_EMAIL";
  }
}

export function defaultE2EEmail(role: E2ERole): string {
  switch (role) {
    case "administrator":
      return "e2e.admin+clerk_test@example.com";
    case "event_sales":
      return "e2e.event-sales+clerk_test@example.com";
    case "front_desk":
      return "e2e.front-desk+clerk_test@example.com";
  }
}

export function redactEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 3)}***@${domain}`;
}

export function isSyntheticOrgChip(chip: string): boolean {
  const compact = chip.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return compact.includes("magiccrmtestcenterb") || compact.includes("testcenterb");
}
