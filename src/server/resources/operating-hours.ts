/**
 * Tenant-configurable operating-hours evaluation.
 * Missing / unverified hours are never treated as verified open.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  OPERATING_HOURS_EVALUATION_STATUSES,
  OPERATING_HOURS_EXCEPTION_KINDS,
  OPERATING_HOURS_VERIFICATION_STATUSES,
  SCHEDULING_AVAILABILITY_STATUSES,
  type MinuteInterval,
  type OperatingHoursEvaluationStatus,
  type SchedulingAvailabilityStatus,
} from "@/types/operating-hours";
import { LOCAL_TIME_RESOLUTION_STATUSES } from "@/types/operating-hours";
import type { StrictOccupancyResult } from "@/lib/inquiries/strict-local-time";
import { weekdayKeyFromIsoDate } from "@/server/catalog/pricing";

type HoursDb = PrismaClient | Prisma.TransactionClient;

const WEEKDAY_TO_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export type OperatingHoursPolicySnapshot = {
  verificationStatus: string;
  weeklyWindows: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>;
  exceptions: Array<{
    localDate: string;
    kind: string;
    startMinute: number | null;
    endMinute: number | null;
  }>;
};

export type OperatingHoursEvaluation = {
  status: OperatingHoursEvaluationStatus;
  verificationStatus: string | null;
  reason: string;
  matchedIntervals: MinuteInterval[];
};

export type SchedulingAvailabilityAggregate = {
  status: SchedulingAvailabilityStatus;
  operatingHours: OperatingHoursEvaluation;
  resourceAvailable: boolean | null;
  localTimeStatus: string;
  reason: string;
  legacyCompatibilityAllow: boolean;
};

function civilDateKey(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function intervalContains(interval: MinuteInterval, startMinute: number, endMinute: number): boolean {
  return startMinute >= interval.startMinute && endMinute <= interval.endMinute;
}

function dayOfWeekFromCivilDate(slotDate: string): number {
  const key = weekdayKeyFromIsoDate(slotDate);
  return WEEKDAY_TO_INDEX[key] ?? 0;
}

/** Include same-day windows plus spill from the previous day's overnight open interval. */
function weeklyIntervalsForCivilDate(
  weeklyWindows: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>,
  dateKey: string,
): MinuteInterval[] {
  const dow = dayOfWeekFromCivilDate(dateKey);
  const sameDay = weeklyWindows
    .filter((row) => row.dayOfWeek === dow && row.endMinute > row.startMinute)
    .map((row) => ({ startMinute: row.startMinute, endMinute: row.endMinute }));
  const previousDow = (dow + 6) % 7;
  const spillFromOvernight = weeklyWindows
    .filter((row) => row.dayOfWeek === previousDow && row.endMinute > 1440)
    .map((row) => ({
      startMinute: 0,
      endMinute: row.endMinute - 1440,
    }))
    .filter((row) => row.endMinute > row.startMinute);
  return [...sameDay, ...spillFromOvernight];
}

export function evaluateOperatingHours(input: {
  policy: OperatingHoursPolicySnapshot | null;
  slotDate: string;
  startMinute: number;
  endMinute: number;
}): OperatingHoursEvaluation {
  if (!input.policy) {
    return {
      status: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      verificationStatus: null,
      reason: "No operating-hours policy is configured for this location.",
      matchedIntervals: [],
    };
  }

  if (input.policy.verificationStatus === OPERATING_HOURS_VERIFICATION_STATUSES.UNCONFIGURED) {
    return {
      status: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
      verificationStatus: input.policy.verificationStatus,
      reason: "Operating hours exist but remain unconfigured.",
      matchedIntervals: [],
    };
  }

  if (input.policy.verificationStatus !== OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED) {
    return {
      status: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNVERIFIED,
      verificationStatus: input.policy.verificationStatus,
      reason: "Operating hours are present but not verified/approved.",
      matchedIntervals: [],
    };
  }

  const dateKey = input.slotDate.slice(0, 10);
  const dayExceptions = input.policy.exceptions.filter((row) => row.localDate === dateKey);
  if (dayExceptions.some((row) => row.kind === OPERATING_HOURS_EXCEPTION_KINDS.CLOSED)) {
    return {
      status: OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS,
      verificationStatus: input.policy.verificationStatus,
      reason: "Location is closed by a special closure on this date.",
      matchedIntervals: [],
    };
  }

  const customIntervals = dayExceptions
    .filter(
      (row) =>
        row.kind === OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM &&
        row.startMinute != null &&
        row.endMinute != null &&
        row.endMinute > row.startMinute,
    )
    .map((row) => ({ startMinute: row.startMinute!, endMinute: row.endMinute! }));

  const intervals =
    customIntervals.length > 0
      ? customIntervals
      : weeklyIntervalsForCivilDate(input.policy.weeklyWindows, dateKey);

  if (intervals.length === 0) {
    return {
      status: OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS,
      verificationStatus: input.policy.verificationStatus,
      reason: "Location has no open intervals on this weekday.",
      matchedIntervals: [],
    };
  }

  const contained = intervals.some((interval) =>
    intervalContains(interval, input.startMinute, input.endMinute),
  );
  if (!contained) {
    return {
      status: OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS,
      verificationStatus: input.policy.verificationStatus,
      reason: "Requested interval is outside configured operating hours.",
      matchedIntervals: intervals,
    };
  }

  return {
    status: OPERATING_HOURS_EVALUATION_STATUSES.WITHIN_HOURS,
    verificationStatus: input.policy.verificationStatus,
    reason: "Requested interval is within verified operating hours.",
    matchedIntervals: intervals,
  };
}

export function aggregateSchedulingAvailability(input: {
  localTime: StrictOccupancyResult;
  operatingHours: OperatingHoursEvaluation;
  resourceAvailable: boolean | null;
}): SchedulingAvailabilityAggregate {
  if (input.localTime.status !== LOCAL_TIME_RESOLUTION_STATUSES.VALID) {
    return {
      status: SCHEDULING_AVAILABILITY_STATUSES.UNAVAILABLE,
      operatingHours: {
        ...input.operatingHours,
        status:
          input.operatingHours.status === OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED ||
          input.operatingHours.status === OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNVERIFIED
            ? OPERATING_HOURS_EVALUATION_STATUSES.INVALID_LOCAL_TIME
            : OPERATING_HOURS_EVALUATION_STATUSES.INVALID_LOCAL_TIME,
      },
      resourceAvailable: input.resourceAvailable,
      localTimeStatus: input.localTime.status,
      reason: input.localTime.reason,
      legacyCompatibilityAllow: false,
    };
  }

  if (input.operatingHours.status === OPERATING_HOURS_EVALUATION_STATUSES.OUTSIDE_HOURS) {
    return {
      status: SCHEDULING_AVAILABILITY_STATUSES.UNAVAILABLE,
      operatingHours: input.operatingHours,
      resourceAvailable: input.resourceAvailable,
      localTimeStatus: input.localTime.status,
      reason: input.operatingHours.reason,
      legacyCompatibilityAllow: false,
    };
  }

  if (
    input.operatingHours.status === OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED ||
    input.operatingHours.status === OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNVERIFIED
  ) {
    if (input.resourceAvailable === false) {
      return {
        status: SCHEDULING_AVAILABILITY_STATUSES.UNAVAILABLE,
        operatingHours: input.operatingHours,
        resourceAvailable: false,
        localTimeStatus: input.localTime.status,
        reason: "Required resources are not available.",
        legacyCompatibilityAllow: false,
      };
    }
    return {
      status: SCHEDULING_AVAILABILITY_STATUSES.UNRESOLVED,
      operatingHours: input.operatingHours,
      resourceAvailable: input.resourceAvailable,
      localTimeStatus: input.localTime.status,
      reason: input.operatingHours.reason,
      legacyCompatibilityAllow: true,
    };
  }

  if (input.resourceAvailable === false) {
    return {
      status: SCHEDULING_AVAILABILITY_STATUSES.UNAVAILABLE,
      operatingHours: input.operatingHours,
      resourceAvailable: false,
      localTimeStatus: input.localTime.status,
      reason: "Required resources are not available.",
      legacyCompatibilityAllow: false,
    };
  }

  if (input.resourceAvailable == null) {
    return {
      status: SCHEDULING_AVAILABILITY_STATUSES.REQUIRES_CONFIRMATION,
      operatingHours: input.operatingHours,
      resourceAvailable: null,
      localTimeStatus: input.localTime.status,
      reason: "Operating hours are within range; resource availability was not evaluated.",
      legacyCompatibilityAllow: false,
    };
  }

  return {
    status: SCHEDULING_AVAILABILITY_STATUSES.AVAILABLE,
    operatingHours: input.operatingHours,
    resourceAvailable: true,
    localTimeStatus: input.localTime.status,
    reason: "Local time, operating hours, and resources are available.",
    legacyCompatibilityAllow: false,
  };
}

export async function loadLocationOperatingHoursPolicy(
  database: HoursDb,
  input: { organizationId: string; locationId: string | null | undefined },
): Promise<OperatingHoursPolicySnapshot | null> {
  if (!input.locationId) {
    return null;
  }
  const policy = await database.locationOperatingHoursPolicy.findFirst({
    where: {
      organizationId: input.organizationId,
      locationId: input.locationId,
    },
    include: {
      weeklyWindows: {
        select: { dayOfWeek: true, startMinute: true, endMinute: true },
      },
      exceptions: {
        select: {
          localDate: true,
          kind: true,
          startMinute: true,
          endMinute: true,
        },
      },
    },
  });
  if (!policy) {
    return null;
  }
  return {
    verificationStatus: policy.verificationStatus,
    weeklyWindows: policy.weeklyWindows,
    exceptions: policy.exceptions.map((row) => ({
      localDate: civilDateKey(row.localDate),
      kind: row.kind,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
    })),
  };
}

export function logLegacyHoursCompatibility(input: {
  organizationId: string;
  locationId: string | null | undefined;
  flow: string;
  evaluation: OperatingHoursEvaluation;
}): void {
  console.info(
    JSON.stringify({
      scope: "magiccrm.scheduling",
      event: "legacy_hours_compatibility_allow",
      organizationId: input.organizationId,
      locationId: input.locationId ?? null,
      flow: input.flow,
      operatingHoursStatus: input.evaluation.status,
      verificationStatus: input.evaluation.verificationStatus,
      note: "Occupancy allowed under explicit legacy compatibility because operating hours are not verified. This is not verified open.",
    }),
  );
}
