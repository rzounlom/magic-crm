import type { PrismaClient } from "@/generated/prisma/client";

import { authorizeOperatingHoursException } from "@/server/resources/hours-exception";
import type { RequestContext } from "@/server/request-context";
import { resolveConfirmOccupancyContext } from "@/server/services/confirmation-readiness-service";
import { resolveHoldOccupancyContext } from "@/server/services/hold-readiness-service";
import {
  OPERATING_HOURS_EVALUATION_STATUSES,
  OPERATING_HOURS_EXCEPTION_PURPOSES,
} from "@/types/operating-hours";

/**
 * Authorize a CONFIRM_BOOKING exception using the server-resolved occupancy fingerprint.
 * Prefer this over hand-built date/time windows — itinerary duration must match exactly.
 */
export async function authorizeConfirmHoursForInquiry(input: {
  ctx: RequestContext;
  database: PrismaClient;
  inquiryId: string;
  reason?: string;
}) {
  const occupancy = await resolveConfirmOccupancyContext(input.ctx, input.database, input.inquiryId);
  return authorizeOperatingHoursException(input.ctx, input.database, {
    ...occupancy.fingerprint,
    overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
    reason: input.reason ?? "R1 test fixture: confirm despite unconfigured hours",
  });
}

/**
 * Authorize a PLACE_HOLD exception using the server-resolved occupancy fingerprint.
 */
export async function authorizeHoldHoursForInquiry(input: {
  ctx: RequestContext;
  database: PrismaClient;
  inquiryId: string;
  reason?: string;
}) {
  const occupancy = await resolveHoldOccupancyContext(input.ctx, input.database, input.inquiryId);
  return authorizeOperatingHoursException(input.ctx, input.database, {
    ...occupancy.fingerprint,
    purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
    overriddenStatus: OPERATING_HOURS_EVALUATION_STATUSES.HOURS_UNCONFIGURED,
    reason: input.reason ?? "R1 test fixture: hold despite unconfigured hours",
  });
}

/** @deprecated Prefer authorizeConfirmHoursForInquiry — kept for call sites with explicit windows. */
export async function authorizeUnconfiguredHoursForConfirm(input: {
  ctx: RequestContext;
  database: PrismaClient;
  organizationId: string;
  locationId: string;
  inquiryId: string;
  slotDate: string;
  startTime: string;
  durationMinutes: number;
  reason?: string;
}) {
  void input.organizationId;
  void input.locationId;
  void input.slotDate;
  void input.startTime;
  void input.durationMinutes;
  return authorizeConfirmHoursForInquiry({
    ctx: input.ctx,
    database: input.database,
    inquiryId: input.inquiryId,
    reason: input.reason,
  });
}

/** @deprecated Prefer authorizeHoldHoursForInquiry */
export async function authorizeUnconfiguredHoursForHold(input: {
  ctx: RequestContext;
  database: PrismaClient;
  organizationId: string;
  locationId: string;
  inquiryId: string;
  slotDate: string;
  startTime: string;
  durationMinutes: number;
  reason?: string;
}) {
  void input.organizationId;
  void input.locationId;
  void input.slotDate;
  void input.startTime;
  void input.durationMinutes;
  return authorizeHoldHoursForInquiry({
    ctx: input.ctx,
    database: input.database,
    inquiryId: input.inquiryId,
    reason: input.reason,
  });
}
