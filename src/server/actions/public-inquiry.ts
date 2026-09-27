"use server";

import { unstable_rethrow } from "next/navigation";
import { headers } from "next/headers";

import { db } from "@/lib/db";
import { isInquiryError } from "@/server/errors";
import { readPublicIntakeFields } from "@/server/inquiries/intake-validation";
import { bookPublicEventPlan, selectPublicEventPlan } from "@/server/services/event-plan-service";
import { createPublicInquiry, submitPublicConversationMessage } from "@/server/services/inquiry-service";
import { readSalesAgentRuntime } from "@/server/ai/sales-agent-runtime";
import type { SecurityActionResult } from "@/types/security-action";

function clientKey(slug: string, token?: string) {
  return token ? `conv:${slug}:${token}` : `intake:${slug}`;
}

async function rateLimitIdentity(fallback: string): Promise<string> {
  const headerStore = await headers();
  return headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || fallback;
}

export async function submitPublicInquiryAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const slug = String(formData.get("organizationSlug") ?? "");
    const fields = readPublicIntakeFields({
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      customerGroupName: String(formData.get("customerGroupName") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      eventType: String(formData.get("eventType") ?? ""),
      preferredDate: String(formData.get("preferredDate") ?? ""),
      startTime: String(formData.get("startTime") ?? ""),
      guestCount: String(formData.get("guestCount") ?? ""),
      guestMix: String(formData.get("guestMix") ?? ""),
      desiredDurationMinutes: String(formData.get("desiredDurationMinutes") ?? ""),
      budgetBand: String(formData.get("budgetBand") ?? ""),
      budgetPreference: String(formData.get("budgetPreference") ?? ""),
      eventGoal: String(formData.get("eventGoal") ?? ""),
      diningPreference: String(formData.get("diningPreference") ?? ""),
      foodPreference: String(formData.get("foodPreference") ?? ""),
      beveragePreference: String(formData.get("beveragePreference") ?? ""),
      spacePreference: String(formData.get("spacePreference") ?? ""),
      privateSpacePreference: String(formData.get("privateSpacePreference") ?? ""),
      attractionMode: String(formData.get("attractionMode") ?? ""),
      attractionInterestIds: formData.getAll("attractionInterestIds").map(String),
      notes: String(formData.get("notes") ?? ""),
      companyWebsite: String(formData.get("companyWebsite") ?? ""),
      submissionId: String(formData.get("submissionId") ?? ""),
    });
    if (!fields.success) {
      return {
        ok: false,
        code: "INVALID_INTAKE",
        title: "Check the form",
        message: "Check the highlighted fields and try again.",
        fieldErrors: fields.fieldErrors,
      };
    }
    const result = await createPublicInquiry(db, {
      organizationSlug: slug,
      rateLimitKey: await rateLimitIdentity(slug),
      ...fields.data,
      phone: fields.data.phone || undefined,
      notes: fields.data.notes || undefined,
    });
    return {
      ok: true,
      title: "Inquiry received",
      message: "Your personalized event options are ready.",
      redirectTo: `/plan/${result.publicToken}`,
    };
  } catch (error) {
    unstable_rethrow(error);
    if (isInquiryError(error)) {
      return { ok: false, code: error.code, title: "Unable to send inquiry", message: error.userMessage };
    }
    throw error;
  }
}

export async function selectPublicEventPlanAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const token = String(formData.get("token") ?? "");
    const planId = String(formData.get("planId") ?? "");
    await selectPublicEventPlan(db, {
      token,
      planId,
      rateLimitKey: await rateLimitIdentity(clientKey("plan", token)),
    });
    return {
      ok: true,
      title: "Inquiry submitted",
      message: "Thanks — your inquiry has been submitted. A member of the events team will follow up with you to review the details and help finalize your event.",
    };
  } catch (error) {
    unstable_rethrow(error);
    if (isInquiryError(error)) {
      return { ok: false, code: error.code, title: "Unable to save that plan", message: error.userMessage };
    }
    throw error;
  }
}

export async function reservePublicEventPlanAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const token = String(formData.get("token") ?? "");
    const planId = String(formData.get("planId") ?? "");
    await bookPublicEventPlan(db, {
      token,
      planId,
      rateLimitKey: await rateLimitIdentity(clientKey("plan-reserve", token)),
    });
    return {
      ok: true,
      title: "Booking request received",
      message:
        "Your booking request has been saved. The next step is the required deposit. Your booking is not yet confirmed and inventory is not reserved until payment is received.",
    };
  } catch (error) {
    unstable_rethrow(error);
    if (isInquiryError(error)) {
      return {
        ok: false,
        code: error.code,
        title: "Unable to save that booking request",
        message: error.userMessage,
      };
    }
    throw error;
  }
}

export async function submitPublicConversationMessageAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  try {
    const token = String(formData.get("token") ?? "");
    await submitPublicConversationMessage(
      db,
      {
        token,
        message: String(formData.get("message") ?? ""),
        submissionId: String(formData.get("submissionId") ?? ""),
        rateLimitKey: await rateLimitIdentity(clientKey("web", token)),
      },
      readSalesAgentRuntime(),
    );
    return { ok: true, title: "Message sent", message: "Your message was added to the conversation." };
  } catch (error) {
    unstable_rethrow(error);
    if (isInquiryError(error)) {
      return { ok: false, code: error.code, title: "Unable to send message", message: error.userMessage };
    }
    throw error;
  }
}
