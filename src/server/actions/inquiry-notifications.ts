"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import type { InquiryAwarenessResponse } from "@/lib/inquiries/inquiry-awareness";
import { db } from "@/lib/db";
import { isAuthorizationError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import {
  getInquiryAwareness,
  markAllInquiryNotificationsSeen,
  markInquiryNotificationSeen,
} from "@/server/services/inquiry-notification-service";

const inquiryIdSchema = z.string().trim().min(1).max(80);

export async function loadInquiryAwarenessAction(): Promise<InquiryAwarenessResponse> {
  try {
    const ctx = await getRequestContext();
    const snapshot = await getInquiryAwareness(ctx, db);
    return { allowed: true, snapshot };
  } catch (error) {
    unstable_rethrow(error);
    if (isAuthorizationError(error) || isTenantContextError(error)) {
      return { allowed: false };
    }
    throw error;
  }
}

export async function markInquiryNotificationSeenAction(
  inquiryId: string,
): Promise<InquiryAwarenessResponse | null> {
  try {
    const parsedId = inquiryIdSchema.parse(inquiryId);
    const ctx = await getRequestContext();
    const snapshot = await markInquiryNotificationSeen(ctx, db, parsedId);
    return { allowed: true, snapshot };
  } catch (error) {
    unstable_rethrow(error);
    if (isAuthorizationError(error) || isTenantContextError(error)) {
      return { allowed: false };
    }
    throw error;
  }
}

export async function markAllInquiryNotificationsSeenAction(): Promise<InquiryAwarenessResponse | null> {
  try {
    const ctx = await getRequestContext();
    const snapshot = await markAllInquiryNotificationsSeen(ctx, db);
    return { allowed: true, snapshot };
  } catch (error) {
    unstable_rethrow(error);
    if (isAuthorizationError(error) || isTenantContextError(error)) {
      return { allowed: false };
    }
    throw error;
  }
}
