/**
 * Phase 10I — Read-only Production preflight for Generations Main Location hours proposal.
 * Never writes. Never marks VERIFIED.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const ORG_ID = "mdutc2nkvpafezukeem8942v";
const EXPECTED_SLUG = "generations-crm-test-1788129640704833684";
const MAIN_LOCATION_ID = "rysftywo62ve9sao10dk71si";
const EXPECTED_TZ = "America/Indiana/Indianapolis";
const SYNTHETIC_ORG = "huqlb9wiygqegwo8fy53f8dw";
const OUT = path.join("playwright", ".fixtures", "phase-10i-hours-preflight.json");

function minuteLabel(minute: number): string {
  const dayOffset = Math.floor(minute / 1440);
  const m = ((minute % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const base = `${h12}:${String(min).padStart(2, "0")} ${period}`;
  return dayOffset > 0 ? `${base} (+${dayOffset}d)` : base;
}

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  const env = parseRuntimeEnv(process.env);
  const host = new URL(env.DATABASE_URL).hostname;
  if (!host.includes("ep-bold-art")) {
    throw new Error(`Refused: unexpected host ${host}`);
  }

  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const organization = await database.organization.findFirst({
      where: { id: ORG_ID, slug: EXPECTED_SLUG },
      select: { id: true, slug: true, name: true, customerFacingName: true },
    });
    if (!organization) {
      throw new Error("Generations dual-match org missing");
    }

    const location = await database.location.findFirst({
      where: { id: MAIN_LOCATION_ID, organizationId: ORG_ID },
      select: { id: true, name: true, slug: true, timezone: true, active: true },
    });
    if (!location) {
      throw new Error("Main Location missing");
    }

    const policy = await database.locationOperatingHoursPolicy.findFirst({
      where: { organizationId: ORG_ID, locationId: MAIN_LOCATION_ID },
      include: {
        weeklyWindows: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
        exceptions: { orderBy: { localDate: "asc" } },
      },
    });

    const otherLocationPolicies = await database.locationOperatingHoursPolicy.findMany({
      where: { organizationId: ORG_ID, locationId: { not: MAIN_LOCATION_ID } },
      select: {
        locationId: true,
        verificationStatus: true,
        _count: { select: { weeklyWindows: true, exceptions: true } },
      },
    });

    const syntheticPolicies = await database.locationOperatingHoursPolicy.count({
      where: { organizationId: SYNTHETIC_ORG },
    });

    const staffExceptionsOpen = await database.operatingHoursStaffException.count({
      where: {
        organizationId: ORG_ID,
        locationId: MAIN_LOCATION_ID,
        revokedAt: null,
        consumedAt: null,
      },
    });

    const before = {
      verificationStatus: policy?.verificationStatus ?? "UNCONFIGURED",
      approvedAt: policy?.approvedAt?.toISOString() ?? null,
      approvedByNote: policy?.approvedByNote ?? null,
      weeklyWindows:
        policy?.weeklyWindows.map((w) => ({
          dayOfWeek: w.dayOfWeek,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
          startLabel: minuteLabel(w.startMinute),
          endLabel: minuteLabel(w.endMinute),
        })) ?? [],
      exceptions:
        policy?.exceptions.map((e) => ({
          localDate: e.localDate.toISOString().slice(0, 10),
          kind: e.kind,
          startMinute: e.startMinute,
          endMinute: e.endMinute,
          note: e.note,
        })) ?? [],
    };

    const payload = {
      ok: true,
      readOnly: true,
      databaseHost: host,
      organization,
      location,
      timezoneMatch: location.timezone === EXPECTED_TZ,
      expectedTimezone: EXPECTED_TZ,
      before,
      otherLocationPolicies,
      syntheticPolicyCount: syntheticPolicies,
      openStaffExceptionsOnMain: staffExceptionsOpen,
      note: "No Production writes performed.",
    };
    writeFileSync(OUT, JSON.stringify(payload, null, 2));
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await database.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
