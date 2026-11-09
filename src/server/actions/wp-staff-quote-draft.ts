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
import { createWpStaffQuoteDraftFromInquiry } from "@/server/services/wp-staff-quote-draft-service";
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
