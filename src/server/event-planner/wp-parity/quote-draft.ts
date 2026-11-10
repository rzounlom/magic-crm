import { resolveWpExclusiveRooms } from "@/server/event-planner/wp-parity/inventory-mapping";
import type {
  AttractionKey,
  LineItem,
  WpParityPlanSnapshot,
  WpParitySnapshot,
} from "@/server/event-planner/wp-parity";
import { EVENT_PLAN_TIERS, type EventPlanDraft, type EventPlanLineItem, type EventPlanPayload } from "@/types/event-planner";

/**
 * Pure adapter: private WP-parity recommendation → editable MagiCRM EventPlan draft.
 * Amounts come from the WP snapshot (integer cents). Does not look up Neon catalog prices
 * for totals — MagiCRM SKU links are reference-only and may disagree (see discrepancies).
 */

export const WP_QUOTE_DRAFT_SOURCE = "wordpress_parity_private_calculation" as const;

export type WpCatalogPriceDiscrepancy = {
  wpKey: string;
  productSlug: string;
  wpCents: number;
  magicCatalogCents: number;
  note: string;
};

export type WpQuoteDraftStaffEdit = {
  editedAt: string;
  editedByUserProfileId: string;
  reason: string;
  /** Exact WP calculation parity no longer claimed after a staff edit. */
  wordpressParityExact: false;
};

export type WpQuoteDraftEmployeeApproval = {
  approvedAt: string;
  approvedByUserProfileId: string;
  note: string | null;
  deliveryAttempted: boolean;
  deliveryCompleted: boolean;
  deliveryBlockedCode: string | null;
  deliveryBlockedMessage: string | null;
};

export type WpQuoteDraftProvenance = {
  source: typeof WP_QUOTE_DRAFT_SOURCE;
  pricingSource: string;
  rulesVersion: string | null;
  pricingRevision: string | null;
  calculatedAt: string | null;
  planName: string;
  planDate: string;
  /** Original WordPress calculation amounts (preserved across staff edits). */
  originalSubtotalCents: number;
  originalTaxCents: number;
  originalTotalCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  warnings: string[];
  catalogPriceDiscrepancies: WpCatalogPriceDiscrepancy[];
  selectedAttractions: AttractionKey[];
  /**
   * Exclusive room / facility rentals priced into the WP plan (not preference-only).
   * Used for MagiCRM inventory soft-requirements.
   */
  exclusiveRooms: Array<"lower" | "upper" | "cove" | "mezzanine" | "full">;
  /** Room extra-hour / extension labels — pricing-only, not additional units. */
  pricingOnlyRoomAdjustments: string[];
  unpriced: boolean;
  hardReview: boolean;
  staffEdit?: WpQuoteDraftStaffEdit;
  employeeApproval?: WpQuoteDraftEmployeeApproval;
};

export type WpStaffQuoteLineEdit = {
  slug: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  kind?: string;
};

export type ApplyWpStaffQuoteEditsInput = {
  payload: EventPlanPayload;
  guestCount: number;
  eventDate: string | null;
  startTime: string | null;
  durationMinutes: number;
  lineItems: WpStaffQuoteLineEdit[];
  adjustmentNote?: string | null;
  editedByUserProfileId: string;
  editReason: string;
};

export type BuildWpStaffQuoteDraftInput = {
  organizationId: string;
  locationId?: string | null;
  snapshot: Extract<WpParitySnapshot, { valid: true }>;
  /** Which dated recommendation to convert; defaults to first date main recommendation. */
  date?: string;
  /** MagiCRM catalog cents by product slug (optional; used only to flag discrepancies). */
  magicCatalogCentsBySlug?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
};

export type BuildWpStaffQuoteDraftResult =
  | { ok: true; draft: EventPlanDraft; provenance: WpQuoteDraftProvenance }
  | { ok: false; error: string };

const ATTRACTION_PRODUCT_SLUG: Record<AttractionKey, string> = {
  bowling: "bowling-1h",
  axe: "axe-throwing-30",
  laser: "unlimited-laser-tag-90",
  golf: "wp-mini-golf",
  climbing: "climbers-cove-90",
  arcade: "unlimited-arcade-1h",
};

/** Known MagiCRM seed conflicts vs WP plugin catalog (documented; WP wins for draft totals). */
export const WP_KNOWN_CATALOG_DISCREPANCIES: readonly {
  wpKey: string;
  productSlug: string;
  wpCents: number;
  magicCatalogCents: number;
}[] = [
  { wpKey: "food.salad", productSlug: "salad-pan", wpCents: 2499, magicCatalogCents: 1999 },
  {
    wpKey: "rooms.lower_extra",
    productSlug: "lower-event-room",
    wpCents: 7500,
    magicCatalogCents: 5000,
  },
];

function slugifyLabel(label: string, index: number): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `wp-${base || "line"}-${index + 1}`;
}

function guessProductSlug(label: string): string | null {
  const text = label.toLowerCase();
  const heuristics: Array<[RegExp, string]> = [
    [/salad/, "salad-pan"],
    [/pizza|pitcher combo|combo/, "pizza-pitcher-combo"],
    [/boneless/, "boneless-wings-36"],
    [/traditional.*wing|wing.*traditional/, "traditional-wings-36"],
    [/pretzel/, "pretzel-bite-platter"],
    [/strip/, "chicken-strip-platter"],
    [/cookie/, "cookie-tray"],
    [/brownie/, "brownie-tray"],
    [/charcuterie|board/, "charcuterie-boards"],
    [/fajita/, "fajita-bar"],
    [/slider/, "slider-bar"],
    [/bbq|smokehouse/, "smokehouse-bbq"],
    [/lower.*room|lower event/, "lower-event-room"],
    [/skybox|upper/, "skybox"],
    [/mezzanine/, "mezzanine-sun-thu"],
    [/bowling/, "bowling-1h"],
    [/axe/, "axe-throwing-30"],
    [/laser/, "unlimited-laser-tag-90"],
    [/arcade/, "unlimited-arcade-1h"],
    [/climb/, "climbers-cove-90"],
  ];
  for (const [pattern, slug] of heuristics) {
    if (pattern.test(text)) {
      return slug;
    }
  }
  return null;
}

function catalogCentsLookup(
  bySlug: BuildWpStaffQuoteDraftInput["magicCatalogCentsBySlug"],
  slug: string,
): number | null {
  if (!bySlug) {
    return null;
  }
  if (bySlug instanceof Map) {
    return bySlug.get(slug) ?? null;
  }
  const value = (bySlug as Readonly<Record<string, number>>)[slug];
  return typeof value === "number" ? value : null;
}

function lineItemsFromPlan(plan: WpParityPlanSnapshot): EventPlanLineItem[] {
  const items: EventPlanLineItem[] = plan.items.map((item: LineItem, index) => {
    const mappedSlug = guessProductSlug(item.label) ?? slugifyLabel(item.label, index);
    const quantity = item.quantity > 0 ? item.quantity : 1;
    return {
      productId: "",
      slug: mappedSlug,
      name: item.label,
      kind: "WP_LINE",
      quantity,
      unitLabel: null,
      unitPriceCents: item.unit_cents,
      totalCents: item.subtotal_cents,
    };
  });
  if (plan.tax_cents > 0) {
    items.push({
      productId: "",
      slug: "wp-tax-fb",
      name: "Food & beverage tax (7%)",
      kind: "TAX",
      quantity: 1,
      unitLabel: null,
      unitPriceCents: plan.tax_cents,
      totalCents: plan.tax_cents,
    });
  }
  return items;
}

function collectDiscrepancies(
  magicCatalogCentsBySlug: BuildWpStaffQuoteDraftInput["magicCatalogCentsBySlug"],
): WpCatalogPriceDiscrepancy[] {
  return WP_KNOWN_CATALOG_DISCREPANCIES.map((known) => {
    const live = catalogCentsLookup(magicCatalogCentsBySlug, known.productSlug);
    return {
      wpKey: known.wpKey,
      productSlug: known.productSlug,
      wpCents: known.wpCents,
      magicCatalogCents: live ?? known.magicCatalogCents,
      note: "Approved WordPress baseline controls this draft; MagiCRM catalog SKU differs and was not substituted.",
    };
  });
}

function pickPlan(
  snapshot: Extract<WpParitySnapshot, { valid: true }>,
  date?: string,
): { dayDate: string; plan: WpParityPlanSnapshot } | null {
  const day = date
    ? snapshot.dates.find((entry) => entry.date === date)
    : snapshot.dates[0];
  if (!day?.recommendation) {
    return null;
  }
  return { dayDate: day.date, plan: day.recommendation };
}

function clockOrOffset(row: { start?: string; end?: string; start_minute: number; end_minute: number }): {
  startTime: string;
  endTime: string;
  startOffsetMinutes: number;
  durationMinutes: number;
} {
  return {
    startTime: row.start ?? "",
    endTime: row.end ?? "",
    startOffsetMinutes: row.start_minute,
    durationMinutes: Math.max(0, row.end_minute - row.start_minute),
  };
}

/**
 * Convert a valid WP private snapshot into an EventPlanDraft.
 * Pure — no DB writes, no notifications, no inventory holds.
 */
export function buildWpStaffQuoteDraft(
  input: BuildWpStaffQuoteDraftInput,
): BuildWpStaffQuoteDraftResult {
  const picked = pickPlan(input.snapshot, input.date);
  if (!picked) {
    return { ok: false, error: "Private calculation has no dated recommendation to convert." };
  }
  const { dayDate, plan } = picked;
  if (plan.unpriced) {
    return {
      ok: false,
      error: "Private calculation is unpriced; staff must price manually before creating a quote draft.",
    };
  }

  const lineItems = lineItemsFromPlan(plan);
  const lineSum = lineItems.reduce((sum, item) => sum + item.totalCents, 0);
  if (lineSum !== plan.total_cents) {
    return {
      ok: false,
      error: `Draft line items (${lineSum}) do not match WP total_cents (${plan.total_cents}).`,
    };
  }

  const warnings = [
    ...plan.review,
    ...plan.notes,
    ...(plan.hard_review ? ["Hard staff review flagged by WordPress calculator."] : []),
    ...(plan.duration_review || !plan.fits_duration
      ? ["Duration / schedule requires staff confirmation."]
      : []),
  ];

  const discrepancies = collectDiscrepancies(input.magicCatalogCentsBySlug);
  const roomResolution = resolveWpExclusiveRooms({
    roomIncluded: plan.room_included,
    rentalKind: plan.rental_kind,
    rentalKinds: plan.rental_kinds,
    itemLabels: plan.items.map((item) => item.label),
  });
  const provenance: WpQuoteDraftProvenance = {
    source: WP_QUOTE_DRAFT_SOURCE,
    pricingSource: input.snapshot.pricing_source,
    rulesVersion: input.snapshot.rules_version,
    pricingRevision: input.snapshot.pricing_revision,
    calculatedAt: input.snapshot.calculated_at,
    planName: plan.name,
    planDate: dayDate,
    originalSubtotalCents: plan.subtotal_cents,
    originalTaxCents: plan.tax_cents,
    originalTotalCents: plan.total_cents,
    subtotalCents: plan.subtotal_cents,
    taxCents: plan.tax_cents,
    totalCents: plan.total_cents,
    warnings,
    catalogPriceDiscrepancies: discrepancies,
    selectedAttractions: [...plan.selected_attractions],
    exclusiveRooms: roomResolution.exclusiveRooms,
    pricingOnlyRoomAdjustments: roomResolution.pricingOnlyRoomAdjustments,
    unpriced: plan.unpriced,
    hardReview: plan.hard_review,
  };

  const activities = plan.selected_attractions.map((key) => ({
    knowledgeItemId: "",
    productId: "",
    name: key.charAt(0).toUpperCase() + key.slice(1),
    quantity: input.snapshot.inquiry.guests,
    unitLabel: "guest",
    priceCents: 0,
    priceText: `Mapped attraction (${ATTRACTION_PRODUCT_SLUG[key]}) — amounts in line items`,
  }));

  const itinerary = plan.itinerary.map((row, index) => {
    const clock = clockOrOffset(row);
    return {
      id: `wp-itinerary-${index + 1}`,
      startTime: clock.startTime,
      endTime: clock.endTime,
      label: row.label,
      startOffsetMinutes: clock.startOffsetMinutes,
      durationMinutes: clock.durationMinutes,
      consumesInventory: false,
      role: (row.group.toLowerCase().includes("food") || row.group.toLowerCase().includes("dining")
        ? "DINING"
        : row.group.toLowerCase().includes("room") || row.group.toLowerCase().includes("space")
          ? "SPACE"
          : "ACTIVITY") as "DINING" | "ACTIVITY" | "SPACE",
    };
  });

  const schedule = itinerary.map((segment) => {
    if (segment.startTime && segment.endTime) {
      return `${segment.startTime}–${segment.endTime}: ${segment.label}`;
    }
    return segment.label;
  });

  const payload: EventPlanPayload & { wpQuoteDraft?: WpQuoteDraftProvenance } = {
    organizationId: input.organizationId,
    locationId: input.locationId ?? null,
    guestCount: input.snapshot.inquiry.guests,
    eventDate: dayDate,
    startTime: input.snapshot.inquiry.time,
    durationMinutes: input.snapshot.inquiry.minutes,
    activities,
    dining: {
      label: input.snapshot.inquiry.food === "yes" ? "Dining included (see line items)" : "No dining requested",
      priceCents: 0,
    },
    spaces: [],
    schedule,
    pricingComplete: true,
    catalogBacked: false,
    lineItems,
    itinerary,
    itineraryPrecise: itinerary.every((segment) => Boolean(segment.startTime && segment.endTime)),
    historicalInfluence: `WP ${provenance.pricingSource} · rules ${provenance.rulesVersion ?? "—"} · rev ${provenance.pricingRevision ?? "—"}`,
    customerAvailabilityNote:
      "Staff quote draft from private WordPress calculation. Availability not confirmed. Not sent to customer.",
    adjustmentNote: warnings.length > 0 ? warnings.join(" ") : undefined,
    depositPreviewNote:
      plan.tax_cents > 0
        ? `Includes WordPress F&B tax of $${(plan.tax_cents / 100).toFixed(2)} in line items (not MagiCRM tax engine).`
        : undefined,
    wpQuoteDraft: provenance,
  };

  const draft: EventPlanDraft = {
    tier: EVENT_PLAN_TIERS.BEST_FIT,
    title: `Staff draft — ${plan.name}`,
    sortOrder: 0,
    estimatedTotalCents: plan.total_cents,
    currency: "USD",
    guestCount: input.snapshot.inquiry.guests,
    durationMinutes: input.snapshot.inquiry.minutes,
    customerFacingReason:
      plan.why ??
      "Draft converted from private WordPress Event Planner recommendation for employee review.",
    availabilityValidated: false,
    availabilityNote: "Availability not checked. Run inventory check before holding or booking.",
    availabilityStatus: "NOT_VALIDATED",
    payload,
  };

  return { ok: true, draft, provenance };
}

export function readWpQuoteDraftProvenance(payload: unknown): WpQuoteDraftProvenance | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as { wpQuoteDraft?: unknown };
  const value = record.wpQuoteDraft;
  if (!value || typeof value !== "object") {
    return null;
  }
  const provenance = value as WpQuoteDraftProvenance;
  if (provenance.source !== WP_QUOTE_DRAFT_SOURCE) {
    return null;
  }
  // Backfill original* for drafts created before Phase 7B.
  if (typeof provenance.originalTotalCents !== "number") {
    provenance.originalSubtotalCents = provenance.subtotalCents;
    provenance.originalTaxCents = provenance.taxCents;
    provenance.originalTotalCents = provenance.totalCents;
  }
  if (!Array.isArray(provenance.exclusiveRooms)) {
    provenance.exclusiveRooms = [];
  }
  if (!Array.isArray(provenance.pricingOnlyRoomAdjustments)) {
    provenance.pricingOnlyRoomAdjustments = [];
  }
  return provenance;
}

function integerCents(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value);
}

/**
 * Apply explicit staff edits without MagiCRM catalog lookup.
 * Totals are recomputed from edited line items (integer cents).
 */
export function applyWpStaffQuoteEdits(
  input: ApplyWpStaffQuoteEditsInput,
): { ok: true; payload: EventPlanPayload; estimatedTotalCents: number } | { ok: false; error: string } {
  const provenance = readWpQuoteDraftProvenance(input.payload);
  if (!provenance) {
    return { ok: false, error: "Not a WordPress staff quote draft." };
  }
  if (input.guestCount < 1) {
    return { ok: false, error: "Guest count must be at least 1." };
  }
  if (input.durationMinutes < 30) {
    return { ok: false, error: "Duration must be at least 30 minutes." };
  }
  const reason = input.editReason.trim();
  if (reason.length < 3) {
    return { ok: false, error: "Provide a short reason for the quote edit." };
  }
  if (input.lineItems.length === 0) {
    return { ok: false, error: "Add at least one quote line item." };
  }

  const lineItems: EventPlanLineItem[] = input.lineItems.map((row, index) => {
    const quantity = Math.max(0, integerCents(row.quantity));
    const unitPriceCents = integerCents(row.unitPriceCents);
    return {
      productId: "",
      slug: row.slug.trim() || `wp-edited-${index + 1}`,
      name: row.name.trim() || `Line ${index + 1}`,
      kind: row.kind?.trim() || "WP_LINE",
      quantity: Math.max(1, quantity),
      unitLabel: null,
      unitPriceCents,
      totalCents: Math.max(1, quantity) * unitPriceCents,
    };
  });

  const taxCents = lineItems
    .filter((row) => row.kind === "TAX" || /tax/i.test(row.slug) || /tax/i.test(row.name))
    .reduce((sum, row) => sum + row.totalCents, 0);
  const totalCents = lineItems.reduce((sum, row) => sum + row.totalCents, 0);
  const subtotalCents = totalCents - taxCents;

  const nextProvenance: WpQuoteDraftProvenance = {
    ...provenance,
    planDate: input.eventDate ?? provenance.planDate,
    subtotalCents,
    taxCents,
    totalCents,
    staffEdit: {
      editedAt: new Date().toISOString(),
      editedByUserProfileId: input.editedByUserProfileId,
      reason,
      wordpressParityExact: false,
    },
    // Edits invalidate a prior approval until re-approved.
    employeeApproval: undefined,
  };

  const payload: EventPlanPayload = {
    ...input.payload,
    guestCount: input.guestCount,
    eventDate: input.eventDate,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    lineItems,
    adjustmentNote: input.adjustmentNote?.trim() || input.payload.adjustmentNote,
    customerAvailabilityNote:
      "Staff-edited quote draft from WordPress calculation. Availability not confirmed. Not sent to customer.",
    depositPreviewNote:
      taxCents > 0
        ? `Includes tax of $${(taxCents / 100).toFixed(2)} in line items (not MagiCRM tax engine).`
        : input.payload.depositPreviewNote,
    wpQuoteDraft: nextProvenance,
  };

  return { ok: true, payload, estimatedTotalCents: totalCents };
}

export const WP_APPROVED_QUOTE_MARKER = "employee_approved_wordpress_quote" as const;

export type EmployeeApprovedQuoteMarker = {
  marker: typeof WP_APPROVED_QUOTE_MARKER;
  approvedAt: string;
  /** Customer-safe availability disclaimer when inventory was not confirmed. */
  availabilityConfirmed: boolean;
  availabilityNote: string;
};

/**
 * Strip staff-only WP metadata for a customer-facing RECOMMENDATION payload.
 * Keeps integer-cent line items and event details; drops internal warnings/discrepancies.
 */
export function toCustomerFacingWpQuotePayload(input: {
  workingPayload: EventPlanPayload;
  approvedAt: string;
  availabilityConfirmed: boolean;
  availabilityNote: string;
}): EventPlanPayload {
  const { workingPayload } = input;
  return {
    organizationId: workingPayload.organizationId,
    locationId: workingPayload.locationId ?? null,
    guestCount: workingPayload.guestCount,
    eventDate: workingPayload.eventDate,
    startTime: workingPayload.startTime,
    durationMinutes: workingPayload.durationMinutes,
    activities: workingPayload.activities.map((row) => ({
      ...row,
      // Hide internal mapping notes from customers.
      priceText: undefined,
    })),
    dining: {
      label: workingPayload.dining.label,
      priceCents: workingPayload.dining.priceCents,
    },
    beverages: workingPayload.beverages,
    spaces: workingPayload.spaces.map((row) => ({
      knowledgeItemId: row.knowledgeItemId,
      name: row.name,
      priceCents: row.priceCents,
      startTime: row.startTime,
      endTime: row.endTime,
      durationMinutes: row.durationMinutes,
    })),
    schedule: workingPayload.schedule,
    pricingComplete: true,
    catalogBacked: false,
    lineItems: workingPayload.lineItems,
    itinerary: workingPayload.itinerary,
    itineraryPrecise: workingPayload.itineraryPrecise,
    resourceRequirements: workingPayload.resourceRequirements,
    depositPreviewPercent: workingPayload.depositPreviewPercent,
    depositPreviewCents: workingPayload.depositPreviewCents,
    customerAvailabilityNote: input.availabilityConfirmed
      ? undefined
      : input.availabilityNote ||
        "Final resource availability will be confirmed by our event team.",
    employeeApprovedQuote: {
      marker: WP_APPROVED_QUOTE_MARKER,
      approvedAt: input.approvedAt,
      availabilityConfirmed: input.availabilityConfirmed,
      availabilityNote: input.availabilityNote,
    },
  };
}

export function readEmployeeApprovedQuoteMarker(payload: unknown): EmployeeApprovedQuoteMarker | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const value = (payload as { employeeApprovedQuote?: unknown }).employeeApprovedQuote;
  if (!value || typeof value !== "object") {
    return null;
  }
  const marker = value as EmployeeApprovedQuoteMarker;
  if (marker.marker !== WP_APPROVED_QUOTE_MARKER) {
    return null;
  }
  return marker;
}
