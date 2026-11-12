/**
 * Phase 10J — Read-only verification readiness for Generations Main Location hours DRAFT.
 * Never writes. Never marks VERIFIED.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { evaluateOperatingHours } from "@/server/resources/operating-hours";
import {
  OPERATING_HOURS_EVALUATION_STATUSES,
  OPERATING_HOURS_VERIFICATION_STATUSES,
} from "@/types/operating-hours";
import { PERMISSIONS } from "@/types/permissions";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const ORG_ID = "mdutc2nkvpafezukeem8942v";
const LOCATION_ID = "rysftywo62ve9sao10dk71si";
const POLICY_ID = "s07kml2m6xfiwg8ood8vzc6r";
const EXPECTED_TZ = "America/Indiana/Indianapolis";
const EXPECTED_SLUG = "generations-crm-test-1788129640704833684";
const OUT = path.join("playwright", ".fixtures", "phase-10j-hours-verification-readiness.json");

const EXPECTED_WINDOWS: Array<{ dayOfWeek: number; startMinute: number; endMinute: number } | null> =
  [
    { dayOfWeek: 0, startMinute: 720, endMinute: 1200 },
    null,
    null,
    { dayOfWeek: 3, startMinute: 900, endMinute: 1260 },
    { dayOfWeek: 4, startMinute: 900, endMinute: 1260 },
    { dayOfWeek: 5, startMinute: 720, endMinute: 1320 },
    { dayOfWeek: 6, startMinute: 660, endMinute: 1320 },
  ];

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function minuteLabel(minute: number): string {
  const h24 = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(h24).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
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
      select: { id: true, slug: true, customerFacingName: true },
    });
    if (!organization) throw new Error("Generations org missing");

    const location = await database.location.findFirst({
      where: { id: LOCATION_ID, organizationId: ORG_ID },
      select: { id: true, name: true, timezone: true },
    });
    if (!location) throw new Error("Main Location missing");

    const policy = await database.locationOperatingHoursPolicy.findFirst({
      where: { id: POLICY_ID, organizationId: ORG_ID, locationId: LOCATION_ID },
      include: {
        weeklyWindows: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
        exceptions: true,
      },
    });
    if (!policy) throw new Error(`Policy ${POLICY_ID} not found`);

    const weekdayCoverage = DAY_LABELS.map((day, dayOfWeek) => {
      const wins = policy.weeklyWindows.filter((w) => w.dayOfWeek === dayOfWeek);
      const expected = EXPECTED_WINDOWS[dayOfWeek];
      const match =
        expected == null
          ? wins.length === 0
          : wins.length === 1 &&
            wins[0]!.startMinute === expected.startMinute &&
            wins[0]!.endMinute === expected.endMinute;
      return {
        day,
        dayOfWeek,
        expected:
          expected == null
            ? "CLOSED"
            : `${minuteLabel(expected.startMinute)}–${minuteLabel(expected.endMinute)}`,
        actual:
          wins.length === 0
            ? "CLOSED"
            : wins.map((w) => `${minuteLabel(w.startMinute)}–${minuteLabel(w.endMinute)}`).join(", "),
        match,
        windows: wins.map((w) => ({
          startMinute: w.startMinute,
          endMinute: w.endMinute,
          start: minuteLabel(w.startMinute),
          end: minuteLabel(w.endMinute),
        })),
      };
    });

    const adminGroup = await database.securityGroup.findFirst({
      where: { organizationId: ORG_ID, systemKey: "administrators" },
      select: {
        id: true,
        permissions: { select: { permissionDefinition: { select: { key: true } } } },
      },
    });
    const eventSalesGroup = await database.securityGroup.findFirst({
      where: { organizationId: ORG_ID, systemKey: "event_sales" },
      select: {
        id: true,
        permissions: { select: { permissionDefinition: { select: { key: true } } } },
      },
    });
    const adminKeys = new Set(
      adminGroup?.permissions.map((p) => p.permissionDefinition.key) ?? [],
    );
    const salesKeys = new Set(
      eventSalesGroup?.permissions.map((p) => p.permissionDefinition.key) ?? [],
    );

    const draftPolicySnapshot = {
      verificationStatus: policy.verificationStatus,
      weeklyWindows: policy.weeklyWindows.map((w) => ({
        dayOfWeek: w.dayOfWeek,
        startMinute: w.startMinute,
        endMinute: w.endMinute,
      })),
      exceptions: [] as Array<{
        localDate: string;
        kind: string;
        startMinute: number | null;
        endMinute: number | null;
      }>,
    };

    const draftGuard = evaluateOperatingHours({
      policy: draftPolicySnapshot,
      slotDate: "2026-11-18",
      startMinute: 16 * 60,
      endMinute: 18 * 60,
    });

    const verifiedGuard = evaluateOperatingHours({
      policy: {
        ...draftPolicySnapshot,
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
      },
      slotDate: "2026-11-18",
      startMinute: 16 * 60,
      endMinute: 18 * 60,
    });

    const mondayOutside = evaluateOperatingHours({
      policy: {
        ...draftPolicySnapshot,
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
      },
      slotDate: "2026-11-16", // Monday
      startMinute: 16 * 60,
      endMinute: 18 * 60,
    });

    const audit = await database.auditLog.findMany({
      where: {
        organizationId: ORG_ID,
        resourceId: POLICY_ID,
        action: {
          in: [
            "scheduling.hours_policy_draft_saved",
            "scheduling.hours_policy_verified",
            "scheduling.hours_policy_demoted",
          ],
        },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, action: true, createdAt: true, actorUserProfileId: true },
    });

    const payload = {
      ok: true,
      readOnly: true,
      productionWrites: false,
      databaseHost: host,
      organization,
      location,
      policy: {
        id: policy.id,
        organizationId: policy.organizationId,
        locationId: policy.locationId,
        status: policy.verificationStatus,
        approvedAt: policy.approvedAt,
        approvedByNote: policy.approvedByNote,
        holidayExceptionCount: policy.exceptions.length,
        timezone: location.timezone,
        timezoneMatch: location.timezone === EXPECTED_TZ,
      },
      weekdayCoverage,
      scheduleMatchesExpected: weekdayCoverage.every((row) => row.match),
      mondayTuesdayClosed:
        weekdayCoverage[1]!.windows.length === 0 && weekdayCoverage[2]!.windows.length === 0,
      permissions: {
        administratorsHaveLocationsManage: adminKeys.has(PERMISSIONS.LOCATIONS_MANAGE),
        eventSalesHaveLocationsManage: salesKeys.has(PERMISSIONS.LOCATIONS_MANAGE),
      },
      bookingGuards: {
        draftStatusEvaluatesTo: draftGuard.status,
        draftExpected: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNVERIFIED,
        draftPass: draftGuard.status === OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNVERIFIED,
        verifiedWithinHoursEvaluatesTo: verifiedGuard.status,
        verifiedWithinHoursExpected: OPERATING_HOURS_EVALUATION_STATUSES.WITHIN_HOURS,
        verifiedWithinHoursPass:
          verifiedGuard.status === OPERATING_HOURS_EVALUATION_STATUSES.WITHIN_HOURS,
        verifiedMondayClosedEvaluatesTo: mondayOutside.status,
        verifiedMondayClosedExpected: OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS,
        verifiedMondayClosedPass:
          mondayOutside.status === OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS,
      },
      auditTrail: audit,
      verificationNotExecuted: true,
    };

    writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await database.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
