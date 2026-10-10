/**
 * Final-write scheduling guards: strict local time + operating hours.
 * Confirmed occupancy / HOLDs fail closed when hours are unresolved or closed
 * unless a matching one-time staff exception is provided and consumed.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { resolveStrictOccupancyInstants } from "@/lib/inquiries/strict-local-time";
import { BookingError, ResourceError } from "@/server/errors";
import {
  assertHoursExceptionConsumable,
  consumeHoursException,
  type HoursExceptionFingerprint,
} from "@/server/resources/hours-exception";
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
  OPERATING_HOURS_EXCEPTION_PURPOSES,
  SCHEDULING_AVAILABILITY_STATUSES,
  type OperatingHoursExceptionPurpose,
} from "@/types/operating-hours";

type GuardDb = PrismaClient | Prisma.TransactionClient;

export type OccupancyGuardSuccess = {
  ok: true;
  startsAt: Date;
  endsAt: Date;
  aggregate: SchedulingAvailabilityAggregate;
  operatingHours: OperatingHoursEvaluation;
  /** Present when a matching exception was validated (and consumed only if requested). */
  hoursExceptionId?: string;
  /**
   * When set, the caller must call {@link consumeValidatedHoursException} inside the
   * occupancy write transaction before committing confirmed/HOLD writes.
   */
  pendingHoursException?: {
    exceptionId: string;
    authorizedByUserProfileId: string;
    fingerprint: HoursExceptionFingerprint;
    expectedStatus: string;
  };
};

export type OccupancyGuardFailure = {
  ok: false;
  aggregate: SchedulingAvailabilityAggregate;
  operatingHours: OperatingHoursEvaluation;
  reason: string;
  code:
    | "INVALID_LOCAL_TIME"
    | "OUTSIDE_OPERATING_HOURS"
    | "OPERATING_HOURS_UNRESOLVED"
    | "HOURS_EXCEPTION_REQUIRED"
    | "HOURS_EXCEPTION_INVALID";
};

export type OccupancyGuardResult = OccupancyGuardSuccess | OccupancyGuardFailure;

function unresolvedOrClosed(status: string): boolean {
  return (
    status === OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED ||
    status === OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNVERIFIED ||
    status === OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS
  );
}

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
  /**
   * When true (pending requests), unresolved hours are allowed without an exception.
   * Confirmed occupancy and HOLDs must keep this false.
   */
  allowUnresolvedHours?: boolean;
  hoursExceptionId?: string | null;
  exceptionPurpose?: OperatingHoursExceptionPurpose;
  inquiryId?: string | null;
  bookingId?: string | null;
  /**
   * When false (default), matching exceptions are validated but not consumed.
   * Consumption must happen inside the occupancy write transaction via
   * {@link consumeValidatedHoursException}.
   */
  consumeException?: boolean;
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

  if (operatingHours.status === OPERATING_HOURS_EVALUATION_STATUSES.WITHIN_HOURS) {
    return {
      ok: true,
      startsAt: localTime.startsAt,
      endsAt: localTime.endsAt,
      aggregate,
      operatingHours,
    };
  }

  if (input.allowUnresolvedHours && unresolvedOrClosed(operatingHours.status)) {
    if (operatingHours.status === OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS) {
      return {
        ok: false,
        aggregate,
        operatingHours,
        reason: operatingHours.reason,
        code: "OUTSIDE_OPERATING_HOURS",
      };
    }
    logLegacyHoursCompatibility({
      organizationId: input.organizationId,
      locationId: input.locationId,
      flow: input.flow,
      evaluation: operatingHours,
    });
    return {
      ok: true,
      startsAt: localTime.startsAt,
      endsAt: localTime.endsAt,
      aggregate,
      operatingHours,
    };
  }

  if (!unresolvedOrClosed(operatingHours.status)) {
    return {
      ok: false,
      aggregate,
      operatingHours,
      reason: operatingHours.reason,
      code: "OUTSIDE_OPERATING_HOURS",
    };
  }

  if (!input.locationId) {
    return {
      ok: false,
      aggregate,
      operatingHours,
      reason: "A location is required before authorizing an operating-hours exception.",
      code: "HOURS_EXCEPTION_REQUIRED",
    };
  }

  if (!input.hoursExceptionId) {
    const code =
      operatingHours.status === OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS
        ? "OUTSIDE_OPERATING_HOURS"
        : "OPERATING_HOURS_UNRESOLVED";
    return {
      ok: false,
      aggregate,
      operatingHours,
      reason:
        operatingHours.status === OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS
          ? operatingHours.reason
          : "Operating hours are not verified. Confirmed occupancy requires an authorized staff exception.",
      code,
    };
  }

  const purpose =
    input.exceptionPurpose ?? OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING;
  const fingerprint: HoursExceptionFingerprint = {
    organizationId: input.organizationId,
    locationId: input.locationId,
    slotDate: input.slotDate,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    purpose,
    inquiryId: input.inquiryId,
    bookingId: input.bookingId,
  };
  const asserted = await assertHoursExceptionConsumable(input.database, {
    exceptionId: input.hoursExceptionId,
    fingerprint,
    expectedStatus: operatingHours.status,
  });
  if (!asserted.ok) {
    return {
      ok: false,
      aggregate,
      operatingHours,
      reason: asserted.reason,
      code: "HOURS_EXCEPTION_INVALID",
    };
  }

  if (input.consumeException === true) {
    const consumed = await consumeHoursException(input.database, {
      exceptionId: asserted.exceptionId,
      fingerprint,
      expectedStatus: operatingHours.status,
      authorizedByUserProfileId: asserted.authorizedByUserProfileId,
    });
    if (!consumed.ok) {
      return {
        ok: false,
        aggregate,
        operatingHours,
        reason: consumed.reason,
        code: "HOURS_EXCEPTION_INVALID",
      };
    }
    return {
      ok: true,
      startsAt: localTime.startsAt,
      endsAt: localTime.endsAt,
      aggregate,
      operatingHours,
      hoursExceptionId: consumed.exceptionId,
    };
  }

  return {
    ok: true,
    startsAt: localTime.startsAt,
    endsAt: localTime.endsAt,
    aggregate,
    operatingHours,
    hoursExceptionId: asserted.exceptionId,
    pendingHoursException: {
      exceptionId: asserted.exceptionId,
      authorizedByUserProfileId: asserted.authorizedByUserProfileId,
      fingerprint,
      expectedStatus: operatingHours.status,
    },
  };
}

/** Consume a previously validated exception inside the occupancy write transaction. */
export async function consumeValidatedHoursException(
  database: GuardDb,
  pending: NonNullable<OccupancyGuardSuccess["pendingHoursException"]>,
  errorKind: "booking" | "resource",
): Promise<void> {
  const consumed = await consumeHoursException(database, {
    exceptionId: pending.exceptionId,
    fingerprint: pending.fingerprint,
    expectedStatus: pending.expectedStatus,
    authorizedByUserProfileId: pending.authorizedByUserProfileId,
  });
  if (!consumed.ok) {
    if (errorKind === "booking") {
      throw new BookingError("HOURS_EXCEPTION_INVALID", consumed.reason);
    }
    throw new ResourceError("HOURS_EXCEPTION_INVALID", consumed.reason);
  }
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
  hoursExceptionId?: string | null;
  exceptionPurpose?: OperatingHoursExceptionPurpose;
  inquiryId?: string | null;
  bookingId?: string | null;
  /** Default false — consume inside the occupancy write transaction. */
  consumeException?: boolean;
}): Promise<OccupancyGuardSuccess> {
  const result = await evaluateWritableOccupancy({
    ...input,
    allowUnresolvedHours: false,
  });
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
    allowUnresolvedHours: true,
  });
  if (result.ok) {
    return result;
  }
  if (
    result.code === "INVALID_LOCAL_TIME" ||
    result.code === "OUTSIDE_OPERATING_HOURS" ||
    result.code === "OPERATING_HOURS_UNRESOLVED" ||
    result.code === "HOURS_EXCEPTION_REQUIRED" ||
    result.code === "HOURS_EXCEPTION_INVALID"
  ) {
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
