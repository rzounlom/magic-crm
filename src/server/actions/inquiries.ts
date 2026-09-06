"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  isAuthorizationError,
  isInquiryError,
  isTenantContextError,
} from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import {
  addEmployeeConversationMessage,
  resumeInquiryAi,
  takeOverInquiry,
} from "@/server/services/inquiry-service";
import type { SecurityActionResult } from "@/types/security-action";

const idSchema = z.string().trim().min(1);

function toResult(error: unknown, title: string): SecurityActionResult {
  if (isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error)) {
    return { ok: false, code: error.code, title, message: error.userMessage };
  }
  throw error;
}

export async function takeOverInquiryAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    await takeOverInquiry(ctx, db, inquiryId);
    revalidatePath("/app/inquiries");
    revalidatePath(`/app/inquiries/${inquiryId}`);
    return { ok: true, title: "Conversation taken over", message: "The Event Assistant will not reply automatically." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to take over");
  }
}

export async function resumeInquiryAiAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const inquiryId = idSchema.parse(String(formData.get("inquiryId") ?? ""));
    const ctx = await getRequestContext();
    await resumeInquiryAi(ctx, db, inquiryId);
    revalidatePath("/app/inquiries");
    revalidatePath(`/app/inquiries/${inquiryId}`);
    return { ok: true, title: "Event Assistant resumed", message: "New customer messages can receive automatic replies." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to resume assistant");
  }
}

export async function sendEmployeeInquiryMessageAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  try {
    const parsed = z
      .object({
        inquiryId: idSchema,
        conversationId: idSchema,
        content: z.string().trim().min(1).max(2000),
      })
      .parse({
        inquiryId: String(formData.get("inquiryId") ?? ""),
        conversationId: String(formData.get("conversationId") ?? ""),
        content: String(formData.get("content") ?? ""),
      });
    const ctx = await getRequestContext();
    await addEmployeeConversationMessage(ctx, db, parsed);
    revalidatePath(`/app/inquiries/${parsed.inquiryId}`);
    return { ok: true, title: "Reply sent", message: "Your message was added to the conversation." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to send reply");
  }
}
