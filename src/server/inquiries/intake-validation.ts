import { z } from "zod";

import { normalizeUsPhoneForStorage, usPhoneDigits } from "@/lib/inquiries/public-phone";
import { isValidInvitationEmail, normalizeInvitationEmail } from "@/server/team/invitation-email";
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

export const publicIntakeSchema = z.object({
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
  occasion: z
    .string()
    .trim()
    .max(PUBLIC_INTAKE_LIMITS.occasion, { error: "Occasion is too long." })
    .optional()
    .or(z.literal("")),
  preferredDate: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Choose a valid date." })
      .optional(),
  ),
  startTime: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, { error: "Choose a valid start time." })
      .optional(),
  ),
  guestCount: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ error: "Enter a guest count greater than 0." })
      .int({ error: "Enter a whole number of guests." })
      .min(1, { error: "Enter a guest count greater than 0." })
      .max(PUBLIC_INTAKE_LIMITS.guestCount, { error: "Guest count is too large." })
      .optional(),
  ),
  notes: z
    .string()
    .trim()
    .max(PUBLIC_INTAKE_LIMITS.notes, { error: "Notes are too long." })
    .optional()
    .or(z.literal("")),
  companyWebsite: z.string().optional(),
  submissionId: z.string().trim().min(8).max(80),
});

export const publicConversationMessageSchema = z.object({
  message: z.string().trim().min(1).max(PUBLIC_INTAKE_LIMITS.message),
  submissionId: z.string().trim().min(8).max(80),
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
