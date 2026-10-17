import fs from "node:fs";
import path from "node:path";

export const DEFAULT_STAFF_INQUIRY_FIXTURE = path.join("playwright", ".fixtures", "staff-inquiry.json");

export type StaffInquiryFixture = {
  createdAt: string;
  databaseHost: string;
  organizationSlug: string;
  organizationName: string;
  inquiryId: string;
  inquiryPath: string;
  publicToken: string | null;
  planCount: number;
  /** Present when fixture selects a plan so Live Agent readiness panels render. */
  selectedPlanId?: string;
  email: string;
  note: string;
};

export type StaffFixtureResolution =
  | { ok: true; fixture: StaffInquiryFixture }
  | { ok: false; reason: string };

export function resolveStaffInquiryFixture(filePath?: string): StaffFixtureResolution {
  const resolvedPath =
    filePath ?? process.env.PLAYWRIGHT_STAFF_INQUIRY_FIXTURE ?? DEFAULT_STAFF_INQUIRY_FIXTURE;

  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      reason: `Staff inquiry fixture missing at ${resolvedPath}. Run: corepack pnpm test:e2e:staff:fixture`,
    };
  }

  try {
    const fixture = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) as StaffInquiryFixture;
    if (!fixture.inquiryId || !fixture.inquiryPath || !fixture.organizationSlug) {
      return { ok: false, reason: `Staff inquiry fixture at ${resolvedPath} is incomplete.` };
    }
    return { ok: true, fixture };
  } catch {
    return { ok: false, reason: `Staff inquiry fixture at ${resolvedPath} is not valid JSON.` };
  }
}

/** Mutations (HOLD/confirm) require explicit opt-in — default is read-only observation. */
export function staffMutationsEnabled(): boolean {
  return process.env.PLAYWRIGHT_STAFF_MUTATIONS === "1";
}

export const DEFAULT_R5_LIFECYCLE_FIXTURE = path.join("playwright", ".fixtures", "r5-lifecycle.json");

export type R5LifecycleFixture = {
  createdAt: string;
  databaseHost: string;
  organizationSlug: string;
  hold: {
    inquiryId: string;
    inquiryPath: string;
    selectedPlanId?: string;
    email: string;
    preferredDate?: string;
  };
  confirm: {
    inquiryId: string;
    inquiryPath: string;
    selectedPlanId?: string;
    email: string;
    preferredDate?: string;
  };
  note?: string;
};

export type R5LifecycleResolution =
  | { ok: true; fixture: R5LifecycleFixture }
  | { ok: false; reason: string };

export function resolveR5LifecycleFixture(filePath?: string): R5LifecycleResolution {
  const resolvedPath =
    filePath ?? process.env.PLAYWRIGHT_R5_LIFECYCLE_FIXTURE ?? DEFAULT_R5_LIFECYCLE_FIXTURE;

  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      reason: `R5 lifecycle fixture missing at ${resolvedPath}. Run: corepack pnpm test:e2e:staff:r5-fixture`,
    };
  }

  try {
    const fixture = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) as R5LifecycleFixture;
    if (!fixture.hold?.inquiryPath || !fixture.confirm?.inquiryPath || !fixture.organizationSlug) {
      return { ok: false, reason: `R5 lifecycle fixture at ${resolvedPath} is incomplete.` };
    }
    return { ok: true, fixture };
  } catch {
    return { ok: false, reason: `R5 lifecycle fixture at ${resolvedPath} is not valid JSON.` };
  }
}

export const DEFAULT_R7_CONFLICT_FIXTURE = path.join("playwright", ".fixtures", "r7-conflict.json");

export type R7ConflictFixture = {
  createdAt: string;
  databaseHost: string;
  organizationSlug: string;
  preferredDate: string;
  startTime?: string;
  winner: {
    inquiryId: string;
    inquiryPath: string;
    email: string;
    preferredDate?: string;
  };
  loser: {
    inquiryId: string;
    inquiryPath: string;
    email: string;
    preferredDate?: string;
  };
  note?: string;
};

export type R7ConflictResolution =
  | { ok: true; fixture: R7ConflictFixture }
  | { ok: false; reason: string };

export function resolveR7ConflictFixture(filePath?: string): R7ConflictResolution {
  const resolvedPath =
    filePath ?? process.env.PLAYWRIGHT_R7_CONFLICT_FIXTURE ?? DEFAULT_R7_CONFLICT_FIXTURE;

  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      reason: `R7 conflict fixture missing at ${resolvedPath}. Run: corepack pnpm test:e2e:staff:r7-fixture`,
    };
  }

  try {
    const fixture = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) as R7ConflictFixture;
    if (!fixture.winner?.inquiryPath || !fixture.loser?.inquiryPath || !fixture.organizationSlug) {
      return { ok: false, reason: `R7 conflict fixture at ${resolvedPath} is incomplete.` };
    }
    return { ok: true, fixture };
  } catch {
    return { ok: false, reason: `R7 conflict fixture at ${resolvedPath} is not valid JSON.` };
  }
}
