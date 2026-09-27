import { z } from "zod";

import {
  BEVERAGE_PREFERENCE_VALUES,
  BUDGET_PREFERENCE_VALUES,
  budgetCentsForPreference,
  FOOD_PREFERENCE_VALUES,
  PRIVATE_SPACE_PREFERENCE_VALUES,
  spacePreferenceFromIntake,
} from "@/lib/event-planner/intake-contract";
import { normalizeUsPhoneForStorage, usPhoneDigits } from "@/lib/inquiries/public-phone";
import { isValidInvitationEmail, normalizeInvitationEmail } from "@/server/team/invitation-email";
import {
  BUDGET_BAND_CENTS,
  BUDGET_BAND_VALUES,
  EVENT_DURATION_MINUTES,
  GUEST_MIX_VALUES,
  SPACE_PREFERENCE_VALUES,
  ATTRACTION_MODE_VALUES,
} from "@/types/event-planner";
import { PUBLIC_INTAKE_LIMITS } from "@/types/inquiry";

const emptyToUndefined = (value: unknown) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
};

const optionalTrimmed = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, { error: message })
    .optional()
    .or(z.literal(""));

export const publicIntakeSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, { error: "Enter a first name." })
      .max(PUBLIC_INTAKE_LIMITS.name, { error: "First name is too long." }),
    lastName: z
      .string()
      .trim()
      .min(1, { error: "Enter a last name." })
      .max(PUBLIC_INTAKE_LIMITS.name, { error: "Last name is too long." }),
    customerGroupName: optionalTrimmed(160, "Group name is too long."),
    email: z
      .string()
      .trim()
      .max(PUBLIC_INTAKE_LIMITS.email, { error: "Email is too long." })
      .refine(isValidInvitationEmail, { error: "Enter a valid email address." }),
    phone: z
      .string()
      .optional()
      .refine((value) => isOptionalUsPhoneInput(value), {
        error: "Enter a 10-digit phone number.",
      })
      .transform((value) => normalizeUsPhoneForStorage(value) ?? ""),
    eventType: z
      .string()
      .trim()
      .min(1, { error: "Tell us what you are planning." })
      .max(PUBLIC_INTAKE_LIMITS.eventType, { error: "That description is too long." }),
    preferredDate: z.preprocess(
      emptyToUndefined,
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Choose a valid date." }),
    ),
    startTime: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, { error: "Choose a valid start time." })
        .optional(),
    ),
    guestCount: z.preprocess((value) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
      }
      return value;
    }, z
      .number({ error: "Enter a guest count greater than 0." })
      .int({ error: "Enter a whole number of guests." })
      .min(1, { error: "Enter a guest count greater than 0." })
      .max(PUBLIC_INTAKE_LIMITS.guestCount, { error: "Guest count is too large." })),
    guestMix: z.enum(GUEST_MIX_VALUES, { error: "Choose a guest mix." }),
    desiredDurationMinutes: z.preprocess(
      emptyToUndefined,
      z.coerce
        .number({ error: "Choose an event length." })
        .refine(
          (value): value is (typeof EVENT_DURATION_MINUTES)[number] =>
            (EVENT_DURATION_MINUTES as readonly number[]).includes(value),
          { error: "Choose an event length." },
        )
        .optional(),
    ),
    budgetBand: z.preprocess(emptyToUndefined, z.enum(BUDGET_BAND_VALUES).optional()),
    budgetPreference: z.preprocess(emptyToUndefined, z.enum(BUDGET_PREFERENCE_VALUES).optional()),
    eventGoal: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(80).optional()),
    diningPreference: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(80).optional()),
    foodPreference: z.preprocess(emptyToUndefined, z.enum(FOOD_PREFERENCE_VALUES).optional()),
    beveragePreference: z.preprocess(emptyToUndefined, z.enum(BEVERAGE_PREFERENCE_VALUES).optional()),
    spacePreference: z.preprocess(emptyToUndefined, z.enum(SPACE_PREFERENCE_VALUES).optional()),
    privateSpacePreference: z.preprocess(
      emptyToUndefined,
      z.enum(PRIVATE_SPACE_PREFERENCE_VALUES).optional(),
    ),
    attractionMode: z.preprocess((value) => {
      if (value == null || value === "") {
        return undefined;
      }
      return String(value).trim().toLowerCase();
    }, z.enum(ATTRACTION_MODE_VALUES).optional()),
    attractionInterestIds: z.preprocess((value) => {
      if (value == null || value === "") {
        return [];
      }
      if (Array.isArray(value)) {
        return value.map(String).filter((entry) => entry.trim().length > 0);
      }
      return [String(value)];
    }, z.array(z.string().trim().min(1).max(80)).max(40)),
    notes: optionalTrimmed(PUBLIC_INTAKE_LIMITS.notes, "Notes are too long."),
    companyWebsite: z.string().optional(),
    submissionId: z.string().trim().min(8).max(80),
  })
  .superRefine((data, ctx) => {
    if (!data.foodPreference && !data.diningPreference) {
      ctx.addIssue({
        code: "custom",
        path: ["foodPreference"],
        message: "Choose whether to include food.",
      });
    }
    if (!data.privateSpacePreference && !data.spacePreference) {
      ctx.addIssue({
        code: "custom",
        path: ["privateSpacePreference"],
        message: "Choose a space preference.",
      });
    }
    if (!data.budgetPreference && !data.budgetBand) {
      ctx.addIssue({
        code: "custom",
        path: ["budgetPreference"],
        message: "Choose a budget preference.",
      });
    }
  })
  .transform((data) => {
    const eventGoal = data.eventGoal?.trim() || data.eventType;
    const diningPreference = data.foodPreference ?? data.diningPreference ?? "";
    const spacePreference = data.privateSpacePreference
      ? spacePreferenceFromIntake(data.privateSpacePreference)
      : (data.spacePreference ?? "no_preference");
    const budget = data.budgetPreference
      ? budgetCentsForPreference(data.budgetPreference, data.guestCount)
      : data.budgetBand
        ? BUDGET_BAND_CENTS[data.budgetBand]
        : { min: null, max: null };
    return {
      ...data,
      customerGroupName: data.customerGroupName?.trim() || undefined,
      eventGoal,
      occasion: eventGoal,
      diningPreference,
      spacePreference,
      beveragePreference: data.beveragePreference ?? null,
      budgetPreference: data.budgetPreference ?? null,
      desiredDurationMinutes: data.desiredDurationMinutes ?? null,
      budgetMin: budget.min,
      budgetMax: budget.max,
    };
  });

export const publicConversationMessageSchema = z.object({
  message: z.string().trim().min(1).max(PUBLIC_INTAKE_LIMITS.message),
  submissionId: z.string().trim().min(8).max(80),
});

export const publicEventPlanSelectionSchema = z.object({
  planId: z.string().trim().min(1).max(80),
  token: z.string().trim().min(8).max(200),
});

export function isOptionalUsPhoneInput(value: string | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return true;
  }
  const withoutFormatting = trimmed.replace(/[\s().+-]/g, "");
  if (!/^\d+$/.test(withoutFormatting)) {
    return false;
  }
  return usPhoneDigits(trimmed).length === 10;
}

export function normalizePublicEmail(email: string): string {
  return normalizeInvitationEmail(email);
}

export function isHoneypotFilled(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

export function publicIntakeFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fields[key]) {
      fields[key] = issue.message;
    }
  }
  return fields;
}

export function readPublicIntakeFields(input: Record<string, unknown>) {
  const parsed = publicIntakeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, fieldErrors: publicIntakeFieldErrors(parsed.error) };
  }
  return { success: true as const, data: parsed.data };
}
