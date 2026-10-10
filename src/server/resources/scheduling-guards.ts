/**
 * Final-write scheduling guards: strict local time + operating hours.
 * Does not rewrite historical records. Does not invent tenant hours.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { resolveStrictOccupancyInstants } from "@/lib/inquiries/strict-local-time";
import { BookingError, ResourceError } from "@/server/errors";
import {
  aggregateSchedulingAvailability,
  evaluateOperatingHours,
  loadLocationOperatingHoursPolicy,
  logLegacyHoursCompatibility,
  type OperatingHoursEvaluation,
  type SchedulingAvailabilityAggregate,
} from "@/server/resources/operating-hours";
import {
  LOCAL_TIME_RESOLUTION_STATUSES,
  OPERATING_HOURS_EVALUATION_STATUSES,
  SCHEDULING_AVAILABILITY_STATUSES,
} from "@/types/operating-hours";

type GuardDb = PrismaClient | Prisma.TransactionClient;

export type OccupancyGuardSuccess = {
  ok: true;
  startsAt: Date;
  endsAt: Date;
  aggregate: SchedulingAvailabilityAggregate;
  operatingHours: OperatingHoursEvaluation;
};

export type OccupancyGuardFailure = {
  ok: false;
  aggregate: SchedulingAvailabilityAggregate;
  operatingHours: OperatingHoursEvaluation;
  reason: string;
  code: "INVALID_LOCAL_TIME" | "OUTSIDE_OPERATING_HOURS";
};

export type OccupancyGuardResult = OccupancyGuardSuccess | OccupancyGuardFailure;

export async function evaluateWritableOccupancy(input: {
  database: GuardDb;
  organizationId: string;
  locationId: string | null | undefined;
  timeZone: string;
  slotDate: string;
  startMinute: number;
  endMinute: number;
  resourceAvailable?: boolean | null;
  flow: string;
}): Promise<OccupancyGuardResult> {
  const localTime = resolveStrictOccupancyInstants({
    slotDate: input.slotDate,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    timeZone: input.timeZone,
  });
  const policy = await loadLocationOperatingHoursPolicy(input.database, {
    organizationId: input.organizationId,
    locationId: input.locationId,
  });
  const operatingHours =
    localTime.status === LOCAL_TIME_RESOLUTION_STATUSES.VALID
      ? evaluateOperatingHours({
          policy,
          slotDate: input.slotDate,
          startMinute: input.startMinute,
          endMinute: input.endMinute,
        })
      : {
          status: OPERATING_HOURS_EVALUATION_STATUSES.INVALID_LOCAL_TIME,
          verificationStatus: policy?.verificationStatus ?? null,
          reason: localTime.reason,
          matchedIntervals: [],
        };

  const aggregate = aggregateSchedulingAvailability({
    localTime,
    operatingHours,
    resourceAvailable: input.resourceAvailable ?? null,
  });

  if (localTime.status !== LOCAL_TIME_RESOLUTION_STATUSES.VALID) {
    return {
      ok: false,
      aggregate,
      operatingHours,
      reason: localTime.reason,
      code: "INVALID_LOCAL_TIME",
    };
  }

  if (operatingHours.status === OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS) {
    return {
      ok: false,
      aggregate,
      operatingHours,
      reason: operatingHours.reason,
      code: "OUTSIDE_OPERATING_HOURS",
    };
  }

  if (aggregate.legacyCompatibilityAllow) {
    logLegacyHoursCompatibility({
      organizationId: input.organizationId,
      locationId: input.locationId,
      flow: input.flow,
      evaluation: operatingHours,
    });
  }

  return {
    ok: true,
    startsAt: localTime.startsAt,
    endsAt: localTime.endsAt,
    aggregate,
    operatingHours,
  };
}

/** Hard-fail for confirmed bookings and HOLDs that create occupancy. */
export async function assertWritableOccupancyOrThrow(input: {
  database: GuardDb;
  organizationId: string;
  locationId: string | null | undefined;
  timeZone: string;
  slotDate: string;
  startMinute: number;
  endMinute: number;
  resourceAvailable?: boolean | null;
  flow: string;
  errorKind: "booking" | "resource";
}): Promise<OccupancyGuardSuccess> {
  const result = await evaluateWritableOccupancy(input);
  if (result.ok) {
    return result;
  }
  if (input.errorKind === "booking") {
    throw new BookingError(result.code, result.reason);
  }
  throw new ResourceError(result.code, result.reason);
}

/**
 * Pending requests may be created when hours are unresolved, but never when
 * local time is invalid or verified hours are closed.
 */
export async function assertPendingOccupancyOrThrow(input: {
  database: GuardDb;
  organizationId: string;
  locationId: string | null | undefined;
  timeZone: string;
  slotDate: string;
  startMinute: number;
  endMinute: number;
  flow: string;
}): Promise<OccupancyGuardSuccess> {
  const result = await evaluateWritableOccupancy({
    ...input,
    resourceAvailable: null,
  });
  if (result.ok) {
    return result;
  }
  if (result.code === "INVALID_LOCAL_TIME" || result.code === "OUTSIDE_OPERATING_HOURS") {
    throw new BookingError(result.code, result.reason);
  }
  throw new BookingError("NOT_READY_TO_FINALIZE", result.reason);
}

export function pendingAvailabilityLabel(
  aggregate: SchedulingAvailabilityAggregate,
): "UNCONFIRMED" | "REQUIRES_CONFIRMATION" | "UNRESOLVED" {
  if (aggregate.status === SCHEDULING_AVAILABILITY_STATUSES.UNRESOLVED) {
    return "UNRESOLVED";
  }
  if (aggregate.status === SCHEDULING_AVAILABILITY_STATUSES.REQUIRES_CONFIRMATION) {
    return "REQUIRES_CONFIRMATION";
  }
  return "UNCONFIRMED";
}
