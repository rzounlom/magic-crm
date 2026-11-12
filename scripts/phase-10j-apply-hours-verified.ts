/**
 * Phase 10J — Owner-authorized Generations Main Location hours VERIFIED.
 *
 * Uses verifyOperatingHoursPolicy only. Does not alter weekly windows or holidays.
 * No email, quote delivery, card payments, Scenario Lab, or other-tenant writes.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import type { RequestContext } from "@/server/request-context";
import { evaluateOperatingHours } from "@/server/resources/operating-hours";
import { verifyOperatingHoursPolicy } from "@/server/services/operating-hours-admin-service";
import {
  loadApprovedPluginBaselineRegistry,
  organizationUsesApprovedPluginBaseline,
  tryBuildApprovedPluginBaselineConfig,
} from "@/server/event-planner/wp-parity/approved-plugin-baseline";
import { resolveWpCustomerQuoteDeliveryPolicy } from "@/server/event-planner/wp-parity/pricing-verification";
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
const POLICY_ID = "s07kml2m6xfiwg8ood8vzc6r";
const EXPECTED_TZ = "America/Indiana/Indianapolis";
const DEV_HOST = "ep-bold-art-avjy5nt4";
const SYNTHETIC_ORG = "huqlb9wiygqegwo8fy53f8dw";
const OUT = path.join("playwright", ".fixtures", "phase-10j-hours-verified-apply.json");

const APPROVAL_NOTE =
  "Administrator verification authorized by owner. Weekly hours follow the official Generations Adventureplex homepage and reservations-page schedule. The FAQ body publishes conflicting hours; discrepancy remains documented and unresolved. Monday and Tuesday are closed for public operations; private events require authorized booking-specific exceptions.";

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

function redactEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

function windowsFingerprint(
  windows: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>,
): string {
  return windows
    .slice()
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute)
    .map((w) => `${w.dayOfWeek}:${w.startMinute}-${w.endMinute}`)
    .join("|");
}

function scheduleMatchesExpected(
  windows: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>,
): { weekdayCoverage: ReturnType<typeof buildCoverage>; match: boolean; extraWindows: boolean } {
  const weekdayCoverage = buildCoverage(windows);
  const match = weekdayCoverage.every((row) => row.match);
  const expectedOpenCount = EXPECTED_WINDOWS.filter((w) => w != null).length;
  const extraWindows = windows.length !== expectedOpenCount;
  return { weekdayCoverage, match, extraWindows };
}

function buildCoverage(windows: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>) {
  return DAY_LABELS.map((day, dayOfWeek) => {
    const wins = windows.filter((w) => w.dayOfWeek === dayOfWeek);
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
}

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  const noteLen = APPROVAL_NOTE.trim().length;
  if (noteLen < 8 || noteLen > 500) {
    throw new Error(`Approval note length ${noteLen} outside 8–500.`);
  }

  const env = parseRuntimeEnv(process.env);
  const host = new URL(env.DATABASE_URL).hostname;
  if (!host.includes(DEV_HOST)) {
    throw new Error(`Refused: unexpected database host ${host}`);
  }

  const database = createPrismaClient(env.DATABASE_URL);
  let wrote = false;
  try {
    // --- Preflight (read-only) ---
    const organization = await database.organization.findFirst({
      where: { id: ORG_ID, slug: EXPECTED_SLUG },
      select: {
        id: true,
        slug: true,
        clerkOrganizationId: true,
        customerFacingName: true,
        depositPercent: true,
      },
    });
    if (!organization?.clerkOrganizationId) {
      throw new Error("PREFLIGHT FAIL: Generations organization dual-match or clerkOrganizationId missing.");
    }

    const location = await database.location.findFirst({
      where: { id: LOCATION_ID, organizationId: ORG_ID },
      select: { id: true, name: true, timezone: true },
    });
    if (!location) {
      throw new Error("PREFLIGHT FAIL: Main Location not found for Generations.");
    }
    if (location.timezone !== EXPECTED_TZ) {
      throw new Error(`PREFLIGHT FAIL: timezone ${location.timezone} != ${EXPECTED_TZ}`);
    }

    const policy = await database.locationOperatingHoursPolicy.findFirst({
      where: { id: POLICY_ID, organizationId: ORG_ID, locationId: LOCATION_ID },
      include: {
        weeklyWindows: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
        exceptions: true,
      },
    });
    if (!policy) {
      throw new Error(`PREFLIGHT FAIL: policy ${POLICY_ID} not found for org/location.`);
    }

    if (policy.verificationStatus === OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED) {
      const already = scheduleMatchesExpected(
        policy.weeklyWindows.map((w) => ({
          dayOfWeek: w.dayOfWeek,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
        })),
      );
      const payload = {
        ok: false,
        skipped: true,
        reason: "Policy already VERIFIED — did not re-verify.",
        databaseHost: host,
        policy: {
          id: policy.id,
          status: policy.verificationStatus,
          approvedAt: policy.approvedAt,
          approvedByNote: policy.approvedByNote,
          updatedAt: policy.updatedAt,
        },
        scheduleMatchesExpected: already.match && !already.extraWindows,
        weekdayCoverage: already.weekdayCoverage,
      };
      writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
      console.log(JSON.stringify(payload, null, 2));
      process.exitCode = 1;
      return;
    }

    const scheduleBefore = scheduleMatchesExpected(
      policy.weeklyWindows.map((w) => ({
        dayOfWeek: w.dayOfWeek,
        startMinute: w.startMinute,
        endMinute: w.endMinute,
      })),
    );
    const beforeFingerprint = windowsFingerprint(
      policy.weeklyWindows.map((w) => ({
        dayOfWeek: w.dayOfWeek,
        startMinute: w.startMinute,
        endMinute: w.endMinute,
      })),
    );

    const preflightFailures: string[] = [];
    if (policy.verificationStatus !== OPERATING_HOURS_VERIFICATION_STATUSES.DRAFT) {
      preflightFailures.push(`status is ${policy.verificationStatus}, expected DRAFT`);
    }
    if (policy.approvedAt != null) preflightFailures.push("approvedAt is not null");
    if (policy.approvedByNote != null) preflightFailures.push("approvedByNote is not null");
    if (policy.exceptions.length !== 0) {
      preflightFailures.push(`holiday exceptions = ${policy.exceptions.length}, expected 0`);
    }
    if (!scheduleBefore.match) preflightFailures.push("weekly schedule does not match authorized windows");
    if (scheduleBefore.extraWindows) preflightFailures.push("unexpected weekly window count");

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
      preflightFailures.push("no Administrator with locations.manage for write context");
    }

    // Confirm actor membership resolves locations.manage via requirePermission path later
    const adminHasManage = Boolean(adminMember?.userProfile.clerkUserId);

    const verifiedAuditBefore = await database.auditLog.count({
      where: {
        organizationId: ORG_ID,
        resourceId: POLICY_ID,
        action: "scheduling.hours_policy_verified",
      },
    });

    const otherLocPoliciesBefore = await database.locationOperatingHoursPolicy.findMany({
      where: { organizationId: ORG_ID, locationId: { not: LOCATION_ID } },
      select: { id: true, verificationStatus: true, updatedAt: true },
    });
    const syntheticPoliciesBefore = await database.locationOperatingHoursPolicy.findMany({
      where: { organizationId: SYNTHETIC_ORG },
      select: { id: true, verificationStatus: true, updatedAt: true },
    });
    const otherTenantVerifiedBefore = await database.locationOperatingHoursPolicy.count({
      where: {
        organizationId: { notIn: [ORG_ID, SYNTHETIC_ORG] },
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
      },
    });
    const staffExceptionsBefore = await database.operatingHoursStaffException.count({
      where: { organizationId: ORG_ID, locationId: LOCATION_ID },
    });

    const beforeState = {
      policyId: policy.id,
      organizationId: policy.organizationId,
      locationId: policy.locationId,
      status: policy.verificationStatus,
      approvedAt: policy.approvedAt,
      approvedByNote: policy.approvedByNote,
      updatedAt: policy.updatedAt.toISOString(),
      createdAt: policy.createdAt.toISOString(),
      holidayExceptionCount: policy.exceptions.length,
      weeklyWindowCount: policy.weeklyWindows.length,
      windowsFingerprint: beforeFingerprint,
      weekdayCoverage: scheduleBefore.weekdayCoverage,
      verifiedAuditCount: verifiedAuditBefore,
    };

    if (preflightFailures.length > 0 || !adminHasManage) {
      const payload = {
        ok: false,
        wrote: false,
        preflightFailures,
        beforeState,
        databaseHost: host,
      };
      writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
      console.log(JSON.stringify(payload, null, 2));
      throw new Error(`PREFLIGHT FAIL: ${preflightFailures.join("; ")}`);
    }

    // Immediate concurrency re-check before service write
    const fresh = await database.locationOperatingHoursPolicy.findFirst({
      where: { id: POLICY_ID, organizationId: ORG_ID, locationId: LOCATION_ID },
      include: {
        weeklyWindows: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
        exceptions: true,
      },
    });
    if (!fresh) throw new Error("PREFLIGHT FAIL: policy disappeared before write.");
    if (fresh.verificationStatus !== OPERATING_HOURS_VERIFICATION_STATUSES.DRAFT) {
      throw new Error(`PREFLIGHT FAIL: status changed to ${fresh.verificationStatus} before write.`);
    }
    if (fresh.updatedAt.toISOString() !== beforeState.updatedAt) {
      throw new Error(
        `PREFLIGHT FAIL: policy updatedAt changed (${beforeState.updatedAt} → ${fresh.updatedAt.toISOString()}).`,
      );
    }
    const freshFp = windowsFingerprint(
      fresh.weeklyWindows.map((w) => ({
        dayOfWeek: w.dayOfWeek,
        startMinute: w.startMinute,
        endMinute: w.endMinute,
      })),
    );
    if (freshFp !== beforeFingerprint || fresh.exceptions.length !== 0) {
      throw new Error("PREFLIGHT FAIL: windows/exceptions changed before write.");
    }

    const ctx: RequestContext = {
      userId: adminMember!.userProfile.id,
      clerkUserId: adminMember!.userProfile.clerkUserId,
      organizationId: ORG_ID,
      clerkOrganizationId: organization.clerkOrganizationId,
      locationId: LOCATION_ID,
    };

    // --- Authorized write via existing service ---
    const serviceResult = await verifyOperatingHoursPolicy(ctx, database, {
      locationId: LOCATION_ID,
      approvedByNote: APPROVAL_NOTE,
    });
    wrote = true;

    if (serviceResult.id !== POLICY_ID) {
      throw new Error(
        `WRITE ANOMALY: service updated policy ${serviceResult.id}, expected ${POLICY_ID}. Stopping further writes.`,
      );
    }

    // --- Independent read-back ---
    const after = await database.locationOperatingHoursPolicy.findFirst({
      where: { id: POLICY_ID, organizationId: ORG_ID, locationId: LOCATION_ID },
      include: {
        weeklyWindows: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
        exceptions: true,
      },
    });
    if (!after) throw new Error("READ-BACK FAIL: policy missing after verify.");

    const scheduleAfter = scheduleMatchesExpected(
      after.weeklyWindows.map((w) => ({
        dayOfWeek: w.dayOfWeek,
        startMinute: w.startMinute,
        endMinute: w.endMinute,
      })),
    );
    const afterFingerprint = windowsFingerprint(
      after.weeklyWindows.map((w) => ({
        dayOfWeek: w.dayOfWeek,
        startMinute: w.startMinute,
        endMinute: w.endMinute,
      })),
    );

    const verifyAudit = await database.auditLog.findFirst({
      where: {
        organizationId: ORG_ID,
        resourceId: POLICY_ID,
        action: "scheduling.hours_policy_verified",
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

    const otherLocPoliciesAfter = await database.locationOperatingHoursPolicy.findMany({
      where: { organizationId: ORG_ID, locationId: { not: LOCATION_ID } },
      select: { id: true, verificationStatus: true, updatedAt: true },
    });
    const syntheticPoliciesAfter = await database.locationOperatingHoursPolicy.findMany({
      where: { organizationId: SYNTHETIC_ORG },
      select: { id: true, verificationStatus: true, updatedAt: true },
    });
    const otherTenantVerifiedAfter = await database.locationOperatingHoursPolicy.count({
      where: {
        organizationId: { notIn: [ORG_ID, SYNTHETIC_ORG] },
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
      },
    });
    const staffExceptionsAfter = await database.operatingHoursStaffException.count({
      where: { organizationId: ORG_ID, locationId: LOCATION_ID },
    });

    const otherLocUnchanged =
      JSON.stringify(otherLocPoliciesBefore) === JSON.stringify(otherLocPoliciesAfter);
    const syntheticUnchanged =
      JSON.stringify(syntheticPoliciesBefore) === JSON.stringify(syntheticPoliciesAfter);
    const otherTenantUnchanged = otherTenantVerifiedBefore === otherTenantVerifiedAfter;

    const policySnapshot = {
      verificationStatus: after.verificationStatus,
      weeklyWindows: after.weeklyWindows.map((w) => ({
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

    const bookingProbes = [
      {
        label: "Wednesday 4 PM–6 PM",
        slotDate: "2026-11-18",
        startMinute: 16 * 60,
        endMinute: 18 * 60,
        expected: OPERATING_HOURS_EVALUATION_STATUSES.WITHIN_HOURS,
      },
      {
        label: "Monday 4 PM–6 PM",
        slotDate: "2026-11-16",
        startMinute: 16 * 60,
        endMinute: 18 * 60,
        expected: OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS,
      },
      {
        label: "Tuesday 4 PM–6 PM",
        slotDate: "2026-11-17",
        startMinute: 16 * 60,
        endMinute: 18 * 60,
        expected: OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS,
      },
      {
        label: "Friday 11 PM–11:30 PM",
        slotDate: "2026-11-20",
        startMinute: 23 * 60,
        endMinute: 23 * 60 + 30,
        expected: OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS,
      },
      {
        label: "Sunday 1 PM–3 PM",
        slotDate: "2026-11-15",
        startMinute: 13 * 60,
        endMinute: 15 * 60,
        expected: OPERATING_HOURS_EVALUATION_STATUSES.WITHIN_HOURS,
      },
    ].map((probe) => {
      const result = evaluateOperatingHours({
        policy: policySnapshot,
        slotDate: probe.slotDate,
        startMinute: probe.startMinute,
        endMinute: probe.endMinute,
      });
      return {
        ...probe,
        actual: result.status,
        pass: result.status === probe.expected,
      };
    });

    const registry = loadApprovedPluginBaselineRegistry();
    const usesBaseline = organizationUsesApprovedPluginBaseline(ORG_ID, registry);
    const built = tryBuildApprovedPluginBaselineConfig(ORG_ID);
    const delivery = resolveWpCustomerQuoteDeliveryPolicy({
      status: "ready",
      pricingSource: built?.pricingSource ?? "plugin_defaults",
    });

    const groups = await database.securityGroup.findMany({
      where: { organizationId: ORG_ID, systemKey: { in: ["administrators", "event_sales"] } },
      select: {
        systemKey: true,
        permissions: { select: { permissionDefinition: { select: { key: true } } } },
      },
    });
    const permissionsByGroup = Object.fromEntries(
      groups.map((g) => {
        const keys = new Set(g.permissions.map((p) => p.permissionDefinition.key));
        return [
          g.systemKey,
          {
            locationsManage: keys.has(PERMISSIONS.LOCATIONS_MANAGE),
            quotesApprove: keys.has(PERMISSIONS.CRM_QUOTES_APPROVE),
            quotesPriceOverride: keys.has(PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE),
          },
        ];
      }),
    );

    const readbackFailures: string[] = [];
    if (after.verificationStatus !== OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED) {
      readbackFailures.push(`status ${after.verificationStatus}`);
    }
    if (!after.approvedAt) readbackFailures.push("approvedAt null");
    if (after.approvedByNote !== APPROVAL_NOTE) {
      readbackFailures.push("approvedByNote mismatch");
    }
    if (after.organizationId !== ORG_ID) readbackFailures.push("organizationId changed");
    if (after.locationId !== LOCATION_ID) readbackFailures.push("locationId changed");
    if (location.timezone !== EXPECTED_TZ) readbackFailures.push("timezone changed");
    if (afterFingerprint !== beforeFingerprint) readbackFailures.push("weekly windows changed");
    if (after.exceptions.length !== 0) readbackFailures.push("holiday exceptions introduced");
    if (!verifyAudit) readbackFailures.push("missing hours_policy_verified audit");
    if (verifyAudit && verifyAudit.actorUserProfileId !== adminMember!.userProfile.id) {
      readbackFailures.push("audit actor mismatch");
    }
    if (!otherLocUnchanged) readbackFailures.push("other Generations location policy changed");
    if (!syntheticUnchanged) readbackFailures.push("synthetic tenant policy changed");
    if (!otherTenantUnchanged) readbackFailures.push("other tenant verified count changed");
    if (staffExceptionsBefore !== staffExceptionsAfter) {
      readbackFailures.push("staff exception count changed");
    }
    if (!bookingProbes.every((p) => p.pass)) readbackFailures.push("booking probe failure");

    const payload = {
      ok: readbackFailures.length === 0,
      wrote,
      verificationNotExecuted: false,
      databaseHost: host,
      ownerAuthorization:
        "Mark Generations Main Location operating-hours policy s07kml2m6xfiwg8ood8vzc6r VERIFIED, using an approval note acknowledging the homepage/reservations schedule and unresolved conflicting FAQ body. Do not change weekly windows, add holiday exceptions, enable emails, customer quote delivery, or card payments.",
      approvalNote: APPROVAL_NOTE,
      approvalNoteLength: noteLen,
      beforeState,
      serviceWrite: {
        policyId: serviceResult.id,
        status: serviceResult.verificationStatus,
        approvedAt: serviceResult.approvedAt,
      },
      afterState: {
        policyId: after.id,
        organizationId: after.organizationId,
        locationId: after.locationId,
        timezone: location.timezone,
        status: after.verificationStatus,
        approvedAt: after.approvedAt,
        approvedByNote: after.approvedByNote,
        approvedByNoteExactMatch: after.approvedByNote === APPROVAL_NOTE,
        updatedAt: after.updatedAt.toISOString(),
        holidayExceptionCount: after.exceptions.length,
        weeklyWindowCount: after.weeklyWindows.length,
        windowsFingerprint: afterFingerprint,
        windowsUnchanged: afterFingerprint === beforeFingerprint,
        weekdayCoverage: scheduleAfter.weekdayCoverage,
        scheduleMatchesExpected: scheduleAfter.match && !scheduleAfter.extraWindows,
        mondayTuesdayClosed:
          scheduleAfter.weekdayCoverage[1]!.windows.length === 0 &&
          scheduleAfter.weekdayCoverage[2]!.windows.length === 0,
      },
      auditEvent: verifyAudit,
      actor: {
        userProfileId: adminMember!.userProfile.id,
        emailRedacted: redactEmail(adminMember!.userProfile.email),
      },
      bookingHoursEvaluations: bookingProbes,
      bookingHoursAllPass: bookingProbes.every((p) => p.pass),
      privateEventSafeguards: {
        mondayTuesdayPublicClosed: true,
        holidayExceptionCount: after.exceptions.length,
        staffExceptionCountUnchanged: staffExceptionsBefore === staffExceptionsAfter,
        staffExceptionCount: staffExceptionsAfter,
        blanketExceptionGranted: false,
        note: "OUTSIDE_HOURS still requires OperatingHoursStaffException per booking.",
      },
      isolation: {
        otherGenerationsLocationPoliciesUnchanged: otherLocUnchanged,
        syntheticTenantPoliciesUnchanged: syntheticUnchanged,
        otherTenantVerifiedCountUnchanged: otherTenantUnchanged,
        otherGenerationsLocationPolicyCount: otherLocPoliciesAfter.length,
        syntheticPolicyCount: syntheticPoliciesAfter.length,
      },
      unchangedOperationalConfig: {
        customerFacingName: organization.customerFacingName,
        depositPercent: organization.depositPercent,
        pricingUsesApprovedPluginBaseline: usesBaseline,
        pricingSource: built?.pricingSource ?? null,
        finalLivePriceRevalidation: registry.finalLivePriceRevalidation,
        quoteDelivery: {
          canApprove: delivery.canApprove,
          canDeliver: delivery.canDeliver,
          code: delivery.code,
        },
        permissions: permissionsByGroup,
      },
      faqDiscrepancy:
        "FAQ body still conflicts with homepage/reservations schedule; approval note acknowledges unresolved discrepancy. Schedule unchanged.",
      readbackFailures,
      note: "Verification only. No weekly window, holiday, pricing, email, delivery, or payment changes.",
    };

    writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(JSON.stringify(payload, null, 2));
    if (!payload.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    if (wrote) {
      console.error(
        "Verification write may have occurred; independent review required before corrective action.",
      );
    }
    throw error;
  } finally {
    await database.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
