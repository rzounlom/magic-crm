import { z } from "zod";

import type { SalesAgentToolDefinition } from "@/lib/ai/sales-agent-model";
import { HUMAN_HANDOFF_TOOL_DESCRIPTION } from "@/server/ai/handoff-policy";
import { SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";

const knowledgeType = z.enum([
  SALES_KNOWLEDGE_TYPES.ATTRACTION,
  SALES_KNOWLEDGE_TYPES.PACKAGE,
  SALES_KNOWLEDGE_TYPES.ADD_ON,
  SALES_KNOWLEDGE_TYPES.FOOD_BEVERAGE,
  SALES_KNOWLEDGE_TYPES.POLICY,
  SALES_KNOWLEDGE_TYPES.FAQ,
]);

export const searchSalesKnowledgeArgsSchema = z.object({
  query: z.string().trim().min(1).max(200),
  type: knowledgeType.optional(),
});

export const updateInquiryDetailsArgsSchema = z.object({
  eventType: z.string().trim().max(80).nullable().optional(),
  desiredDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD" })
    .nullable()
    .optional(),
  desiredStartTime: z.string().trim().max(16).nullable().optional(),
  guestCount: optionalInt(1, 500),
  childGuestCount: optionalInt(0, 500),
  adultGuestCount: optionalInt(0, 500),
  budgetMin: optionalInt(0, 1_000_000),
  budgetMax: optionalInt(0, 1_000_000),
  occasion: z.string().trim().max(120).nullable().optional(),
  customerNotes: z.string().trim().max(2000).nullable().optional(),
  internalSummary: z.string().trim().max(4000).nullable().optional(),
});

export const requestHumanHandoffArgsSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  summary: z.string().trim().min(1).max(2000),
  urgency: z.enum(["normal", "high"]).optional(),
});

export const SALES_AGENT_TOOL_DEFINITIONS: SalesAgentToolDefinition[] = [
  {
    name: "search_sales_knowledge",
    description: "Search active tenant sales knowledge. Organization is injected by the server.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        type: {
          type: "string",
          enum: Object.values(SALES_KNOWLEDGE_TYPES),
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_inquiry_details",
    description: "Read the current inquiry qualification fields for this conversation only.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    name: "update_inquiry_details",
    description: "Update approved qualification fields on the current inquiry only.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        eventType: { type: ["string", "null"] },
        desiredDate: { type: ["string", "null"] },
        desiredStartTime: { type: ["string", "null"] },
        guestCount: { type: ["integer", "null"] },
        childGuestCount: { type: ["integer", "null"] },
        adultGuestCount: { type: ["integer", "null"] },
        budgetMin: { type: ["integer", "null"] },
        budgetMax: { type: ["integer", "null"] },
        occasion: { type: ["string", "null"] },
        customerNotes: { type: ["string", "null"] },
        internalSummary: { type: ["string", "null"] },
      },
      required: [],
    },
  },
  {
    name: "request_human_handoff",
    description: HUMAN_HANDOFF_TOOL_DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        reason: { type: "string" },
        summary: { type: "string" },
        urgency: { type: "string", enum: ["normal", "high"] },
      },
      required: ["reason", "summary"],
    },
  },
];

function optionalInt(min: number, max: number) {
  return z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((value, ctx) => {
      if (value == null || value === "") {
        return value === "" ? undefined : value;
      }
      const parsed = typeof value === "number" ? value : Number(value);
      if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        ctx.addIssue({ code: "custom", message: `Expected an integer from ${min} to ${max}` });
        return z.NEVER;
      }
      return parsed;
    });
}

export const UPDATE_INQUIRY_ALLOWED_KEYS = [
  "eventType",
  "desiredDate",
  "desiredStartTime",
  "guestCount",
  "childGuestCount",
  "adultGuestCount",
  "budgetMin",
  "budgetMax",
  "occasion",
  "customerNotes",
  "internalSummary",
] as const;

export type UpdateInquiryDetailsInput = z.infer<typeof updateInquiryDetailsArgsSchema>;
