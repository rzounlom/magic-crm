/**
 * One-time, event-scoped staff operating-hours exceptions.
 * Bound to exact occupancy fingerprint. Cannot override invalid local time or conflicts.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import { BookingError } from "@/server/errors";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { recordAuditEvent } from "@/server/services/audit";
import {
  OPERATING_HOURS_EVALUATION_STATUSES,
  OPERATING_HOURS_EXCEPTION_PURPOSES,
  OPERATING_HOURS_OVERRIDABLE_STATUSES,
  type OperatingHoursEvaluationStatus,
  type OperatingHoursExceptionPurpose,
} from "@/types/operating-hours";
import { PERMISSIONS } from "@/types/permissions";

type ExceptionDb = PrismaClient | Prisma.TransactionClient;

export const DEFAULT_HOURS_EXCEPTION_TTL_MS = 2 * 60 * 60 * 1000;

const OVERRIDABLE = new Set<string>(OPERATING_HOURS_OVERRIDABLE_STATUSES);

export type HoursExceptionFingerprint = {
  organizationId: string;
  locationId: string;
  slotDate: string;
  startMinute: number;
  endMinute: number;
  purpose: OperatingHoursExceptionPurpose;
  inquiryId?: string | null;
  bookingId?: string | null;
};

export function isOverridableOperatingHoursStatus(
  status: string,
): status is (typeof OPERATING_HOURS_OVERRIDABLE_STATUSES)[number] {
  return OVERRIDABLE.has(status);
}

export async function authorizeOperatingHoursException(
  ctx: RequestContext,
  database: ExceptionDb,
  input: HoursExceptionFingerprint & {
    overriddenStatus: OperatingHoursEvaluationStatus;
    reason: string;
    ttlMs?: number;
  },
) {
  await requirePermission(ctx, PERMISSIONS.EVENTS_CONFIRM, database);

  if (!isOverridableOperatingHoursStatus(input.overriddenStatus)) {
    throw new BookingError(
      "HOURS_EXCEPTION_INVALID",
      "Only unresolved or closed operating-hours statuses may be overridden.",
    );
  }
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 500) {
    throw new BookingError(
      "HOURS_EXCEPTION_INVALID",
      "Provide a reason between 8 and 500 characters for the operating-hours exception.",
    );
  }
  if (
    input.purpose !== OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING &&
    input.purpose !== OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD
  ) {
    throw new BookingError("HOURS_EXCEPTION_INVALID", "Unknown operating-hours exception purpose.");
  }

  const location = await database.location.findFirst({
    where: { id: input.locationId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!location) {
    throw new BookingError("HOURS_EXCEPTION_INVALID", "Location was not found in this organization.");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlMs && input.ttlMs > 0 ? input.ttlMs : DEFAULT_HOURS_EXCEPTION_TTL_MS));
  const row = await database.operatingHoursStaffException.create({
    data: {
      organizationId: ctx.organizationId,
      locationId: input.locationId,
      purpose: input.purpose,
      slotDate: new Date(`${input.slotDate}T00:00:00.000Z`),
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      overriddenStatus: input.overriddenStatus,
      reason,
      authorizedByUserProfileId: ctx.userId,
      authorizedAt: now,
      expiresAt,
      inquiryId: input.inquiryId ?? null,
      bookingId: input.bookingId ?? null,
    },
  });

  await recordAuditEvent(database as PrismaClient, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "scheduling.hours_exception_authorized",
    resourceType: "operating_hours_staff_exception",
    resourceId: row.id,
    metadata: {
      locationId: input.locationId,
      purpose: input.purpose,
      slotDate: input.slotDate,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      overriddenStatus: input.overriddenStatus,
      inquiryId: input.inquiryId ?? null,
      bookingId: input.bookingId ?? null,
      expiresAt: expiresAt.toISOString(),
    },
  });

  return row;
}

export async function revokeOperatingHoursException(
  ctx: RequestContext,
  database: ExceptionDb,
  exceptionId: string,
) {
  await requirePermission(ctx, PERMISSIONS.EVENTS_CONFIRM, database);
  const existing = await database.operatingHoursStaffException.findFirst({
    where: { id: exceptionId, organizationId: ctx.organizationId },
  });
  if (!existing) {
    throw new BookingError("HOURS_EXCEPTION_INVALID", "Operating-hours exception was not found.");
  }
  if (existing.revokedAt || existing.consumedAt) {
    return existing;
  }
  const now = new Date();
  const updated = await database.operatingHoursStaffException.update({
    where: { id: existing.id },
    data: {
      revokedAt: now,
      revokedByUserProfileId: ctx.userId,
    },
  });
  await recordAuditEvent(database as PrismaClient, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "scheduling.hours_exception_revoked",
    resourceType: "operating_hours_staff_exception",
    resourceId: updated.id,
    metadata: {
      locationId: updated.locationId,
      purpose: updated.purpose,
    },
  });
  return updated;
}

export type ConsumableHoursException = {
  id: string;
  organizationId: string;
  locationId: string;
  purpose: string;
  slotDate: Date;
  startMinute: number;
  endMinute: number;
  overriddenStatus: string;
  inquiryId: string | null;
  bookingId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  consumedAt: Date | null;
};

export function assertHoursExceptionMatches(
  exception: ConsumableHoursException,
  fingerprint: HoursExceptionFingerprint,
  expectedStatus: string,
  now = new Date(),
): { ok: true } | { ok: false; reason: string } {
  if (exception.organizationId !== fingerprint.organizationId) {
    return { ok: false, reason: "Operating-hours exception belongs to another organization." };
  }
  if (exception.locationId !== fingerprint.locationId) {
    return { ok: false, reason: "Operating-hours exception does not match this location." };
  }
  if (exception.purpose !== fingerprint.purpose) {
    return { ok: false, reason: "Operating-hours exception purpose does not match this action." };
  }
  const slotDate = exception.slotDate.toISOString().slice(0, 10);
  if (
    slotDate !== fingerprint.slotDate ||
    exception.startMinute !== fingerprint.startMinute ||
    exception.endMinute !== fingerprint.endMinute
  ) {
    return { ok: false, reason: "Operating-hours exception does not match the event date/time." };
  }
  if (fingerprint.inquiryId && exception.inquiryId && exception.inquiryId !== fingerprint.inquiryId) {
    return { ok: false, reason: "Operating-hours exception is bound to a different inquiry." };
  }
  if (fingerprint.bookingId && exception.bookingId && exception.bookingId !== fingerprint.bookingId) {
    return { ok: false, reason: "Operating-hours exception is bound to a different booking." };
  }
  if (exception.revokedAt) {
    return { ok: false, reason: "Operating-hours exception has been revoked." };
  }
  if (exception.consumedAt) {
    return { ok: false, reason: "Operating-hours exception has already been used." };
  }
  if (exception.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "Operating-hours exception has expired." };
  }
  if (exception.overriddenStatus !== expectedStatus) {
    return {
      ok: false,
      reason: `Operating-hours exception overrides ${exception.overriddenStatus}, but current status is ${expectedStatus}.`,
    };
  }
  if (expectedStatus === OPERATING_HOURS_EVALUATION_STATUSES.INVALID_LOCAL_TIME) {
    return { ok: false, reason: "Invalid local times cannot be overridden." };
  }
  return { ok: true };
}

export async function loadAndConsumeHoursException(
  database: ExceptionDb,
  input: {
    exceptionId: string;
    fingerprint: HoursExceptionFingerprint;
    expectedStatus: string;
    now?: Date;
  },
): Promise<{ ok: true; exceptionId: string } | { ok: false; reason: string }> {
  const now = input.now ?? new Date();
  const exception = await database.operatingHoursStaffException.findFirst({
    where: {
      id: input.exceptionId,
      organizationId: input.fingerprint.organizationId,
    },
  });
  if (!exception) {
    return { ok: false, reason: "Operating-hours exception was not found." };
  }
  const match = assertHoursExceptionMatches(exception, input.fingerprint, input.expectedStatus, now);
  if (!match.ok) {
    return match;
  }
  const consumed = await database.operatingHoursStaffException.updateMany({
    where: {
      id: exception.id,
      organizationId: input.fingerprint.organizationId,
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) {
    return { ok: false, reason: "Operating-hours exception could not be consumed." };
  }
  await recordAuditEvent(database as PrismaClient, {
    organizationId: input.fingerprint.organizationId,
    actorUserProfileId: exception.authorizedByUserProfileId,
    action: "scheduling.hours_exception_consumed",
    resourceType: "operating_hours_staff_exception",
    resourceId: exception.id,
    metadata: {
      locationId: exception.locationId,
      purpose: exception.purpose,
      overriddenStatus: exception.overriddenStatus,
      slotDate: input.fingerprint.slotDate,
      startMinute: input.fingerprint.startMinute,
      endMinute: input.fingerprint.endMinute,
    },
  });
  return { ok: true, exceptionId: exception.id };
}
