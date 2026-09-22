"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  isAuthorizationError,
  isInquiryError,
  isResourceError,
  isTenantContextError,
} from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import {
  adoptRecommendationAsWorkingPlan,
  applyWorkingPlanStartTime,
  checkInquiryAvailability,
  markCustomerContacted,
  markInquiryReadyToFinalize,
  saveAgentWorkingPlan,
  saveEmployeeInternalNotes,
  savePendingEmployeeBooking,
  startWorkingInquiry,
  suggestClosestAvailableAlternatives,
} from "@/server/services/live-agent-service";
import type { EventPlanRotation } from "@/types/event-planner";
import type { SecurityActionResult } from "@/types/security-action";

const idSchema = z.string().trim().min(1);

function toResult(error: unknown, title: string): SecurityActionResult {
  if (isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error) || isResourceError(error)) {
    return { ok: false, code: error.code, title, message: error.userMessage };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, title, message: "Check the form and try again." };
  }
  throw error;
}

function parseRotations(formData: FormData): EventPlanRotation[] {
  const rotations: EventPlanRotation[] = [];
  for (let index = 0; index < 6; index += 1) {
    const startTime = String(formData.get(`rotationStart_${index}`) ?? "").trim();
    const endTime = String(formData.get(`rotationEnd_${index}`) ?? "").trim();
    const lines = String(formData.get(`rotationAssignments_${index}`) ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!startTime || !endTime || lines.length === 0) {
      continue;
    }
    rotations.push({
      startTime,
      endTime,
      assignments: lines.map((line) => {
        const [groupLabel, activityName] = line.split(":").map((part) => part.trim());
        return {
          groupLabel: groupLabel || "Group",
          activityName: activityName || line,
        };
      }),
    });
  }
  return rotations;
}

export async function startWorkingInquiryAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    await startWorkingInquiry(ctx, db, inquiryId);
    revalidatePath("/app/inquiries");
    revalidatePath(`/app/inquiries/${inquiryId}`);
    return { ok: true, title: "You are working this inquiry", message: "Assignment is saved. Other agents will see that you started." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to start working");
  }
}

export async function saveAgentWorkingPlanAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const activityIds = formData.getAll("activityIds").map((value) => String(value));
    const activityQuantities: Record<string, number> = {};
    for (const id of activityIds) {
      activityQuantities[id] = Number(formData.get(`quantity_${id}`) ?? 1) || 1;
    }
    const ctx = await getRequestContext();
    const saved = await saveAgentWorkingPlan(
      ctx,
      db,
      inquiryId,
      {
        eventDate: String(formData.get("eventDate") ?? "") || null,
        startTime: String(formData.get("startTime") ?? "") || null,
        durationMinutes: Number(formData.get("durationMinutes") ?? 0) || 0,
        guestCount: Number(formData.get("guestCount") ?? 0) || 0,
        activityIds,
        activityQuantities,
        diningKnowledgeItemId: String(formData.get("diningKnowledgeItemId") ?? "") || null,
        spaceKnowledgeItemId: String(formData.get("spaceKnowledgeItemId") ?? "") || null,
        scheduleLines: String(formData.get("schedule") ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        rotations: parseRotations(formData),
      },
      String(formData.get("expectedUpdatedAt") ?? "") || null,
    );
    revalidatePath("/app/inquiries");
    revalidatePath(`/app/inquiries/${inquiryId}`);
    return {
      ok: true,
      title: "Working version saved",
      message: saved.holdAffected
        ? "Pricing was recalculated from catalog/sales knowledge. A pending booking snapshot was updated."
        : "Pricing and availability were recalculated from sales knowledge.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to save working version");
  }
}

export async function markReadyToFinalizeAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    await markInquiryReadyToFinalize(ctx, db, inquiryId, String(formData.get("expectedUpdatedAt") ?? "") || null);
    revalidatePath("/app/inquiries");
    revalidatePath(`/app/inquiries/${inquiryId}`);
    return {
      ok: true,
      title: "Ready to finalize",
      message: "Resources stay on HOLD. This is not a booking or payment.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to mark ready to finalize");
  }
}

export async function saveInternalNotesAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    await saveEmployeeInternalNotes(ctx, db, inquiryId, String(formData.get("notes") ?? ""));
    revalidatePath(`/app/inquiries/${inquiryId}`);
    return { ok: true, title: "Internal notes saved", message: "These notes are not shown to the customer." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to save notes");
  }
}

export async function markCustomerContactedAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    await markCustomerContacted(ctx, db, inquiryId);
    revalidatePath("/app/inquiries");
    revalidatePath(`/app/inquiries/${inquiryId}`);
    return { ok: true, title: "Customer contacted", message: "Contact was recorded on this inquiry." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to record contact");
  }
}

export async function suggestAlternativesAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    const suggestions = await suggestClosestAvailableAlternatives(ctx, db, inquiryId);
    if (suggestions.length === 0) {
      return {
        ok: false,
        title: "No nearby times found",
        message: "Nearby start times still conflict. Try another attraction or inspect the Master Schedule.",
      };
    }
    return {
      ok: true,
      title: "Closest available times",
      message: suggestions.map((row) => row.note).join(" "),
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to suggest alternatives");
  }
}

export async function checkInquiryAvailabilityAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    const result = await checkInquiryAvailability(ctx, db, inquiryId);
    revalidatePath("/app/inquiries");
    revalidatePath(`/app/inquiries/${inquiryId}`);
    revalidatePath("/app/schedule");
    if (!result.validated) {
      return {
        ok: true,
        title: "Availability not validated",
        message: result.note || "Numbered inventory still needs configuration before availability can be confirmed.",
      };
    }
    if (result.available) {
      const start = result.requirements[0]?.windowStartTime;
      return {
        ok: true,
        title: "Available",
        message: start
          ? `All required resources are currently available at ${start}. Availability will be rechecked when the booking is confirmed.`
          : "All required resources are currently available. Availability will be rechecked when the booking is confirmed.",
      };
    }
    const nearby = result.nearbyStartTimes;
    const conflictNames = result.result.types.filter((row) => row.conflict).map((row) => row.resourceTypeName);
    const conflictLabel = conflictNames[0] ?? "A required resource";
    return {
      ok: false,
      title: "Unavailable",
      message:
        nearby.length > 0
          ? `${conflictLabel} is unavailable at the selected time. Nearby availability exists at ${nearby.join(" and ")}.`
          : result.note || `${conflictLabel} is unavailable at the selected time.`,
      refresh: true,
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to check availability");
  }
}

export async function adoptRecommendationAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const planId = idSchema.parse(String(formData.get("planId") ?? ""));
    const ctx = await getRequestContext();
    await adoptRecommendationAsWorkingPlan(
      ctx,
      db,
      inquiryId,
      planId,
      String(formData.get("expectedUpdatedAt") ?? "") || null,
    );
    revalidatePath("/app/inquiries");
    revalidatePath(`/app/inquiries/${inquiryId}`);
    return {
      ok: true,
      title: "Package updated",
      message: "The working plan now uses the selected package. Pricing was recalculated on the server.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to switch package");
  }
}

export async function applyWorkingPlanStartTimeAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const startTime = z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d/)
      .parse(String(formData.get("startTime") ?? ""));
    const ctx = await getRequestContext();
    const result = await applyWorkingPlanStartTime(ctx, db, inquiryId, startTime);
    revalidatePath("/app/inquiries");
    revalidatePath(`/app/inquiries/${inquiryId}`);
    revalidatePath("/app/schedule");
    return {
      ok: true,
      title: "Schedule updated",
      message: result.available
        ? `The plan now starts at ${result.startTime}. Check availability was re-run for this itinerary.`
        : `The plan now starts at ${result.startTime}. Recheck availability before confirming.`,
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to apply that start time");
  }
}

export async function savePendingBookingAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    const pending = await savePendingEmployeeBooking(ctx, db, inquiryId);
    revalidatePath("/app/inquiries");
    revalidatePath(`/app/inquiries/${inquiryId}`);
    revalidatePath("/app/bookings");
    revalidatePath("/app/schedule");
    return {
      ok: true,
      title: "Pending booking saved",
      message: `${pending.booking.bookingNumber} is saved as pending payment. Inventory is not reserved.`,
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to save pending booking");
  }
}
