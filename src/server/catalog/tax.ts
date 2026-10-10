import {
  BUNDLE_TAX_TREATMENTS,
  PRODUCT_TAX_CLASSES,
  PRODUCT_TAXABILITIES,
  TAX_APPROVAL_STATUSES,
  TAX_CALCULATION_STATUSES,
  TAX_ENGINE_VERSION,
  TAX_PRICING_MODES,
  TAX_RATE_BPS_SCALE,
  TAX_ROUNDING_MODES,
  TAX_TYPES,
  TAX_VERIFICATION_STATUSES,
  type BundleTaxPolicyRule,
  type ProductTaxClassificationRule,
  type TaxCalculationInput,
  type TaxCalculationResult,
  type TaxCalculationStatus,
  type TaxLineInput,
  type TaxLineResult,
  type TaxRateScheduleRule,
} from "@/types/tax";

const UNSAFE_LOCATION_TIMEZONES = new Set(["UTC", "Etc/UTC", "GMT", "Etc/GMT"]);

/**
 * Half-up tax in integer cents from basis-point rate.
 * tax = round_half_up(base * rateBps / 10000)
 */
export function taxCentsFromBps(baseCents: number, rateBps: number): number {
  if (!Number.isInteger(baseCents) || baseCents < 0) {
    throw new Error("taxCentsFromBps requires non-negative integer base cents");
  }
  if (!Number.isInteger(rateBps) || rateBps < 0) {
    throw new Error("taxCentsFromBps requires non-negative integer rateBps");
  }
  return Math.trunc((baseCents * rateBps + TAX_RATE_BPS_SCALE / 2) / TAX_RATE_BPS_SCALE);
}

/** Identify configured component keys for an explicit classification lookup — not a tax class inference. */
export function lineComponentKey(line: TaxLineInput): string | null {
  if (/shoes$/i.test(line.name) || /\bshoe\b/i.test(line.name) || line.unitLabel === "pair") {
    return "shoes";
  }
  return null;
}

function civilDateInRange(
  taxDate: string,
  effectiveFrom: string | null,
  effectiveTo: string | null,
): boolean {
  if (effectiveFrom && taxDate < effectiveFrom) {
    return false;
  }
  if (effectiveTo && taxDate > effectiveTo) {
    return false;
  }
  return true;
}

function findClassification(
  line: TaxLineInput,
  classifications: ProductTaxClassificationRule[],
  taxDate: string,
): ProductTaxClassificationRule | null {
  const component = lineComponentKey(line);
  const componentKey = component ?? "";
  const matches = classifications.filter(
    (row) =>
      row.productId === line.productId &&
      (row.componentKey ?? "") === componentKey &&
      civilDateInRange(taxDate, row.effectiveFrom, row.effectiveTo),
  );
  if (matches.length === 0) {
    return null;
  }
  // Prefer the most recently started effective row when non-overlapping; overlaps are invalid config.
  return matches.sort((a, b) => (b.effectiveFrom ?? "").localeCompare(a.effectiveFrom ?? ""))[0] ?? null;
}

function findBundlePolicy(
  productId: string,
  policies: BundleTaxPolicyRule[],
): BundleTaxPolicyRule | null {
  return policies.find((row) => row.productId === productId) ?? null;
}

export type RateLookupResult =
  | { ok: true; rate: TaxRateScheduleRule }
  | { ok: false; status: TaxCalculationStatus; reason: string };

export function lookupApplicableRate(input: {
  rates: TaxRateScheduleRule[];
  locationId: string;
  jurisdictionCode: string;
  taxType: string;
  taxDate: string;
}): RateLookupResult {
  const candidates = input.rates.filter(
    (row) =>
      row.locationId === input.locationId &&
      row.jurisdictionCode === input.jurisdictionCode &&
      row.taxType === input.taxType &&
      row.active &&
      row.approvalStatus === TAX_APPROVAL_STATUSES.APPROVED &&
      row.verificationStatus === TAX_VERIFICATION_STATUSES.VERIFIED &&
      civilDateInRange(input.taxDate, row.effectiveFrom, row.effectiveTo),
  );
  if (candidates.length === 0) {
    return {
      ok: false,
      status: TAX_CALCULATION_STATUSES.UNRESOLVED_RATE,
      reason: `No approved verified active rate for ${input.taxType} @ ${input.jurisdictionCode} on ${input.taxDate}`,
    };
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      status: TAX_CALCULATION_STATUSES.UNRESOLVED_RATE,
      reason: `Overlapping rates for ${input.taxType} @ ${input.jurisdictionCode} on ${input.taxDate}: ${candidates
        .map((row) => row.id)
        .join(",")}`,
    };
  }
  return { ok: true, rate: candidates[0]! };
}

function resolveTaxTimeZone(profile: TaxCalculationInput["locationProfile"]): {
  timeZone: string | null;
  unresolved: string | null;
} {
  if (!profile) {
    return { timeZone: null, unresolved: "Missing location tax profile" };
  }
  if (profile.taxTimeZone && profile.taxTimeZone.trim()) {
    return { timeZone: profile.taxTimeZone, unresolved: null };
  }
  if (UNSAFE_LOCATION_TIMEZONES.has(profile.locationTimezone)) {
    return {
      timeZone: null,
      unresolved: `Location timezone ${profile.locationTimezone} is unsafe for tax effective dates; set taxTimeZone explicitly`,
    };
  }
  if (profile.locationTimezone && profile.locationTimezone.trim()) {
    return { timeZone: profile.locationTimezone, unresolved: null };
  }
  return { timeZone: null, unresolved: "No taxTimeZone or safe location timezone" };
}

function emptyResult(
  input: TaxCalculationInput,
  status: TaxCalculationStatus,
  reasons: string[],
  extras?: Pick<Partial<TaxCalculationResult>, "timeZoneUsed" | "jurisdictionCode" | "lines">,
): TaxCalculationResult {
  return {
    engineVersion: TAX_ENGINE_VERSION,
    status,
    chargeable: false,
    organizationId: input.organizationId,
    locationId: input.locationId,
    taxDate: input.taxDate,
    timeZoneUsed: extras?.timeZoneUsed ?? null,
    pricingMode: input.settings?.pricingMode ?? null,
    roundingMode: input.settings?.roundingMode ?? TAX_ROUNDING_MODES.HALF_UP_LINE,
    jurisdictionCode: extras?.jurisdictionCode ?? input.locationProfile?.jurisdictionCode ?? null,
    lines: extras?.lines ?? [],
    taxTotalCents: null,
    unresolvedReasons: reasons,
  };
}

/**
 * Pure deterministic tax calculator.
 * Does not mutate commercial totals. chargeable is true only when calculation is complete
 * AND organization collectionEnabled is true (R2C.2 keeps collection off by default).
 */
export function calculateTax(input: TaxCalculationInput): TaxCalculationResult {
  const settings = input.settings;
  if (!settings || settings.calculationEnabled !== true) {
    return emptyResult(input, TAX_CALCULATION_STATUSES.DISABLED, [
      "Tax calculation disabled for organization (calculationEnabled=false or settings absent)",
    ]);
  }

  if (!input.locationId) {
    return emptyResult(input, TAX_CALCULATION_STATUSES.UNRESOLVED_JURISDICTION, [
      "locationId is required for tax calculation",
    ]);
  }

  if (!input.taxDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.taxDate)) {
    return emptyResult(input, TAX_CALCULATION_STATUSES.UNRESOLVED_JURISDICTION, [
      "taxDate must be a venue-local civil date YYYY-MM-DD",
    ]);
  }

  const profile = input.locationProfile;
  if (!profile || profile.locationId !== input.locationId) {
    return emptyResult(input, TAX_CALCULATION_STATUSES.UNRESOLVED_JURISDICTION, [
      "Location tax profile missing or does not match locationId",
    ]);
  }

  if (!profile.jurisdictionResolved || !profile.jurisdictionCode) {
    return emptyResult(input, TAX_CALCULATION_STATUSES.UNRESOLVED_JURISDICTION, [
      "Jurisdiction not resolved for location",
    ]);
  }

  const tz = resolveTaxTimeZone(profile);
  if (tz.unresolved) {
    return emptyResult(input, TAX_CALCULATION_STATUSES.UNRESOLVED_TIMEZONE, [tz.unresolved], {
      timeZoneUsed: null,
      jurisdictionCode: profile.jurisdictionCode,
    });
  }

  if (settings.pricingMode === TAX_PRICING_MODES.TAX_INCLUSIVE) {
    // Inclusive extraction is a future policy; fail closed until explicitly implemented.
    return emptyResult(input, TAX_CALCULATION_STATUSES.UNRESOLVED_RATE, [
      "TAX_INCLUSIVE pricing mode is not implemented in R2C.2 foundation",
    ], { timeZoneUsed: tz.timeZone, jurisdictionCode: profile.jurisdictionCode });
  }

  const lines: TaxLineResult[] = [];
  const unresolvedReasons: string[] = [];
  let blockingStatus: TaxCalculationStatus | null = null;

  const markBlocking = (status: TaxCalculationStatus, reason: string) => {
    unresolvedReasons.push(reason);
    if (!blockingStatus) {
      blockingStatus = status;
    }
  };

  for (const line of input.lineItems) {
    const componentKey = lineComponentKey(line);
    const classification = findClassification(line, input.classifications, input.taxDate);

    if (line.kind === "PACKAGE" || classification?.classification === PRODUCT_TAX_CLASSES.MIXED_PACKAGE) {
      const bundle = findBundlePolicy(line.productId, input.bundlePolicies);
      if (!bundle || bundle.treatment === BUNDLE_TAX_TREATMENTS.UNRESOLVED) {
        markBlocking(
          TAX_CALCULATION_STATUSES.UNRESOLVED_BUNDLE,
          `Bundle tax treatment unresolved for product ${line.slug}`,
        );
        lines.push({
          productId: line.productId,
          slug: line.slug,
          componentKey,
          classification: classification?.classification ?? PRODUCT_TAX_CLASSES.MIXED_PACKAGE,
          taxability: null,
          taxableBaseCents: null,
          taxCents: null,
          rateScheduleId: null,
          rateBps: null,
          jurisdictionCode: profile.jurisdictionCode,
          taxType: null,
          status: TAX_CALCULATION_STATUSES.UNRESOLVED_BUNDLE,
          unresolvedReason: "Bundle policy missing or UNRESOLVED; experience grants are not allocations",
        });
        continue;
      }
      if (bundle.treatment === BUNDLE_TAX_TREATMENTS.FULLY_EXEMPT) {
        lines.push({
          productId: line.productId,
          slug: line.slug,
          componentKey,
          classification: PRODUCT_TAX_CLASSES.MIXED_PACKAGE,
          taxability: PRODUCT_TAXABILITIES.EXEMPT,
          taxableBaseCents: 0,
          taxCents: 0,
          rateScheduleId: null,
          rateBps: null,
          jurisdictionCode: profile.jurisdictionCode,
          taxType: null,
          status: TAX_CALCULATION_STATUSES.EXEMPT,
          unresolvedReason: null,
        });
        continue;
      }
      if (bundle.treatment === BUNDLE_TAX_TREATMENTS.SEPARATELY_STATED) {
        // Separately stated components must appear as their own line items with classifications.
        // A single opaque package line cannot invent allocations.
        markBlocking(
          TAX_CALCULATION_STATUSES.UNRESOLVED_BUNDLE,
          `SEPARATELY_STATED bundle ${line.slug} cannot be taxed as a single opaque line`,
        );
        lines.push({
          productId: line.productId,
          slug: line.slug,
          componentKey,
          classification: PRODUCT_TAX_CLASSES.MIXED_PACKAGE,
          taxability: PRODUCT_TAXABILITIES.UNRESOLVED,
          taxableBaseCents: null,
          taxCents: null,
          rateScheduleId: null,
          rateBps: null,
          jurisdictionCode: profile.jurisdictionCode,
          taxType: null,
          status: TAX_CALCULATION_STATUSES.UNRESOLVED_BUNDLE,
          unresolvedReason: "SEPARATELY_STATED requires component lines; no invented allocation",
        });
        continue;
      }
      if (bundle.treatment === BUNDLE_TAX_TREATMENTS.FULLY_TAXABLE) {
        const taxableBaseCents = Math.max(0, line.totalCents);
        const rateLookup = lookupApplicableRate({
          rates: input.rates,
          locationId: input.locationId,
          jurisdictionCode: profile.jurisdictionCode,
          taxType: TAX_TYPES.STATE_SALES,
          taxDate: input.taxDate,
        });
        if (!rateLookup.ok) {
          markBlocking(rateLookup.status, rateLookup.reason);
          lines.push({
            productId: line.productId,
            slug: line.slug,
            componentKey,
            classification: PRODUCT_TAX_CLASSES.MIXED_PACKAGE,
            taxability: PRODUCT_TAXABILITIES.TAXABLE,
            taxableBaseCents,
            taxCents: null,
            rateScheduleId: null,
            rateBps: null,
            jurisdictionCode: profile.jurisdictionCode,
            taxType: TAX_TYPES.STATE_SALES,
            status: rateLookup.status,
            unresolvedReason: rateLookup.reason,
          });
          continue;
        }
        const rate = rateLookup.rate;
        const lineTax = taxCentsFromBps(taxableBaseCents, rate.rateBps);
        lines.push({
          productId: line.productId,
          slug: line.slug,
          componentKey,
          classification: PRODUCT_TAX_CLASSES.MIXED_PACKAGE,
          taxability: PRODUCT_TAXABILITIES.TAXABLE,
          taxableBaseCents,
          taxCents: lineTax,
          rateScheduleId: rate.id,
          rateBps: rate.rateBps,
          jurisdictionCode: rate.jurisdictionCode,
          taxType: rate.taxType,
          status:
            rate.rateBps === 0
              ? TAX_CALCULATION_STATUSES.ZERO_RATE
              : TAX_CALCULATION_STATUSES.CALCULATED,
          unresolvedReason: null,
        });
        continue;
      }
    }

    if (!classification || classification.classification === PRODUCT_TAX_CLASSES.UNCLASSIFIED) {
      markBlocking(
        TAX_CALCULATION_STATUSES.UNRESOLVED_CLASSIFICATION,
        `Unclassified line ${line.slug}${componentKey ? `/${componentKey}` : ""}`,
      );
      lines.push({
        productId: line.productId,
        slug: line.slug,
        componentKey,
        classification: classification?.classification ?? PRODUCT_TAX_CLASSES.UNCLASSIFIED,
        taxability: classification?.taxability ?? PRODUCT_TAXABILITIES.UNRESOLVED,
        taxableBaseCents: null,
        taxCents: null,
        rateScheduleId: null,
        rateBps: null,
        jurisdictionCode: profile.jurisdictionCode,
        taxType: null,
        status: TAX_CALCULATION_STATUSES.UNRESOLVED_CLASSIFICATION,
        unresolvedReason: "Explicit product tax classification required",
      });
      continue;
    }

    if (classification.taxability === PRODUCT_TAXABILITIES.UNRESOLVED) {
      markBlocking(
        TAX_CALCULATION_STATUSES.UNRESOLVED_CLASSIFICATION,
        `Taxability unresolved for ${line.slug}`,
      );
      lines.push({
        productId: line.productId,
        slug: line.slug,
        componentKey,
        classification: classification.classification,
        taxability: PRODUCT_TAXABILITIES.UNRESOLVED,
        taxableBaseCents: null,
        taxCents: null,
        rateScheduleId: null,
        rateBps: null,
        jurisdictionCode: profile.jurisdictionCode,
        taxType: null,
        status: TAX_CALCULATION_STATUSES.UNRESOLVED_CLASSIFICATION,
        unresolvedReason: "Classification present but taxability UNRESOLVED",
      });
      continue;
    }

    if (classification.taxability === PRODUCT_TAXABILITIES.EXEMPT) {
      lines.push({
        productId: line.productId,
        slug: line.slug,
        componentKey,
        classification: classification.classification,
        taxability: PRODUCT_TAXABILITIES.EXEMPT,
        taxableBaseCents: 0,
        taxCents: 0,
        rateScheduleId: null,
        rateBps: null,
        jurisdictionCode: profile.jurisdictionCode,
        taxType: null,
        status: TAX_CALCULATION_STATUSES.EXEMPT,
        unresolvedReason: null,
      });
      continue;
    }

    // TAXABLE — post-promotion line total is the taxable base in TAX_EXCLUSIVE mode.
    const taxableBaseCents = Math.max(0, line.totalCents);
    const rateLookup = lookupApplicableRate({
      rates: input.rates,
      locationId: input.locationId,
      jurisdictionCode: profile.jurisdictionCode,
      taxType: TAX_TYPES.STATE_SALES,
      taxDate: input.taxDate,
    });
    if (!rateLookup.ok) {
      markBlocking(rateLookup.status, rateLookup.reason);
      lines.push({
        productId: line.productId,
        slug: line.slug,
        componentKey,
        classification: classification.classification,
        taxability: PRODUCT_TAXABILITIES.TAXABLE,
        taxableBaseCents,
        taxCents: null,
        rateScheduleId: null,
        rateBps: null,
        jurisdictionCode: profile.jurisdictionCode,
        taxType: TAX_TYPES.STATE_SALES,
        status: rateLookup.status,
        unresolvedReason: rateLookup.reason,
      });
      continue;
    }

    const rate = rateLookup.rate;
    const lineTax = taxCentsFromBps(taxableBaseCents, rate.rateBps);
    lines.push({
      productId: line.productId,
      slug: line.slug,
      componentKey,
      classification: classification.classification,
      taxability: PRODUCT_TAXABILITIES.TAXABLE,
      taxableBaseCents,
      taxCents: lineTax,
      rateScheduleId: rate.id,
      rateBps: rate.rateBps,
      jurisdictionCode: rate.jurisdictionCode,
      taxType: rate.taxType,
      status:
        rate.rateBps === 0
          ? TAX_CALCULATION_STATUSES.ZERO_RATE
          : TAX_CALCULATION_STATUSES.CALCULATED,
      unresolvedReason: null,
    });
  }

  if (blockingStatus) {
    return {
      engineVersion: TAX_ENGINE_VERSION,
      status: blockingStatus,
      chargeable: false,
      organizationId: input.organizationId,
      locationId: input.locationId,
      taxDate: input.taxDate,
      timeZoneUsed: tz.timeZone,
      pricingMode: settings.pricingMode,
      roundingMode: settings.roundingMode || TAX_ROUNDING_MODES.HALF_UP_LINE,
      jurisdictionCode: profile.jurisdictionCode,
      lines,
      taxTotalCents: null,
      unresolvedReasons,
    };
  }

  const taxTotalCents = lines.reduce((sum, row) => sum + (row.taxCents ?? 0), 0);
  const allExempt = lines.length > 0 && lines.every((row) => row.status === TAX_CALCULATION_STATUSES.EXEMPT);
  const allZeroRate =
    lines.length > 0 &&
    lines.every(
      (row) =>
        row.status === TAX_CALCULATION_STATUSES.ZERO_RATE ||
        row.status === TAX_CALCULATION_STATUSES.EXEMPT,
    ) &&
    lines.some((row) => row.status === TAX_CALCULATION_STATUSES.ZERO_RATE);

  const status = allExempt
    ? TAX_CALCULATION_STATUSES.EXEMPT
    : allZeroRate
      ? TAX_CALCULATION_STATUSES.ZERO_RATE
      : TAX_CALCULATION_STATUSES.CALCULATED;

  return {
    engineVersion: TAX_ENGINE_VERSION,
    status,
    chargeable: settings.collectionEnabled === true && status === TAX_CALCULATION_STATUSES.CALCULATED,
    organizationId: input.organizationId,
    locationId: input.locationId,
    taxDate: input.taxDate,
    timeZoneUsed: tz.timeZone,
    pricingMode: settings.pricingMode,
    roundingMode: settings.roundingMode || TAX_ROUNDING_MODES.HALF_UP_LINE,
    jurisdictionCode: profile.jurisdictionCode,
    lines,
    taxTotalCents,
    unresolvedReasons: [],
  };
}
