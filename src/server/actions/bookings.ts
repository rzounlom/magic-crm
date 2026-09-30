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
import { confirmInquiryBooking, cancelBooking } from "@/server/services/booking-service";
import { createEmployeeManualInquiry } from "@/server/services/inquiry-service";
import { EVENT_DURATION_MINUTES } from "@/types/event-planner";
import type { SecurityActionResult } from "@/types/security-action";

function employeeDurationMinutes(value: FormDataEntryValue | null): number {
  const parsed = Number(value);
  return EVENT_DURATION_MINUTES.includes(parsed as (typeof EVENT_DURATION_MINUTES)[number]) ? parsed : 120;
}

export async function confirmBookingAction(formData: FormData): Promise<SecurityActionResult> {
  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  try {
    const parsedInquiryId = z.string().trim().min(1).parse(inquiryId);
    const ctx = await getRequestContext();
    const result = await confirmInquiryBooking(ctx, db, parsedInquiryId);
    revalidatePath("/app/inquiries");
    revalidatePath(`/app/inquiries/${parsedInquiryId}`);
    revalidatePath("/app/bookings");
    revalidatePath(`/app/bookings/${result.booking.id}`);
    revalidatePath("/app/schedule");
    if (result.conflict) {
      const nearby =
        result.conflict.nearbyStartTimes.length > 0
          ? ` Closest available options: ${result.conflict.nearbyStartTimes.join(", ")}.`
          : "";
      return {
        ok: false,
        code: "RESOURCE_CONFLICT",
        title: "Unable to confirm booking",
        message: `${result.conflict.note}${nearby}`,
        refresh: true,
      };
    }
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
      message: `${result.booking.bookingNumber} is confirmed. Required resources are booked on the Master Schedule.`,
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
      if (inquiryId) {
        revalidatePath("/app/inquiries");
        revalidatePath(`/app/inquiries/${inquiryId}`);
      }
      return { ok: false, code: error.code, title: "Unable to confirm booking", message: error.userMessage, refresh: true };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, title: "Unable to confirm booking", message: "Check the form and try again." };
    }
    throw error;
  }
}

export async function createEmployeeManualBookingAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const ctx = await getRequestContext();
    const created = await createEmployeeManualInquiry(ctx, db, {
      firstName: String(formData.get("firstName") ?? "").trim(),
      lastName: String(formData.get("lastName") ?? "").trim(),
      customerGroupName: String(formData.get("customerGroupName") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim() || null,
      eventType: String(formData.get("eventType") ?? "").trim(),
      eventGoal: String(formData.get("eventGoal") ?? "").trim() || null,
      preferredDate: String(formData.get("preferredDate") ?? "").trim(),
      startTime: String(formData.get("startTime") ?? "").trim(),
      guestCount: Number(formData.get("guestCount") ?? 0),
      guestMix: String(formData.get("guestMix") ?? "").trim() || null,
      desiredDurationMinutes: employeeDurationMinutes(formData.get("desiredDurationMinutes")),
      diningPreference: String(formData.get("diningPreference") ?? "").trim() || null,
      spacePreference: String(formData.get("spacePreference") ?? "").trim() || null,
      attractionInterestIds: formData.getAll("attractionInterestIds").map(String).filter(Boolean),
      notes: String(formData.get("notes") ?? "").trim() || null,
      locationId: String(formData.get("locationId") ?? "").trim() || null,
    });
    revalidatePath("/app/bookings");
    revalidatePath("/app/inquiries");
    revalidatePath(`/app/inquiries/${created.inquiryId}`);
    return {
      ok: true,
      title: "Booking started",
      message: "Review the generated plan, check availability, then save pending or confirm payment.",
      redirectTo: `/app/inquiries/${created.inquiryId}`,
    };
  } catch (error) {
    unstable_rethrow(error);
    throw error;
  }
}

export async function cancelBookingAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const bookingId = String(formData.get("bookingId") ?? "").trim() || null;
    const inquiryId = String(formData.get("inquiryId") ?? "").trim() || null;
    const ctx = await getRequestContext();
    const result = await cancelBooking(ctx, db, { bookingId, inquiryId });
    revalidatePath("/app/bookings");
    revalidatePath(`/app/bookings/${result.booking.id}`);
    revalidatePath("/app/inquiries");
    revalidatePath(`/app/inquiries/${result.booking.inquiryId}`);
    revalidatePath("/app/schedule");
    if (result.alreadyCancelled) {
      return {
        ok: true,
        title: "Already cancelled",
        message: `${result.booking.bookingNumber} is already cancelled.`,
      };
    }
    return {
      ok: true,
      title: "Booking cancelled",
      message:
        result.releasedCount > 0
          ? `${result.booking.bookingNumber} is cancelled. Future reserved resources were released on the Master Schedule.`
          : `${result.booking.bookingNumber} is cancelled. No resources were reserved.`,
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
      return { ok: false, code: error.code, title: "Unable to cancel booking", message: error.userMessage };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, title: "Unable to cancel booking", message: "Check the form and try again." };
    }
    throw error;
  }
}
