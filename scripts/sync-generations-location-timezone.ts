/**
 * Idempotent DEV correction: Generations Main Location timezone UTC → America/Indiana/Indianapolis.
 * Preserves all booking/reservation timestamps. Requires successful dry-run safety gates.
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { resolveSchedulingTimeZone } from "@/lib/inquiries/tenant-datetime";
import {
  assertDevDatabaseHost,
  assertNonProductionRuntime,
  defaultGenerationsLocationTimezoneTarget,
  evaluateLocationTimezoneCorrectionSafety,
} from "@/server/ops/location-timezone-correction";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  assertNonProductionRuntime(process.env);
  const confirm = arg("--confirm");
  if (confirm !== "CORRECT_LOCATION_TIMEZONE") {
    throw new Error("Pass --confirm CORRECT_LOCATION_TIMEZONE after a successful dry-run preflight.");
  }

  const target = defaultGenerationsLocationTimezoneTarget();
  const organizationId = (arg("--organization-id") ?? "").trim();
  const locationId = (arg("--location-id") ?? "").trim();
  if (!organizationId || !locationId) {
    throw new Error("Required: --organization-id and --location-id.");
  }
  if (organizationId !== target.organizationId || locationId !== target.locationId) {
    throw new Error(
      `Refused: identifiers must be organization ${target.organizationId} and location ${target.locationId}.`,
    );
  }

  const env = parseRuntimeEnv(process.env);
  const host = new URL(env.DATABASE_URL).hostname;
  assertDevDatabaseHost(host);

  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const org = await db.organization.findFirst({
      where: { id: organizationId, slug: target.organizationSlug },
      select: {
        id: true,
        slug: true,
        timezone: true,
        locations: {
          where: { id: locationId },
          select: { id: true, name: true, slug: true, timezone: true, active: true, updatedAt: true },
        },
      },
    });
    if (!org || org.locations.length !== 1) {
      throw new Error("Refused: Generations organization/location not found.");
    }
    const location = org.locations[0]!;
    const now = new Date();

    const futureBookings = await db.booking.count({
      where: {
        organizationId,
        locationId,
        status: { in: ["CONFIRMED", "PENDING_PAYMENT"] },
        OR: [{ startsAt: { gt: now } }, { startsAt: null, eventDate: { gte: now } }],
      },
    });
    const activeHolds = await db.resourceReservation.count({
      where: {
        organizationId,
        locationId,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
        releasedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    const futureHoldOccupancy = await db.resourceReservation.count({
      where: {
        organizationId,
        locationId,
        status: {
          in: [RESOURCE_RESERVATION_STATUSES.HOLD, RESOURCE_RESERVATION_STATUSES.BOOKED],
        },
        releasedAt: null,
        startsAt: { gt: now },
        OR: [
          { status: RESOURCE_RESERVATION_STATUSES.BOOKED },
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
    });

    const safety = evaluateLocationTimezoneCorrectionSafety({
      futureConfirmedOrHoldCount: futureBookings + futureHoldOccupancy,
      activeHoldCount: activeHolds,
      currentLocationTimezone: location.timezone,
      expectedCurrentTimezone: target.expectedCurrentTimezone,
      expectedCorrectedTimezone: target.expectedCorrectedTimezone,
    });

    if (!safety.ok) {
      throw new Error(safety.reason);
    }

    const beforeTimezone = location.timezone;
    const beforeResolved = resolveSchedulingTimeZone({
      locationTimeZone: beforeTimezone,
      organizationTimeZone: org.timezone,
    });

    if (!safety.alreadyCorrect) {
      await db.location.update({
        where: { id: locationId },
        data: { timezone: target.expectedCorrectedTimezone },
      });
    }

    const after = await db.location.findFirstOrThrow({
      where: { id: locationId, organizationId },
      select: { id: true, name: true, slug: true, timezone: true, active: true, updatedAt: true },
    });
    const afterResolved = resolveSchedulingTimeZone({
      locationTimeZone: after.timezone,
      organizationTimeZone: org.timezone,
    });

    const reservationSample = await db.resourceReservation.findMany({
      where: { organizationId, locationId },
      select: { id: true, startsAt: true, endsAt: true },
      take: 5,
      orderBy: { createdAt: "asc" },
    });

    console.log(
      JSON.stringify(
        {
          host,
          organizationId: org.id,
          organizationSlug: org.slug,
          locationId: after.id,
          locationSlug: after.slug,
          applied: !safety.alreadyCorrect,
          idempotentNoOp: safety.alreadyCorrect,
          before: {
            locationTimezone: beforeTimezone,
            resolvedSchedulingTimezone: beforeResolved,
          },
          after: {
            locationTimezone: after.timezone,
            resolvedSchedulingTimezone: afterResolved,
          },
          diff: {
            locationTimezone: {
              from: beforeTimezone,
              to: after.timezone,
            },
          },
          preserved: {
            reservationTimestampsRewritten: false,
            bookingTimestampsRewritten: false,
            taxSettingsTouched: false,
            reservationSampleStartsAt: reservationSample.map((row) => ({
              id: row.id,
              startsAt: row.startsAt?.toISOString() ?? null,
              endsAt: row.endsAt?.toISOString() ?? null,
            })),
          },
          safety,
          counts: {
            futureBookings,
            activeHolds,
            futureHoldOccupancy,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
