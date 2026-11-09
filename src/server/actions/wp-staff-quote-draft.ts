"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { revalidateBookingWorkspace } from "@/server/actions/revalidate-booking-workspace";
import {
  isAuthorizationError,
  isInquiryError,
  isTenantContextError,
} from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import {
  approveAndSendWpStaffQuote,
  checkWpStaffQuoteAvailability,
  createWpStaffQuoteDraftFromInquiry,
  updateWpStaffQuoteDraft,
} from "@/server/services/wp-staff-quote-draft-service";
import type { SecurityActionResult } from "@/types/security-action";

const idSchema = z.string().trim().min(1);

function toResult(error: unknown, title: string): SecurityActionResult {
  if (isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error)) {
    return { ok: false, code: error.code, title, message: error.userMessage };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, title, message: "Check the form and try again." };
  }
  throw error;
}

export async function createWpStaffQuoteDraftAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const dateRaw = String(formData.get("planDate") ?? "").trim();
    const ctx = await getRequestContext();
    const result = await createWpStaffQuoteDraftFromInquiry(ctx, db, inquiryId, {
      date: dateRaw || undefined,
    });
    revalidateBookingWorkspace({ inquiryId });
    const dollars = ((result.estimatedTotalCents ?? 0) / 100).toFixed(2);
    return {
      ok: true,
      title: result.refreshed ? "Staff quote draft refreshed" : "Staff quote draft created",
      message: `Editable working draft saved at $${dollars}. Not sent to the customer. Availability not held.`,
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to create staff quote draft");
  }
}

export async function updateWpStaffQuoteDraftAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const lineCount = Number(formData.get("lineCount") ?? 0);
    const lineItems = [];
    for (let index = 0; index < lineCount; index += 1) {
      const name = String(formData.get(`lineName_${index}`) ?? "").trim();
      const slug = String(formData.get(`lineSlug_${index}`) ?? "").trim();
      if (!name && !slug) {
        continue;
      }
      lineItems.push({
        slug: slug || `wp-line-${index + 1}`,
        name: name || `Line ${index + 1}`,
        quantity: Number(formData.get(`lineQty_${index}`) ?? 1) || 1,
        unitPriceCents: Math.round(Number(formData.get(`lineUnitCents_${index}`) ?? 0) || 0),
        kind: String(formData.get(`lineKind_${index}`) ?? "WP_LINE").trim() || "WP_LINE",
      });
    }
    const ctx = await getRequestContext();
    const result = await updateWpStaffQuoteDraft(ctx, db, inquiryId, {
      guestCount: Number(formData.get("guestCount") ?? 0) || 0,
      eventDate: String(formData.get("eventDate") ?? "").trim() || null,
      startTime: String(formData.get("startTime") ?? "").trim() || null,
      durationMinutes: Number(formData.get("durationMinutes") ?? 0) || 0,
      lineItems,
      adjustmentNote: String(formData.get("adjustmentNote") ?? "").trim() || null,
      editReason: String(formData.get("editReason") ?? "").trim(),
    });
    revalidateBookingWorkspace({ inquiryId });
    const dollars = ((result.estimatedTotalCents ?? 0) / 100).toFixed(2);
    return {
      ok: true,
      title: "Staff quote draft updated",
      message: `Saved at $${dollars} using explicit staff amounts (no MagiCRM catalog reprice). Re-check availability before sending.`,
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to update staff quote draft");
  }
}

export async function checkWpStaffQuoteAvailabilityAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    const result = await checkWpStaffQuoteAvailability(ctx, db, inquiryId);
    revalidateBookingWorkspace({ inquiryId });
    return {
      ok: true,
      title: result.available ? "Availability looks clear" : "Availability needs review",
      message: result.note,
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to check availability");
  }
}

export async function approveAndSendWpStaffQuoteAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    const result = await approveAndSendWpStaffQuote(ctx, db, inquiryId, {
      approvalNote: String(formData.get("approvalNote") ?? "").trim() || null,
      forceResend: String(formData.get("forceResend") ?? "") === "1",
    });
    revalidateBookingWorkspace({ inquiryId });
    if (result.delivered) {
      return {
        ok: true,
        title: result.idempotent ? "Quote already delivered" : "Quote approved and sent",
        message: result.planUrl
          ? `${result.message} Customer link: ${result.planUrl}`
          : result.message,
      };
    }
    return {
      ok: true,
      title: "Quote approved — delivery blocked",
      message: result.message,
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to approve and send quote");
  }
}
