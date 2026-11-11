"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { revalidateOperatingHoursAdministration } from "@/server/actions/revalidate-operating-hours";
import {
  isAuthorizationError,
  isResourceError,
  isTenantContextError,
} from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import {
  deleteOperatingHoursDateException,
  revertOperatingHoursPolicyToDraft,
  saveWeeklyOperatingHoursDraft,
  upsertOperatingHoursDateException,
  verifyOperatingHoursPolicy,
} from "@/server/services/operating-hours-admin-service";
import { OPERATING_HOURS_EXCEPTION_KINDS } from "@/types/operating-hours";
import type { SecurityActionResult } from "@/types/security-action";

function toResult(error: unknown, title: string): SecurityActionResult {
  if (isAuthorizationError(error) || isTenantContextError(error) || isResourceError(error)) {
    return { ok: false, code: error.code, title, message: error.userMessage };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, title, message: "Check the form and try again." };
  }
  throw error;
}

const weeklyWindowSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int(),
  endMinute: z.number().int(),
});

export async function saveWeeklyOperatingHoursDraftAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  try {
    const locationId = z.string().trim().min(1).parse(String(formData.get("locationId") ?? ""));
    const rawWindows = String(formData.get("windowsJson") ?? "[]");
    const windows = z.array(weeklyWindowSchema).parse(JSON.parse(rawWindows));
    const ctx = await getRequestContext();
    await saveWeeklyOperatingHoursDraft(ctx, db, { locationId, windows });
    revalidateOperatingHoursAdministration(locationId);
    return {
      ok: true,
      title: "Draft hours saved",
      message: "Weekly schedule saved as DRAFT. Verify before booking uses these hours.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to save weekly hours");
  }
}

export async function upsertOperatingHoursDateExceptionAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  try {
    const locationId = z.string().trim().min(1).parse(String(formData.get("locationId") ?? ""));
    const kindRaw = String(formData.get("kind") ?? "");
    const kind =
      kindRaw === OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM
        ? OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM
        : OPERATING_HOURS_EXCEPTION_KINDS.CLOSED;
    const startRaw = String(formData.get("startMinute") ?? "").trim();
    const endRaw = String(formData.get("endMinute") ?? "").trim();
    const ctx = await getRequestContext();
    await upsertOperatingHoursDateException(ctx, db, {
      locationId,
      exception: {
        localDate: String(formData.get("localDate") ?? ""),
        kind,
        startMinute: kind === OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM && startRaw ? Number(startRaw) : null,
        endMinute: kind === OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM && endRaw ? Number(endRaw) : null,
        note: String(formData.get("note") ?? "") || null,
      },
    });
    revalidateOperatingHoursAdministration(locationId);
    return {
      ok: true,
      title: "Exception saved",
      message: "Date exception saved. Policy remains DRAFT until verified again.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to save hours exception");
  }
}

export async function deleteOperatingHoursDateExceptionAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  try {
    const locationId = z.string().trim().min(1).parse(String(formData.get("locationId") ?? ""));
    const exceptionId = z.string().trim().min(1).parse(String(formData.get("exceptionId") ?? ""));
    const ctx = await getRequestContext();
    await deleteOperatingHoursDateException(ctx, db, { locationId, exceptionId });
    revalidateOperatingHoursAdministration(locationId);
    return { ok: true, title: "Exception removed", message: "Date exception deleted." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to delete hours exception");
  }
}

export async function verifyOperatingHoursPolicyAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  try {
    const locationId = z.string().trim().min(1).parse(String(formData.get("locationId") ?? ""));
    const approvedByNote = String(formData.get("approvedByNote") ?? "");
    const ctx = await getRequestContext();
    await verifyOperatingHoursPolicy(ctx, db, { locationId, approvedByNote });
    revalidateOperatingHoursAdministration(locationId);
    return {
      ok: true,
      title: "Hours verified",
      message: "Booking confirmation will use these verified hours for this location.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to verify hours");
  }
}

export async function revertOperatingHoursPolicyToDraftAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  try {
    const locationId = z.string().trim().min(1).parse(String(formData.get("locationId") ?? ""));
    const ctx = await getRequestContext();
    await revertOperatingHoursPolicyToDraft(ctx, db, { locationId });
    revalidateOperatingHoursAdministration(locationId);
    return {
      ok: true,
      title: "Hours reverted to draft",
      message: "Verified status cleared. Confirm/hold paths treat hours as unverified until re-verified.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to revert hours");
  }
}
