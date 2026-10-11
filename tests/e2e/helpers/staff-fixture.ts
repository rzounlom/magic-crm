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
