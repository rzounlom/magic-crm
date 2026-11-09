import { WP_CATALOG_VERSION } from "@/server/event-planner/wp-parity/catalog";
import type { WpPricingSource } from "@/server/event-planner/wp-parity/tenant-config";
import type {
  AttractionAnswer,
  AttractionKey,
  ItineraryRow,
  LineItem,
  RankedPlan,
  RecommendResult,
} from "@/server/event-planner/wp-parity/types";

/**
 * Staff-safe, JSON-serializable snapshot of a WP-parity recommendation, intended for
 * `ConversationMessage.metadata` / a future `EventPlanRecommendation` record.
 *
 * Contact details (name, email, phone, company) are deliberately NOT copied.
 * `pricing_source` is always recorded: `plugin_defaults` numbers come from the WordPress plugin
 * source defaults (testing baseline, NOT verified live WP admin overrides or Production catalog
 * prices); `tenant_live` numbers come from a verified tenant rule pack; `incomplete` means no
 * calculation was run because required pricing config was missing (see `missing_keys`).
 */
export const WP_PARITY_SNAPSHOT_VERSION = 1 as const;

export type WpParityPlanSnapshot = {
  name: string;
  tier: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  per_guest_cents: number;
  budget_over_cents: number;
  unpriced: boolean;
  selected_attractions: AttractionKey[];
  suggested_attractions: AttractionKey[];
  fits_duration: boolean;
  hard_review: boolean;
  duration_review: boolean;
  /** De-duplicated (PHP `array_unique`) staff review flags. */
  review: string[];
  notes: string[];
  dining_minutes: number;
  required_minutes: number;
  items: LineItem[];
  itinerary: ItineraryRow[];
  why: string | null;
  custom_package: { id: string; revision: string } | null;
};

export type WpParityDaySnapshot = {
  date: string;
  recommendation: WpParityPlanSnapshot;
  alternatives: WpParityPlanSnapshot[];
};

export type WpParityInquirySummary = {
  event_type: string;
  dates: string[];
  time: string;
  adults: number;
  children: number;
  guests: number;
  minutes: number;
  budget_cents: number | null;
  attractions: Partial<Record<AttractionKey, AttractionAnswer>>;
  food: string;
  private_room: string;
  craft: string;
};

export type WpParitySnapshot =
  | {
      snapshot_version: typeof WP_PARITY_SNAPSHOT_VERSION;
      valid: true;
      rules_version: string;
      pricing_revision: string;
      pricing_source: "plugin_defaults" | "tenant_live";
      organization_id: string | null;
      status: string;
      inquiry: WpParityInquirySummary;
      dates: WpParityDaySnapshot[];
    }
  | {
      snapshot_version: typeof WP_PARITY_SNAPSHOT_VERSION;
      valid: false;
      rules_version: string;
      pricing_revision: string | null;
      pricing_source: WpPricingSource;
      organization_id: string | null;
      errors: Record<string, string>;
      /** Present when `pricing_source` is `incomplete`: missing/invalid tenant pricing keys. */
      missing_keys?: string[];
    };

/** Pricing provenance recorded on every snapshot. Defaults to plugin defaults (tests/legacy). */
export type WpParitySnapshotContext = {
  organizationId?: string | null;
  pricingSource?: "plugin_defaults" | "tenant_live";
  rulesVersion?: string;
  pricingRevision?: string;
};

/** Snapshot for a run that was blocked because tenant pricing config was incomplete. */
export function snapshotIncompleteWpParity(input: {
  organizationId: string | null;
  missing: string[];
  rulesVersion?: string | null;
  pricingRevision?: string | null;
}): WpParitySnapshot {
  return {
    snapshot_version: WP_PARITY_SNAPSHOT_VERSION,
    valid: false,
    rules_version: input.rulesVersion ?? WP_CATALOG_VERSION,
    pricing_revision: input.pricingRevision ?? null,
    pricing_source: "incomplete",
    organization_id: input.organizationId,
    errors: {},
    missing_keys: [...input.missing],
  };
}

function snapshotPlan(plan: RankedPlan): WpParityPlanSnapshot {
  return {
    name: plan.name,
    tier: plan.tier,
    subtotal_cents: plan.subtotal_cents,
    tax_cents: plan.tax_cents,
    total_cents: plan.total_cents,
    per_guest_cents: plan.per_guest_cents,
    budget_over_cents: plan.budget_over_cents,
    unpriced: Boolean(plan.unpriced),
    selected_attractions: [...plan.selected_attractions],
    suggested_attractions: [...plan.suggested_attractions],
    fits_duration: plan.fits_duration,
    hard_review: plan.hard_review,
    duration_review: Boolean(plan.duration_review),
    review: Array.from(new Set(plan.review)),
    notes: [...plan.notes],
    dining_minutes: plan.dining_minutes,
    required_minutes: plan.required_minutes,
    items: plan.items.map((item) => ({ ...item })),
    itinerary: plan.itinerary.map((row) => ({ ...row })),
    why: plan.why ?? null,
    custom_package: plan.custom_package
      ? { id: plan.custom_package.id, revision: plan.custom_package.revision }
      : null,
  };
}

export function snapshotWpParityResult(
  result: RecommendResult,
  context: WpParitySnapshotContext = {},
): WpParitySnapshot {
  const pricingSource = context.pricingSource ?? "plugin_defaults";
  const organizationId = context.organizationId ?? null;
  if (!result.valid) {
    return {
      snapshot_version: WP_PARITY_SNAPSHOT_VERSION,
      valid: false,
      rules_version: context.rulesVersion ?? WP_CATALOG_VERSION,
      pricing_revision: context.pricingRevision ?? null,
      pricing_source: pricingSource,
      organization_id: organizationId,
      errors: { ...result.errors },
    };
  }
  const d = result.inquiry;
  return {
    snapshot_version: WP_PARITY_SNAPSHOT_VERSION,
    valid: true,
    rules_version: context.rulesVersion ?? result.rules_version,
    pricing_revision: context.pricingRevision ?? result.pricing_revision,
    pricing_source: pricingSource,
    organization_id: organizationId,
    status: result.status,
    inquiry: {
      event_type: d.event_type,
      dates: [...d.dates],
      time: d.time,
      adults: d.adults,
      children: d.children,
      guests: d.guests,
      minutes: d.minutes,
      budget_cents: d.budget,
      attractions: { ...d.attractions },
      food: d.food,
      private_room: d.private_room,
      craft: d.craft,
    },
    dates: result.dates.map((day) => ({
      date: day.date,
      recommendation: snapshotPlan(day.recommendation),
      alternatives: day.alternatives.map(snapshotPlan),
    })),
  };
}
