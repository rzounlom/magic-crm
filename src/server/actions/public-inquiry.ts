"use server";

import { unstable_rethrow } from "next/navigation";
import { headers } from "next/headers";

import { db } from "@/lib/db";
import { isInquiryError } from "@/server/errors";
import { readPublicIntakeFields } from "@/server/inquiries/intake-validation";
import {
  createPublicInquiry,
  submitPublicConversationMessage,
} from "@/server/services/inquiry-service";
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
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      eventType: String(formData.get("eventType") ?? ""),
      occasion: String(formData.get("occasion") ?? ""),
      preferredDate: String(formData.get("preferredDate") ?? ""),
      startTime: String(formData.get("startTime") ?? ""),
      guestCount: String(formData.get("guestCount") ?? ""),
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
    const result = await createPublicInquiry(
      db,
      {
        organizationSlug: slug,
        rateLimitKey: await rateLimitIdentity(slug),
        ...fields.data,
        phone: fields.data.phone || undefined,
        occasion: fields.data.occasion || undefined,
        notes: fields.data.notes || undefined,
      },
      readSalesAgentRuntime(),
    );
    return {
      ok: true,
      title: "Inquiry received",
      message: "The Event Assistant will reply in this conversation.",
      redirectTo: `/conversation/${result.publicToken}`,
    };
  } catch (error) {
    unstable_rethrow(error);
    if (isInquiryError(error)) {
      return { ok: false, code: error.code, title: "Unable to send inquiry", message: error.userMessage };
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
