"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  isAuthorizationError,
  isBookingError,
  isInquiryError,
  isTenantContextError,
} from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import {
  authorizeOperatingHoursException,
  isOverridableOperatingHoursStatus,
  revokeOperatingHoursException,
} from "@/server/resources/hours-exception";
import {
  getConfirmationReadiness,
  resolveConfirmOccupancyContext,
} from "@/server/services/confirmation-readiness-service";
import {
  getHoldReadiness,
  resolveHoldOccupancyContext,
} from "@/server/services/hold-readiness-service";
import { OPERATING_HOURS_EXCEPTION_PURPOSES } from "@/types/operating-hours";
import type { SecurityActionResult } from "@/types/security-action";

function toErrorResult(error: unknown, title: string): SecurityActionResult {
  if (
    isAuthorizationError(error) ||
    isTenantContextError(error) ||
    isInquiryError(error) ||
    isBookingError(error)
  ) {
    return { ok: false, code: error.code, title, message: error.userMessage, refresh: true };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, title, message: "Check the form and try again." };
  }
  throw error;
}

function revalidateInquiry(inquiryId: string) {
  revalidatePath("/app/inquiries");
  revalidatePath(`/app/inquiries/${inquiryId}`);
  revalidatePath("/app/bookings");
  revalidatePath("/app/schedule");
}

/**
 * Authorize a one-time CONFIRM_BOOKING hours exception for an inquiry.
 * Fingerprint is derived server-side from the inquiry plan — not from client date/time fields.
 */
export async function authorizeConfirmHoursExceptionAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  try {
    const parsedInquiryId = z.string().trim().min(1).parse(inquiryId);
    const reason = z
      .string()
      .trim()
      .min(8, "Provide a reason of at least 8 characters.")
      .max(500)
      .parse(String(formData.get("reason") ?? ""));
    const ctx = await getRequestContext();
    const occupancy = await resolveConfirmOccupancyContext(ctx, db, parsedInquiryId);
    if (!isOverridableOperatingHoursStatus(occupancy.operatingHoursStatus)) {
      return {
        ok: false,
        code: "HOURS_EXCEPTION_INVALID",
        title: "Unable to authorize exception",
        message:
          occupancy.operatingHoursStatus === "WITHIN_HOURS"
            ? "Operating hours already allow this event. An exception is not needed."
            : "This operating-hours status cannot be overridden with a staff exception.",
        refresh: true,
      };
    }
    const row = await authorizeOperatingHoursException(ctx, db, {
      ...occupancy.fingerprint,
      overriddenStatus: occupancy.operatingHoursStatus,
      reason,
    });
    revalidateInquiry(parsedInquiryId);
    return {
      ok: true,
      title: "Hours exception authorized",
      message: `One-time exception recorded for ${occupancy.slotDate} ${occupancy.startTime}–${occupancy.endTime} (${occupancy.timeZone}). It expires ${row.expiresAt.toISOString()} and is consumed only if confirmation succeeds.`,
    };
  } catch (error) {
    unstable_rethrow(error);
    if (inquiryId) {
      revalidateInquiry(inquiryId);
    }
    return toErrorResult(error, "Unable to authorize exception");
  }
}

export async function revokeConfirmHoursExceptionAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  try {
    const parsedInquiryId = z.string().trim().min(1).parse(inquiryId);
    const exceptionId = z.string().trim().min(1).parse(String(formData.get("exceptionId") ?? ""));
    const ctx = await getRequestContext();
    // Ensure the exception belongs to this inquiry's occupancy fingerprint before revoke.
    const occupancy = await resolveConfirmOccupancyContext(ctx, db, parsedInquiryId);
    const existing = await db.operatingHoursStaffException.findFirst({
      where: {
        id: exceptionId,
        organizationId: ctx.organizationId,
        locationId: occupancy.locationId,
        purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.CONFIRM_BOOKING,
      },
    });
    if (!existing) {
      return {
        ok: false,
        code: "HOURS_EXCEPTION_INVALID",
        title: "Unable to revoke exception",
        message: "That operating-hours exception was not found for this organization.",
        refresh: true,
      };
    }
    await revokeOperatingHoursException(ctx, db, exceptionId);
    revalidateInquiry(parsedInquiryId);
    return {
      ok: true,
      title: "Hours exception revoked",
      message: "The unused exception can no longer authorize confirmation.",
    };
  } catch (error) {
    unstable_rethrow(error);
    if (inquiryId) {
      revalidateInquiry(inquiryId);
    }
    return toErrorResult(error, "Unable to revoke exception");
  }
}

/** Staff-facing readiness snapshot (also useful for tests). */
export async function loadConfirmationReadinessAction(
  inquiryId: string,
): Promise<SecurityActionResult & { readiness?: Awaited<ReturnType<typeof getConfirmationReadiness>> }> {
  try {
    const parsedInquiryId = z.string().trim().min(1).parse(inquiryId);
    const ctx = await getRequestContext();
    const readiness = await getConfirmationReadiness(ctx, db, parsedInquiryId);
    return {
      ok: true,
      title: readiness.headline,
      message: readiness.detail,
      readiness,
    };
  } catch (error) {
    unstable_rethrow(error);
    return toErrorResult(error, "Unable to load confirmation readiness");
  }
}

/**
 * Authorize a one-time PLACE_HOLD hours exception for an inquiry.
 * Fingerprint is derived server-side from the inquiry plan — not from client date/time fields.
 */
export async function authorizePlaceHoldHoursExceptionAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  try {
    const parsedInquiryId = z.string().trim().min(1).parse(inquiryId);
    const reason = z
      .string()
      .trim()
      .min(8, "Provide a reason of at least 8 characters.")
      .max(500)
      .parse(String(formData.get("reason") ?? ""));
    const ctx = await getRequestContext();
    const occupancy = await resolveHoldOccupancyContext(ctx, db, parsedInquiryId);
    if (!isOverridableOperatingHoursStatus(occupancy.operatingHoursStatus)) {
      return {
        ok: false,
        code: "HOURS_EXCEPTION_INVALID",
        title: "Unable to authorize exception",
        message:
          occupancy.operatingHoursStatus === "WITHIN_HOURS"
            ? "Operating hours already allow this event. An exception is not needed."
            : "This operating-hours status cannot be overridden with a staff exception.",
        refresh: true,
      };
    }
    const row = await authorizeOperatingHoursException(ctx, db, {
      ...occupancy.fingerprint,
      overriddenStatus: occupancy.operatingHoursStatus,
      reason,
    });
    revalidateInquiry(parsedInquiryId);
    return {
      ok: true,
      title: "Hours exception authorized",
      message: `One-time HOLD exception recorded for ${occupancy.slotDate} ${occupancy.startTime}–${occupancy.endTime} (${occupancy.timeZone}). It expires ${row.expiresAt.toISOString()} and is consumed only if the HOLD succeeds.`,
    };
  } catch (error) {
    unstable_rethrow(error);
    if (inquiryId) {
      revalidateInquiry(inquiryId);
    }
    return toErrorResult(error, "Unable to authorize exception");
  }
}

export async function revokePlaceHoldHoursExceptionAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  try {
    const parsedInquiryId = z.string().trim().min(1).parse(inquiryId);
    const exceptionId = z.string().trim().min(1).parse(String(formData.get("exceptionId") ?? ""));
    const ctx = await getRequestContext();
    const occupancy = await resolveHoldOccupancyContext(ctx, db, parsedInquiryId);
    const existing = await db.operatingHoursStaffException.findFirst({
      where: {
        id: exceptionId,
        organizationId: ctx.organizationId,
        locationId: occupancy.locationId,
        purpose: OPERATING_HOURS_EXCEPTION_PURPOSES.PLACE_HOLD,
      },
    });
    if (!existing) {
      return {
        ok: false,
        code: "HOURS_EXCEPTION_INVALID",
        title: "Unable to revoke exception",
        message: "That operating-hours exception was not found for this organization.",
        refresh: true,
      };
    }
    await revokeOperatingHoursException(ctx, db, exceptionId);
    revalidateInquiry(parsedInquiryId);
    return {
      ok: true,
      title: "Hours exception revoked",
      message: "The unused exception can no longer authorize HOLD placement.",
    };
  } catch (error) {
    unstable_rethrow(error);
    if (inquiryId) {
      revalidateInquiry(inquiryId);
    }
    return toErrorResult(error, "Unable to revoke exception");
  }
}

export async function loadHoldReadinessAction(
  inquiryId: string,
): Promise<SecurityActionResult & { readiness?: Awaited<ReturnType<typeof getHoldReadiness>> }> {
  try {
    const parsedInquiryId = z.string().trim().min(1).parse(inquiryId);
    const ctx = await getRequestContext();
    const readiness = await getHoldReadiness(ctx, db, parsedInquiryId);
    return {
      ok: true,
      title: readiness.headline,
      message: readiness.detail,
      readiness,
    };
  } catch (error) {
    unstable_rethrow(error);
    return toErrorResult(error, "Unable to load HOLD readiness");
  }
}
