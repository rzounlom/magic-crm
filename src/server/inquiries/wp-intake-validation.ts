import { z } from "zod";

import {
  WP_ATTRACTION_KEYS,
  WP_DURATION_OPTIONS,
  WP_EVENT_TYPES,
  WP_INTAKE_LIMITS,
  WP_YES_NO,
  durationMinutesFromWp,
  type WpAttractionAnswers,
  type WpIntakeAnswers,
} from "@/lib/event-planner/wp-intake-contract";
import { normalizeUsPhoneForStorage, usPhoneDigits } from "@/lib/inquiries/public-phone";
import { isHoneypotFilled, normalizePublicEmail } from "@/server/inquiries/intake-validation";
import { isValidInvitationEmail } from "@/server/team/invitation-email";

const emptyToUndefined = (value: unknown) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Choose a valid date." });

const attractionAnswer = z.enum(["yes", "no", "open"], {
  error: "Choose Yes, No, or Open to recommendations.",
});

function coerceNonNegInt(max: number, message: string) {
  return z.preprocess((value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
    }
    return value;
  }, z.number({ error: message }).int({ error: message }).min(0, { error: message }).max(max, { error: message }));
}

export const wpPublicIntakeSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, { error: "Enter a first name." })
      .max(WP_INTAKE_LIMITS.name, { error: "First name is too long." }),
    lastName: z
      .string()
      .trim()
      .min(1, { error: "Enter a last name." })
      .max(WP_INTAKE_LIMITS.name, { error: "Last name is too long." }),
    company: z
      .string()
      .trim()
      .min(1, { error: "Enter a business or organization." })
      .max(WP_INTAKE_LIMITS.company, { error: "Company name is too long." }),
    phone: z
      .string()
      .trim()
      .min(1, { error: "Enter a phone number." })
      .refine((value) => usPhoneDigits(value).length === 10, {
        error: "Enter a 10-digit phone number.",
      })
      .transform((value) => normalizeUsPhoneForStorage(value) ?? ""),
    email: z
      .string()
      .trim()
      .max(WP_INTAKE_LIMITS.email, { error: "Email is too long." })
      .refine(isValidInvitationEmail, { error: "Enter a valid email address." }),
    eventType: z.enum(WP_EVENT_TYPES, { error: "Choose an event type." }),
    dates: z.preprocess((value) => {
      if (value == null || value === "") {
        return [];
      }
      if (Array.isArray(value)) {
        return value.map(String).map((entry) => entry.trim()).filter(Boolean);
      }
      return [String(value).trim()].filter(Boolean);
    }, z.array(isoDate).min(1, { error: "Choose at least one preferred date." }).max(WP_INTAKE_LIMITS.dates, {
      error: "You can add up to five dates.",
    })),
    time: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, { error: "Choose a valid start time." })
      .transform((value) => value.slice(0, 5)),
    adults: coerceNonNegInt(WP_INTAKE_LIMITS.adults, "Enter the number of adults."),
    children: coerceNonNegInt(WP_INTAKE_LIMITS.children, "Enter the number of children."),
    duration: z.enum(WP_DURATION_OPTIONS, { error: "Choose an event duration." }),
    otherHours: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
    attractions: z.object({
      bowling: attractionAnswer,
      axe: attractionAnswer,
      laser: attractionAnswer,
      golf: attractionAnswer,
      climbing: attractionAnswer,
      arcade: attractionAnswer,
    }),
    food: z.enum(WP_YES_NO, { error: "Choose Yes or No for food." }),
    privateRoom: z.enum(WP_YES_NO, { error: "Choose Yes or No for a private room." }),
    craft: z.enum(WP_YES_NO, { error: "Choose Yes or No for craft beverages." }),
    hasBudget: z.enum(WP_YES_NO, { error: "Choose Yes or No for budget." }),
    budget: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
    description: z
      .string()
      .trim()
      .min(1, { error: "Describe your event." })
      .max(WP_INTAKE_LIMITS.description, { error: "That description is too long." }),
    comments: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .max(WP_INTAKE_LIMITS.comments, { error: "Comments are too long." })
        .optional(),
    ),
    referral: z
      .string()
      .trim()
      .min(1, { error: "Tell us how you heard about us." })
      .max(WP_INTAKE_LIMITS.referral, { error: "That answer is too long." }),
    companyWebsite: z.string().optional(),
    submissionId: z.string().trim().min(8).max(80),
  })
  .superRefine((data, ctx) => {
    const guests = data.adults + data.children;
    if (guests < WP_INTAKE_LIMITS.guestsCombinedMin || guests > WP_INTAKE_LIMITS.guestsCombinedMax) {
      ctx.addIssue({
        code: "custom",
        path: ["adults"],
        message: "Enter a combined guest count between 1 and 999.",
      });
    }
    if (data.duration === "Other") {
      if (
        data.otherHours == null ||
        !Number.isFinite(data.otherHours) ||
        data.otherHours <= 0 ||
        data.otherHours > WP_INTAKE_LIMITS.otherHoursMax
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["otherHours"],
          message: "Enter the desired duration in hours, up to 24.",
        });
      }
    }
    if (data.hasBudget === "yes") {
      if (
        data.budget == null ||
        !Number.isFinite(data.budget) ||
        data.budget <= 0 ||
        data.budget > WP_INTAKE_LIMITS.budgetMaxDollars
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["budget"],
          message: "Enter a positive total event budget.",
        });
      }
    }
    for (const key of WP_ATTRACTION_KEYS) {
      if (!data.attractions[key]) {
        ctx.addIssue({
          code: "custom",
          path: ["attractions", key],
          message: `Choose an answer for ${key}.`,
        });
      }
    }
  })
  .transform((data): WpIntakeAnswers & { companyWebsite?: string; submissionId: string; emailNormalized: string } => {
    const otherHours = data.duration === "Other" ? Number(data.otherHours) : null;
    const minutes = durationMinutesFromWp(data.duration, otherHours);
    const budgetCents =
      data.hasBudget === "yes" && data.budget != null ? Math.round(Number(data.budget) * 100) : null;
    const attractions = data.attractions as WpAttractionAnswers;
    return {
      firstName: data.firstName,
      lastName: data.lastName,
      company: data.company,
      phone: data.phone,
      email: data.email.trim(),
      emailNormalized: normalizePublicEmail(data.email),
      eventType: data.eventType,
      dates: data.dates,
      time: data.time,
      adults: data.adults,
      children: data.children,
      duration: data.duration,
      otherHours,
      minutes,
      attractions,
      food: data.food,
      privateRoom: data.privateRoom,
      craft: data.craft,
      hasBudget: data.hasBudget,
      budgetCents,
      description: data.description,
      comments: data.comments?.trim() || null,
      referral: data.referral,
      companyWebsite: data.companyWebsite,
      submissionId: data.submissionId,
    };
  });

export type ParsedWpPublicIntake = z.infer<typeof wpPublicIntakeSchema>;

export function wpPublicIntakeFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 1 ? issue.path.join(".") : String(issue.path[0] ?? "");
    if (key && !fields[key]) {
      fields[key] = issue.message;
    }
  }
  return fields;
}

export function readWpPublicIntakeFields(input: Record<string, unknown>) {
  const parsed = wpPublicIntakeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, fieldErrors: wpPublicIntakeFieldErrors(parsed.error) };
  }
  if (isHoneypotFilled(parsed.data.companyWebsite)) {
    return {
      success: false as const,
      fieldErrors: { companyWebsite: "Unable to submit this form." },
    };
  }
  return { success: true as const, data: parsed.data };
}

export function readWpPublicIntakeFromFormData(formData: FormData) {
  const attractions: Record<string, string> = {};
  for (const key of WP_ATTRACTION_KEYS) {
    attractions[key] = String(formData.get(`attractions[${key}]`) ?? formData.get(`attractions.${key}`) ?? "");
  }
  return readWpPublicIntakeFields({
    firstName: String(formData.get("firstName") ?? formData.get("first_name") ?? ""),
    lastName: String(formData.get("lastName") ?? formData.get("last_name") ?? ""),
    company: String(formData.get("company") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    eventType: String(formData.get("eventType") ?? formData.get("event_type") ?? ""),
    dates: formData.getAll("dates[]").length
      ? formData.getAll("dates[]").map(String)
      : formData.getAll("dates").map(String),
    time: String(formData.get("time") ?? ""),
    adults: String(formData.get("adults") ?? ""),
    children: String(formData.get("children") ?? ""),
    duration: String(formData.get("duration") ?? ""),
    otherHours: String(formData.get("otherHours") ?? formData.get("other_hours") ?? ""),
    attractions,
    food: String(formData.get("food") ?? ""),
    privateRoom: String(formData.get("privateRoom") ?? formData.get("private_room") ?? ""),
    craft: String(formData.get("craft") ?? ""),
    hasBudget: String(formData.get("hasBudget") ?? formData.get("has_budget") ?? ""),
    budget: String(formData.get("budget") ?? ""),
    description: String(formData.get("description") ?? ""),
    comments: String(formData.get("comments") ?? ""),
    referral: String(formData.get("referral") ?? ""),
    companyWebsite: String(formData.get("companyWebsite") ?? formData.get("website") ?? ""),
    submissionId: String(formData.get("submissionId") ?? ""),
  });
}
