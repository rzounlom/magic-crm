import { z } from "zod";

import {
  INQUIRY_AUDIENCES,
  PRODUCT_KINDS,
  PRODUCT_PRICE_STRATEGIES,
  PRODUCT_QUANTITY_RULES,
  WEEKDAY_KEYS,
} from "@/types/catalog";

const weekdaySchema = z.enum(WEEKDAY_KEYS);

const priceSchema = z.object({
  strategy: z.enum(Object.values(PRODUCT_PRICE_STRATEGIES) as [string, ...string[]]),
  amountCents: z.number().int().nonnegative(),
  additionalGuestCents: z.number().int().nonnegative().optional().nullable(),
  includedGuests: z.number().int().positive().optional().nullable(),
  includedHours: z.number().int().positive().optional().nullable(),
  additionalHourCents: z.number().int().nonnegative().optional().nullable(),
  minGuests: z.number().int().positive().optional().nullable(),
  weekdayAmountCents: z.number().int().nonnegative().optional().nullable(),
  weekendAmountCents: z.number().int().nonnegative().optional().nullable(),
  daysOfWeek: z.array(weekdaySchema).optional().nullable(),
  afterHour: z.number().int().min(0).max(23).optional().nullable(),
  afterHourAmountCents: z.number().int().nonnegative().optional().nullable(),
  shoeAddOnCents: z.number().int().nonnegative().optional().nullable(),
  unitLabel: z.string().trim().max(40).optional().nullable(),
});

const requirementSchema = z.object({
  resourceTypeSlug: z.string().trim().min(1).max(80),
  quantityRule: z.enum(Object.values(PRODUCT_QUANTITY_RULES) as [string, ...string[]]),
  quantity: z.number().int().positive().optional().nullable(),
  guestsPerUnit: z.number().int().positive().optional().nullable(),
  durationMinutes: z.number().int().positive().optional().nullable(),
  exclusive: z.boolean().optional().default(false),
});

const servingSchema = z.object({
  servesMin: z.number().int().positive(),
  servesMax: z.number().int().positive(),
  unitCount: z.number().int().positive().optional().nullable(),
});

const productSchema = z.object({
  slug: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  kind: z.enum(Object.values(PRODUCT_KINDS) as [string, ...string[]]),
  audience: z.string().trim().min(1).max(24),
  categorySlug: z.string().trim().min(1).max(80),
  durationMinutes: z.number().int().positive().optional().nullable(),
  minGuests: z.number().int().positive().optional().nullable(),
  maxGuests: z.number().int().positive().optional().nullable(),
  weekendOnly: z.boolean().optional().default(false),
  fulfillmentGroup: z.string().trim().max(80).optional().nullable(),
  shortDescription: z.string().trim().max(500).optional().nullable(),
  prices: z.array(priceSchema).min(1),
  requirements: z.array(requirementSchema).optional().default([]),
  serving: servingSchema.optional().nullable(),
});

const categorySchema = z.object({
  slug: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().nonnegative(),
});

const resourceTypeSchema = z.object({
  slug: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  count: z.number().int().positive(),
  capacity: z.number().int().positive().nullable(),
  schedulingMode: z.enum(["SLOTTED", "CONTINUOUS"]),
  notes: z.string().trim().max(500).optional().nullable(),
});

const profileSchema = z.object({
  audience: z.enum(Object.values(INQUIRY_AUDIENCES) as [string, ...string[]]),
  payload: z.record(z.string(), z.unknown()),
});

const ambiguitySchema = z.object({
  code: z.string(),
  severity: z.enum(["info", "warning"]),
  message: z.string(),
});

export const bookingCatalogDatasetSchema = z.object({
  version: z.number().int().positive(),
  sourceFiles: z.array(z.string()),
  ambiguities: z.array(ambiguitySchema),
  categories: z.array(categorySchema).min(1),
  resourceTypes: z.array(resourceTypeSchema).min(1),
  products: z.array(productSchema).min(1),
  recommendationProfiles: z.array(profileSchema).min(1),
});

export type BookingCatalogDataset = z.infer<typeof bookingCatalogDatasetSchema>;

export function parseBookingCatalogDataset(value: unknown): BookingCatalogDataset {
  return bookingCatalogDatasetSchema.parse(value);
}
