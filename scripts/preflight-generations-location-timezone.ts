/**
 * Read-only preflight for Generations Main Location timezone correction (R2D.1).
 * Does not write. Reports before/after config diff and safety classification.
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { occupancyInstants, resolveSchedulingTimeZone } from "@/lib/inquiries/tenant-datetime";
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
  const target = defaultGenerationsLocationTimezoneTarget();
  const organizationId = (arg("--organization-id") ?? target.organizationId).trim();
  const locationId = (arg("--location-id") ?? target.locationId).trim();
  if (organizationId !== target.organizationId || locationId !== target.locationId) {
    throw new Error(
      `Preflight refused: identifiers must be organization ${target.organizationId} and location ${target.locationId}.`,
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
          select: { id: true, name: true, slug: true, timezone: true, active: true },
        },
      },
    });
    if (!org || org.locations.length !== 1) {
      throw new Error("Preflight refused: Generations organization/location not found.");
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

    const beforeZone = resolveSchedulingTimeZone({
      locationTimeZone: location.timezone,
      organizationTimeZone: org.timezone,
    });
    const afterZone = resolveSchedulingTimeZone({
      locationTimeZone: target.expectedCorrectedTimezone,
      organizationTimeZone: org.timezone,
    });
    const sample = occupancyInstants({
      slotDate: "2026-10-15",
      startMinute: 18 * 60,
      endMinute: 20 * 60,
      timeZone: beforeZone,
    });
    const sampleCorrect = occupancyInstants({
      slotDate: "2026-10-15",
      startMinute: 18 * 60,
      endMinute: 20 * 60,
      timeZone: afterZone,
    });

    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          host,
          organizationId: org.id,
          organizationSlug: org.slug,
          organizationTimezone: org.timezone,
          locationId: location.id,
          locationName: location.name,
          locationSlug: location.slug,
          before: {
            locationTimezone: location.timezone,
            resolvedSchedulingTimezone: beforeZone,
            sampleStartsAt: sample.startsAt.toISOString(),
          },
          after: {
            locationTimezone: target.expectedCorrectedTimezone,
            resolvedSchedulingTimezone: afterZone,
            sampleStartsAt: sampleCorrect.startsAt.toISOString(),
          },
          diff: {
            locationTimezone: {
              from: location.timezone,
              to: target.expectedCorrectedTimezone,
            },
            sampleStartsAtDiffMinutes: Math.round(
              (sample.startsAt.getTime() - sampleCorrect.startsAt.getTime()) / 60000,
            ),
            reservationTimestampsRewritten: false,
            bookingTimestampsRewritten: false,
            taxSettingsTouched: false,
          },
          counts: {
            futureBookings,
            activeHolds,
            futureHoldOccupancy,
          },
          safety,
        },
        null,
        2,
      ),
    );

    if (!safety.ok) {
      process.exitCode = 2;
    }
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
