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
  createSalesKnowledgeItem,
  updateSalesKnowledgeItem,
} from "@/server/services/sales-knowledge-service";
import { SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";
import type { SecurityActionResult } from "@/types/security-action";

const knowledgeSchema = z.object({
  type: z.enum([
    SALES_KNOWLEDGE_TYPES.ATTRACTION,
    SALES_KNOWLEDGE_TYPES.PACKAGE,
    SALES_KNOWLEDGE_TYPES.ADD_ON,
    SALES_KNOWLEDGE_TYPES.FOOD_BEVERAGE,
    SALES_KNOWLEDGE_TYPES.POLICY,
    SALES_KNOWLEDGE_TYPES.FAQ,
  ]),
  name: z.string().trim().min(1).max(160),
  shortDescription: z.string().trim().min(1).max(280),
  details: z.string().trim().min(1).max(4000),
  priceText: z.string().trim().max(160).optional(),
  durationMinutes: z.coerce.number().int().positive().optional(),
  minGuests: z.coerce.number().int().min(0).optional(),
  maxGuests: z.coerce.number().int().min(0).optional(),
  waiverRequired: z.string().optional(),
  active: z.string().optional(),
  salesNotes: z.string().trim().max(2000).optional(),
  customerFacingNotes: z.string().trim().max(2000).optional(),
});

function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "").trim();
  return text ? Number(text) : undefined;
}

function toInput(formData: FormData) {
  return knowledgeSchema.parse({
    type: String(formData.get("type") ?? ""),
    name: String(formData.get("name") ?? ""),
    shortDescription: String(formData.get("shortDescription") ?? ""),
    details: String(formData.get("details") ?? ""),
    priceText: String(formData.get("priceText") ?? "") || undefined,
    durationMinutes: optionalNumber(formData.get("durationMinutes")),
    minGuests: optionalNumber(formData.get("minGuests")),
    maxGuests: optionalNumber(formData.get("maxGuests")),
    waiverRequired: String(formData.get("waiverRequired") ?? ""),
    active: String(formData.get("active") ?? ""),
    salesNotes: String(formData.get("salesNotes") ?? "") || undefined,
    customerFacingNotes: String(formData.get("customerFacingNotes") ?? "") || undefined,
  });
}

function toResult(error: unknown): SecurityActionResult {
  if (isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error)) {
    return { ok: false, code: error.code, title: "Unable to save knowledge", message: error.userMessage };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, title: "Unable to save knowledge", message: "Check the form and try again." };
  }
  throw error;
}

export async function createSalesKnowledgeAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const parsed = toInput(formData);
    const ctx = await getRequestContext();
    await createSalesKnowledgeItem(ctx, db, {
      ...parsed,
      waiverRequired: parsed.waiverRequired === "on",
      active: parsed.active === "on",
    });
    revalidatePath("/app/admin/ai/knowledge");
    return {
      ok: true,
      title: "Knowledge saved",
      message: "The Event Assistant can use this item.",
      redirectTo: "/app/admin/ai/knowledge",
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error);
  }
}

export async function updateSalesKnowledgeAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const id = z.string().trim().min(1).parse(String(formData.get("id") ?? ""));
    const parsed = toInput(formData);
    const ctx = await getRequestContext();
    await updateSalesKnowledgeItem(ctx, db, id, {
      ...parsed,
      waiverRequired: parsed.waiverRequired === "on",
      active: parsed.active === "on",
    });
    revalidatePath("/app/admin/ai/knowledge");
    revalidatePath(`/app/admin/ai/knowledge/${id}`);
    return { ok: true, title: "Knowledge updated", message: "The Event Assistant will use the latest details." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error);
  }
}
