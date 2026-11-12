/**
 * Phase 10I — Apply owner-authorized Generations Main Location weekly hours as DRAFT only.
 *
 * Requires prior owner authorization. Does NOT mark VERIFIED. No holidays.
 * Refuses unexpected host / org / location / overwrite of existing windows.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import { validateWeeklyWindows, type WeeklyWindowInput } from "@/lib/operating-hours/admin-validation";
import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import type { RequestContext } from "@/server/request-context";
import { evaluateOperatingHours } from "@/server/resources/operating-hours";
import { saveWeeklyOperatingHoursDraft } from "@/server/services/operating-hours-admin-service";
import {
  OPERATING_HOURS_EVALUATION_STATUSES,
  OPERATING_HOURS_VERIFICATION_STATUSES,
} from "@/types/operating-hours";
import { PERMISSIONS } from "@/types/permissions";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const ORG_ID = "mdutc2nkvpafezukeem8942v";
const EXPECTED_SLUG = "generations-crm-test-1788129640704833684";
const LOCATION_ID = "rysftywo62ve9sao10dk71si";
const EXPECTED_TZ = "America/Indiana/Indianapolis";
const DEV_HOST = "ep-bold-art-avjy5nt4";
const SYNTHETIC_ORG = "huqlb9wiygqegwo8fy53f8dw";
const OUT = path.join("playwright", ".fixtures", "phase-10i-hours-draft-apply.json");

const WINDOWS: WeeklyWindowInput[] = [
  { dayOfWeek: 0, startMinute: 12 * 60, endMinute: 20 * 60 },
  { dayOfWeek: 3, startMinute: 15 * 60, endMinute: 21 * 60 },
  { dayOfWeek: 4, startMinute: 15 * 60, endMinute: 21 * 60 },
  { dayOfWeek: 5, startMinute: 12 * 60, endMinute: 22 * 60 },
  { dayOfWeek: 6, startMinute: 11 * 60, endMinute: 22 * 60 },
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
  if (!host.includes(DEV_HOST)) {
    throw new Error(`Refused: unexpected database host ${host}`);
  }

  const validationError = validateWeeklyWindows(WINDOWS);
  if (validationError) {
    throw new Error(`Validation failed: ${validationError}`);
  }

  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const organization = await database.organization.findFirst({
      where: { id: ORG_ID, slug: EXPECTED_SLUG },
      select: { id: true, slug: true, clerkOrganizationId: true, customerFacingName: true },
    });
    if (!organization?.clerkOrganizationId) {
      throw new Error("Generations organization dual-match or clerkOrganizationId missing.");
    }

    const location = await database.location.findFirst({
      where: { id: LOCATION_ID, organizationId: ORG_ID },
      select: { id: true, name: true, timezone: true },
    });
    if (!location) {
      throw new Error("Main Location not found for Generations.");
    }
    if (location.timezone !== EXPECTED_TZ) {
      throw new Error(`Timezone mismatch: ${location.timezone} != ${EXPECTED_TZ}`);
    }

    const existing = await database.locationOperatingHoursPolicy.findFirst({
      where: { organizationId: ORG_ID, locationId: LOCATION_ID },
      include: {
        weeklyWindows: true,
        exceptions: true,
      },
    });
    if (existing && existing.weeklyWindows.length > 0) {
      throw new Error(
        `Refused overwrite: existing policy ${existing.id} already has ${existing.weeklyWindows.length} weekly windows (status ${existing.verificationStatus}).`,
      );
    }
    if (existing && existing.verificationStatus === OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED) {
      throw new Error(`Refused: existing policy is VERIFIED (${existing.id}).`);
    }
    if (existing && existing.exceptions.length > 0) {
      throw new Error(`Refused overwrite: existing policy has ${existing.exceptions.length} exceptions.`);
    }

    const adminMember = await database.securityGroupMember.findFirst({
      where: {
        organizationId: ORG_ID,
        securityGroup: {
          organizationId: ORG_ID,
          systemKey: "administrators",
          permissions: {
            some: { permissionDefinition: { key: PERMISSIONS.LOCATIONS_MANAGE, active: true } },
          },
        },
      },
      select: {
        userProfile: { select: { id: true, clerkUserId: true, email: true } },
      },
    });
    if (!adminMember?.userProfile.clerkUserId) {
      throw new Error("No Generations Administrator with locations.manage found for write context.");
    }

    const ctx: RequestContext = {
      userId: adminMember.userProfile.id,
      clerkUserId: adminMember.userProfile.clerkUserId,
      organizationId: ORG_ID,
      clerkOrganizationId: organization.clerkOrganizationId,
      locationId: LOCATION_ID,
    };

    const syntheticWindowsBefore = await database.locationOperatingHoursWindow.count({
      where: { organizationId: SYNTHETIC_ORG },
    });
    const otherLocPoliciesBefore = await database.locationOperatingHoursPolicy.count({
      where: { organizationId: ORG_ID, locationId: { not: LOCATION_ID } },
    });

    const result = await saveWeeklyOperatingHoursDraft(ctx, database, {
      locationId: LOCATION_ID,
      windows: WINDOWS,
    });

    // Independent read-back (new queries)
    const policy = await database.locationOperatingHoursPolicy.findFirst({
      where: { id: result.policyId, organizationId: ORG_ID, locationId: LOCATION_ID },
      include: {
        weeklyWindows: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
        exceptions: true,
      },
    });
    if (!policy) {
      throw new Error("Post-write read-back: policy missing.");
    }

    const audit = await database.auditLog.findFirst({
      where: {
        organizationId: ORG_ID,
        action: "scheduling.hours_policy_draft_saved",
        resourceId: policy.id,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        actorUserProfileId: true,
        createdAt: true,
        metadata: true,
      },
    });

    const weekdayCoverage = DAY_LABELS.map((day, dayOfWeek) => {
      const wins = policy.weeklyWindows.filter((w) => w.dayOfWeek === dayOfWeek);
      return {
        day,
        dayOfWeek,
        windowCount: wins.length,
        windows: wins.map((w) => ({
          startMinute: w.startMinute,
          endMinute: w.endMinute,
          start: minuteLabel(w.startMinute),
          end: minuteLabel(w.endMinute),
        })),
      };
    });

    const monTueClosed =
      weekdayCoverage[1]!.windowCount === 0 && weekdayCoverage[2]!.windowCount === 0;

    const guardProbe = evaluateOperatingHours({
      policy: {
        verificationStatus: policy.verificationStatus,
        weeklyWindows: policy.weeklyWindows.map((w) => ({
          dayOfWeek: w.dayOfWeek,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
        })),
        exceptions: [],
      },
      slotDate: "2026-11-18", // Wednesday within recommended open hours if verified
      startMinute: 16 * 60,
      endMinute: 18 * 60,
    });

    const syntheticWindowsAfter = await database.locationOperatingHoursWindow.count({
      where: { organizationId: SYNTHETIC_ORG },
    });
    const otherLocPoliciesAfter = await database.locationOperatingHoursPolicy.count({
      where: { organizationId: ORG_ID, locationId: { not: LOCATION_ID } },
    });

    const payload = {
      ok:
        policy.verificationStatus === OPERATING_HOURS_VERIFICATION_STATUSES.DRAFT &&
        policy.approvedAt == null &&
        policy.approvedByNote == null &&
        policy.exceptions.length === 0 &&
        monTueClosed &&
        policy.weeklyWindows.length === 5 &&
        guardProbe.status === OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNVERIFIED &&
        syntheticWindowsAfter === syntheticWindowsBefore &&
        otherLocPoliciesAfter === otherLocPoliciesBefore,
      databaseHost: host,
      organization: {
        id: organization.id,
        slug: organization.slug,
        customerFacingName: organization.customerFacingName,
      },
      location: {
        id: location.id,
        name: location.name,
        timezone: location.timezone,
      },
      policy: {
        id: policy.id,
        organizationId: policy.organizationId,
        locationId: policy.locationId,
        status: policy.verificationStatus,
        approvedAt: policy.approvedAt,
        approvedByNote: policy.approvedByNote,
        holidayExceptionCount: policy.exceptions.length,
        weeklyWindows: policy.weeklyWindows.map((w) => ({
          dayOfWeek: w.dayOfWeek,
          day: DAY_LABELS[w.dayOfWeek],
          startMinute: w.startMinute,
          endMinute: w.endMinute,
          start: minuteLabel(w.startMinute),
          end: minuteLabel(w.endMinute),
        })),
      },
      weekdayCoverage,
      mondayTuesdayHaveNoPublicWindows: monTueClosed,
      bookingGuardTreatsDraftAsUnverified: {
        evaluatedStatus: guardProbe.status,
        expected: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNVERIFIED,
        pass: guardProbe.status === OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNVERIFIED,
      },
      auditEvent: audit,
      actorEmailRedacted: adminMember.userProfile.email
        ? `${adminMember.userProfile.email.slice(0, 2)}***@${adminMember.userProfile.email.split("@")[1]}`
        : null,
      isolation: {
        otherLocationPolicyCount: otherLocPoliciesAfter,
        otherLocationPolicyDelta: otherLocPoliciesAfter - otherLocPoliciesBefore,
        syntheticWindowCount: syntheticWindowsAfter,
        syntheticWindowDelta: syntheticWindowsAfter - syntheticWindowsBefore,
      },
      faqDiscrepancyPreserved:
        "FAQ body hours still conflict with footer/reservations baseline; DRAFT uses footer/reservations schedule only.",
      note: "DRAFT only. Not VERIFIED. No holidays. No pricing/email/payment changes.",
    };

    writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(JSON.stringify(payload, null, 2));
    if (!payload.ok) {
      process.exitCode = 1;
    }
  } finally {
    await database.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
