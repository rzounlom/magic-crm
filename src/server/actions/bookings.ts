"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  isAuthorizationError,
  isBookingError,
  isInquiryError,
  isResourceError,
  isTenantContextError,
} from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { confirmInquiryBooking } from "@/server/services/booking-service";
import type { SecurityActionResult } from "@/types/security-action";

export async function confirmBookingAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = z.string().trim().min(1).parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    const result = await confirmInquiryBooking(
      ctx,
      db,
      inquiryId,
      String(formData.get("expectedUpdatedAt") ?? "") || null,
    );
    revalidatePath("/app/inquiries");
    revalidatePath(`/app/inquiries/${inquiryId}`);
    revalidatePath("/app/bookings");
    revalidatePath(`/app/bookings/${result.booking.id}`);
    revalidatePath("/app/schedule");
    if (!result.created) {
      return {
        ok: true,
        title: "Already booked",
        message: `This inquiry has already been converted to Booking ${result.booking.bookingNumber}.`,
      };
    }
    return {
      ok: true,
      title: "Booking confirmed",
      message: `${result.booking.bookingNumber} is confirmed. Resources are BOOKED. No email was sent.`,
    };
  } catch (error) {
    unstable_rethrow(error);
    if (
      isAuthorizationError(error) ||
      isTenantContextError(error) ||
      isInquiryError(error) ||
      isResourceError(error) ||
      isBookingError(error)
    ) {
      return { ok: false, code: error.code, title: "Unable to confirm booking", message: error.userMessage };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, title: "Unable to confirm booking", message: "Check the form and try again." };
    }
    throw error;
  }
}
