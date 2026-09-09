"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  isAuthorizationError,
  isResourceError,
  isTenantContextError,
} from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { revalidateScheduleAndInquiry } from "@/server/actions/revalidate-resources";
import {
  extendInquiryHolds,
  placeInquiryPlanHold,
  placeManualHold,
  releaseHold,
  releaseInquiryHolds,
  updateInquiryPlanHold,
} from "@/server/services/resource-hold-service";
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

export async function placeManualHoldAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const ctx = await getRequestContext();
    await placeManualHold(ctx, db, {
      resourceId: String(formData.get("resourceId") ?? ""),
      date: String(formData.get("date") ?? ""),
      startTime: String(formData.get("startTime") ?? ""),
      endTime: String(formData.get("endTime") ?? ""),
      inquiryId: String(formData.get("inquiryId") ?? "") || null,
      reason: String(formData.get("reason") ?? "") || null,
      holdHours: Number(formData.get("holdHours") ?? 24) || 24,
    });
    await revalidateScheduleAndInquiry(String(formData.get("inquiryId") ?? "") || undefined);
    return { ok: true, title: "Hold placed", message: "The resource is temporarily unavailable on the Master Schedule." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to place hold");
  }
}

export async function placeInquiryHoldAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = z.string().trim().min(1).parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    await placeInquiryPlanHold(ctx, db, inquiryId);
    await revalidateScheduleAndInquiry(inquiryId);
    return {
      ok: true,
      title: "Resources held",
      message: "Temporary holds were placed for the selected plan. They expire automatically if not converted to a booking.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to place resource hold");
  }
}

export async function releaseHoldAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const reservationId = z.string().trim().min(1).parse(String(formData.get("reservationId") ?? ""));
    const ctx = await getRequestContext();
    await releaseHold(ctx, db, reservationId);
    await revalidateScheduleAndInquiry(String(formData.get("inquiryId") ?? "") || undefined);
    return { ok: true, title: "Hold released", message: "That resource is available again." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to release hold");
  }
}

export async function releaseInquiryHoldsAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = z.string().trim().min(1).parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    await releaseInquiryHolds(ctx, db, inquiryId);
    await revalidateScheduleAndInquiry(inquiryId);
    return { ok: true, title: "Holds released", message: "Held resources for this inquiry are available again." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to release holds");
  }
}

export async function updateInquiryHoldAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = z.string().trim().min(1).parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    await updateInquiryPlanHold(ctx, db, inquiryId);
    await revalidateScheduleAndInquiry(inquiryId);
    return {
      ok: true,
      title: "Resource hold updated",
      message: "Replacement holds were applied in one transaction. Existing holds stay if the update cannot complete.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to update resource hold");
  }
}

export async function extendInquiryHoldAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = z.string().trim().min(1).parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    await extendInquiryHolds(ctx, db, inquiryId);
    await revalidateScheduleAndInquiry(inquiryId);
    return { ok: true, title: "Hold extended", message: "The resource hold expiration was extended." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to extend hold");
  }
}
