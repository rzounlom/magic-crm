/**
 * Tenant-declared experience coverage.
 * MagicCRM compares grants to requirements. Organizations own the grants.
 * Missing grants do not become guessed inclusions.
 */

export const COVERAGE_KINDS = {
  ACTIVITY: "ACTIVITY",
  FOOD: "FOOD",
  PLAY_CREDIT: "PLAY_CREDIT",
  EQUIPMENT: "EQUIPMENT",
  SPACE: "SPACE",
} as const;

export type CoverageKind = (typeof COVERAGE_KINDS)[keyof typeof COVERAGE_KINDS];

export const PARTICIPANT_RULES = {
  ALL_GUESTS: "ALL_GUESTS",
  FIXED: "FIXED",
} as const;

export type ParticipantRule = (typeof PARTICIPANT_RULES)[keyof typeof PARTICIPANT_RULES];

export const COVERAGE_FEASIBILITY = {
  FEASIBLE: "FEASIBLE",
  REQUIRES_ROTATION_PLAN: "REQUIRES_ROTATION_PLAN",
  INFEASIBLE: "INFEASIBLE",
  NEEDS_INFORMATION: "NEEDS_INFORMATION",
} as const;

export type CoverageFeasibility = (typeof COVERAGE_FEASIBILITY)[keyof typeof COVERAGE_FEASIBILITY];

export const COVERAGE_OUTCOMES = {
  SATISFIED: "SATISFIED",
  MISSING: "MISSING",
  EXCEEDED: "EXCEEDED",
  ROTATION_REQUIRED: "ROTATION_REQUIRED",
  NEEDS_INFORMATION: "NEEDS_INFORMATION",
  COVERAGE_UNKNOWN: "COVERAGE_UNKNOWN",
} as const;

export type CoverageOutcome = (typeof COVERAGE_OUTCOMES)[keyof typeof COVERAGE_OUTCOMES];

export type ExperienceGrant = {
  organizationId: string;
  experienceKey: string;
  kind: CoverageKind;
  /** Minutes each covered participant receives. Null when the entitlement is not timed. */
  durationMinutesPerParticipant: number | null;
  sessionsPerParticipant: number | null;
  /** Absolute servings included. Null when this grant is not a food quantity. */
  servings: number | null;
  participantRule: ParticipantRule;
  fixedParticipants: number | null;
  creditCents: number | null;
  /** Guests who can receive this entitlement at the same time. */
  simultaneousGuestCapacity: number | null;
  /** Declared rotation. This phase does not build one. */
  rotationMinutesPerParticipant: number | null;
  minAge: number | null;
  minWeightLbs: number | null;
  requiresParticipantBreakdown: boolean;
  /** Customer may decline this benefit without making the package ineligible. */
  optionalBenefit?: boolean;
};

export const FOOD_INCLUSIONS = {
  NONE: "NONE",
  UNKNOWN: "UNKNOWN",
} as const;

export type FoodInclusion = (typeof FOOD_INCLUSIONS)[keyof typeof FOOD_INCLUSIONS];

export const PACKAGE_INTAKE_ELIGIBILITY = {
  ELIGIBLE: "ELIGIBLE",
  INELIGIBLE: "INELIGIBLE",
  NEEDS_INFORMATION: "NEEDS_INFORMATION",
} as const;

export type PackageIntakeEligibility =
  (typeof PACKAGE_INTAKE_ELIGIBILITY)[keyof typeof PACKAGE_INTAKE_ELIGIBILITY];

/**
 * Respect explicit No Food without inventing package contents.
 * FOOD grants are inseparable unless marked optionalBenefit.
 * Packages with no FOOD grant stay UNKNOWN unless foodInclusion is NONE.
 */
export function assessPackageDiningEligibility(input: {
  productKind: string;
  diningPreference: string | null | undefined;
  experienceGrants: ExperienceGrant[];
  foodInclusion?: FoodInclusion | null;
}): PackageIntakeEligibility {
  if (input.diningPreference !== "none") {
    return PACKAGE_INTAKE_ELIGIBILITY.ELIGIBLE;
  }
  if (input.productKind !== "PACKAGE") {
    return PACKAGE_INTAKE_ELIGIBILITY.ELIGIBLE;
  }
  if (input.foodInclusion === FOOD_INCLUSIONS.NONE) {
    return PACKAGE_INTAKE_ELIGIBILITY.ELIGIBLE;
  }
  const foodGrants = input.experienceGrants.filter((grant) => grant.kind === COVERAGE_KINDS.FOOD);
  if (foodGrants.length === 0) {
    return PACKAGE_INTAKE_ELIGIBILITY.NEEDS_INFORMATION;
  }
  if (foodGrants.every((grant) => grant.optionalBenefit === true)) {
    return PACKAGE_INTAKE_ELIGIBILITY.ELIGIBLE;
  }
  return PACKAGE_INTAKE_ELIGIBILITY.INELIGIBLE;
}

export function coverageEntitlementsFromGrants(grants: ExperienceGrant[]): Array<{
  experienceKey: string;
  kind: CoverageKind;
  durationMinutesPerParticipant: number | null;
  sessionsPerParticipant: number | null;
}> {
  return grants.map((grant) => ({
    experienceKey: grant.experienceKey,
    kind: grant.kind,
    durationMinutesPerParticipant: grant.durationMinutesPerParticipant,
    sessionsPerParticipant: grant.sessionsPerParticipant,
  }));
}

export type ExperienceRequirement = {
  experienceKey: string;
  kind: CoverageKind;
  mandatory: boolean;
  durationMinutesPerParticipant: number | null;
  sessionsPerParticipant: number | null;
  servings: number | null;
  creditCents: number | null;
  guestCount: number;
};

export type RequirementAssessment = {
  experienceKey: string;
  kind: CoverageKind;
  mandatory: boolean;
  outcome: CoverageOutcome;
};

export type CoverageComparison = {
  /** False when no grant was declared. Existing proposals keep working. */
  declared: boolean;
  eligibleForPriceComparison: boolean;
  blocksProposal: boolean;
  requirements: RequirementAssessment[];
  exceededKeys: string[];
  missingKeys: string[];
};

export type ActivityMinimum = {
  durationMinutes?: number;
  sessions?: number;
};

const BLOCKING_OUTCOMES = new Set<CoverageOutcome>([
  COVERAGE_OUTCOMES.MISSING,
  COVERAGE_OUTCOMES.ROTATION_REQUIRED,
  COVERAGE_OUTCOMES.NEEDS_INFORMATION,
]);

export function profileRequiresExplicitAttractions(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  return (payload as { requireExplicitAttractions?: unknown }).requireExplicitAttractions === true;
}

export function explicitAttractionSelectionMissing(input: {
  requireExplicitAttractions: boolean;
  attractionCount: number;
}): boolean {
  return input.requireExplicitAttractions && input.attractionCount === 0;
}

export function grantsForOrganization(grants: ExperienceGrant[], organizationId: string): ExperienceGrant[] {
  return grants.filter((grant) => grant.organizationId === organizationId);
}

export function unitsRequired(guestCount: number, guestsPerUnit: number): number {
  if (guestCount <= 0 || guestsPerUnit <= 0) {
    return 0;
  }
  return Math.ceil(guestCount / guestsPerUnit);
}

export function simultaneousGuestCapacity(availableUnits: number, guestsPerUnit: number): number {
  if (availableUnits <= 0 || guestsPerUnit <= 0) {
    return 0;
  }
  return availableUnits * guestsPerUnit;
}

export type HostingRow = {
  productId: string;
  quantityRule: string;
  guestsPerUnit: number | null;
  activeCount: number;
  inventoryConfigured: boolean;
  durationMinutes: number | null;
  rotationMinutesPerParticipant?: number | null;
};

/**
 * A group larger than simultaneous capacity needs a declared rotation.
 * This does not invent a rotation schedule or shorten the session.
 */
export function assessSimultaneousHosting(input: {
  guestCount: number;
  productIds: string[];
  rows: HostingRow[];
}): {
  feasibility: CoverageFeasibility;
  rotationRequired: boolean;
  note: string | null;
  simultaneousGuestCapacity: number | null;
} {
  const wanted = new Set(input.productIds);
  let tightest: number | null = null;
  for (const row of input.rows) {
    if (!wanted.has(row.productId)) {
      continue;
    }
    if (row.quantityRule !== "PER_GUESTS" || !row.inventoryConfigured) {
      continue;
    }
    if (!row.guestsPerUnit || row.guestsPerUnit <= 0 || row.activeCount <= 0) {
      continue;
    }
    const capacity = simultaneousGuestCapacity(row.activeCount, row.guestsPerUnit);
    const needed = unitsRequired(input.guestCount, row.guestsPerUnit);
    if (needed <= row.activeCount) {
      continue;
    }
    const rotation = row.rotationMinutesPerParticipant ?? null;
    const advertised = row.durationMinutes ?? 0;
    if (rotation != null && advertised > 0 && rotation >= advertised) {
      continue;
    }
    tightest = tightest == null ? capacity : Math.min(tightest, capacity);
  }
  if (tightest == null) {
    return {
      feasibility: COVERAGE_FEASIBILITY.FEASIBLE,
      rotationRequired: false,
      note: null,
      simultaneousGuestCapacity: null,
    };
  }
  return {
    feasibility: COVERAGE_FEASIBILITY.REQUIRES_ROTATION_PLAN,
    rotationRequired: true,
    simultaneousGuestCapacity: tightest,
    note: `This option can host ${tightest} guests at the same time. A rotation plan is required before it can be booked.`,
  };
}

export function resolveCoverageFeasibility(input: {
  hosting: CoverageFeasibility;
  comparison: CoverageComparison;
  minimumMissed: boolean;
}): CoverageFeasibility {
  if (input.comparison.requirements.some((row) => row.mandatory && row.outcome === COVERAGE_OUTCOMES.NEEDS_INFORMATION)) {
    return COVERAGE_FEASIBILITY.NEEDS_INFORMATION;
  }
  if (
    input.minimumMissed ||
    input.comparison.requirements.some((row) => row.mandatory && row.outcome === COVERAGE_OUTCOMES.MISSING)
  ) {
    return COVERAGE_FEASIBILITY.INFEASIBLE;
  }
  if (input.hosting === COVERAGE_FEASIBILITY.REQUIRES_ROTATION_PLAN) {
    return COVERAGE_FEASIBILITY.REQUIRES_ROTATION_PLAN;
  }
  return COVERAGE_FEASIBILITY.FEASIBLE;
}

function sameExperience(grant: ExperienceGrant, requirement: ExperienceRequirement): boolean {
  return grant.experienceKey === requirement.experienceKey && grant.kind === requirement.kind;
}

function sum(values: Array<number | null>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function requirementDeclared(requirement: ExperienceRequirement): boolean {
  return (
    requirement.durationMinutesPerParticipant != null ||
    requirement.sessionsPerParticipant != null ||
    requirement.servings != null ||
    requirement.creditCents != null
  );
}

export function compareCoverage(input: {
  organizationId: string;
  requirements: ExperienceRequirement[];
  grants: ExperienceGrant[];
  /** True only when the inquiry already has the age or weight counts a grant asks for. */
  participantFactsKnown?: boolean;
}): CoverageComparison {
  const grants = grantsForOrganization(input.grants, input.organizationId);
  const declared = grants.length > 0;
  const requirements = input.requirements.map((requirement) => {
    const matching = grants.filter((grant) => sameExperience(grant, requirement));
    if (!declared || matching.length === 0) {
      return {
        experienceKey: requirement.experienceKey,
        kind: requirement.kind,
        mandatory: requirement.mandatory,
        outcome: COVERAGE_OUTCOMES.COVERAGE_UNKNOWN,
      };
    }
    const restricted = matching.some(
      (grant) => grant.requiresParticipantBreakdown || grant.minAge != null || grant.minWeightLbs != null,
    );
    if (restricted && input.participantFactsKnown !== true) {
      return {
        experienceKey: requirement.experienceKey,
        kind: requirement.kind,
        mandatory: requirement.mandatory,
        outcome: COVERAGE_OUTCOMES.NEEDS_INFORMATION,
      };
    }
    const outcome = outcomeFor(requirement, matching);
    return {
      experienceKey: requirement.experienceKey,
      kind: requirement.kind,
      mandatory: requirement.mandatory,
      outcome,
    };
  });
  const mandatory = requirements.filter((row) => row.mandatory);
  const missingKeys = mandatory
    .filter((row) => row.outcome === COVERAGE_OUTCOMES.MISSING || row.outcome === COVERAGE_OUTCOMES.COVERAGE_UNKNOWN)
    .map((row) => row.experienceKey);
  const exceededKeys = requirements
    .filter((row) => row.outcome === COVERAGE_OUTCOMES.EXCEEDED)
    .map((row) => row.experienceKey);
  const blocking = mandatory.some((row) => BLOCKING_OUTCOMES.has(row.outcome));
  const eligible =
    declared &&
    mandatory.length > 0 &&
    mandatory.every(
      (row) => row.outcome === COVERAGE_OUTCOMES.SATISFIED || row.outcome === COVERAGE_OUTCOMES.EXCEEDED,
    );
  return {
    declared,
    eligibleForPriceComparison: eligible,
    blocksProposal: declared && blocking,
    requirements,
    exceededKeys,
    missingKeys: declared ? missingKeys : [],
  };
}

function outcomeFor(requirement: ExperienceRequirement, grants: ExperienceGrant[]): CoverageOutcome {
  const duration = maxPresent(grants.map((grant) => grant.durationMinutesPerParticipant));
  const sessions = sum(grants.map((grant) => grant.sessionsPerParticipant));
  const servings = sum(grants.map((grant) => grant.servings));
  const credit = sum(grants.map((grant) => grant.creditCents));
  const guestCount = requirement.guestCount;
  const rotationShortfall = grants.some((grant) => {
    const capacity = grant.simultaneousGuestCapacity;
    if (capacity == null || guestCount <= capacity) {
      return false;
    }
    const rotation = grant.rotationMinutesPerParticipant;
    const advertised = grant.durationMinutesPerParticipant ?? requirement.durationMinutesPerParticipant ?? 0;
    return rotation == null || (advertised > 0 && rotation < advertised);
  });
  if (rotationShortfall) {
    return COVERAGE_OUTCOMES.ROTATION_REQUIRED;
  }

  const durationRequired = requirement.durationMinutesPerParticipant;
  const sessionsRequired = requirement.sessionsPerParticipant;
  const servingsRequired = requirement.servings;
  const creditRequired = requirement.creditCents;

  if (durationRequired != null && sessionsRequired == null && duration == null && sessions > 0) {
    return COVERAGE_OUTCOMES.MISSING;
  }
  if (sessionsRequired != null && durationRequired == null && sessions === 0 && duration != null) {
    return COVERAGE_OUTCOMES.MISSING;
  }

  const durationOk = durationRequired == null || (duration != null && duration >= durationRequired);
  const sessionsOk = sessionsRequired == null || sessions >= sessionsRequired;
  const servingsOk = servingsRequired == null || servings >= servingsRequired;
  const creditOk = creditRequired == null || credit >= creditRequired;
  if (!durationOk || !sessionsOk || !servingsOk || !creditOk) {
    return COVERAGE_OUTCOMES.MISSING;
  }
  if (!requirementDeclared(requirement)) {
    return COVERAGE_OUTCOMES.SATISFIED;
  }
  const exceeded =
    (durationRequired != null && duration != null && duration > durationRequired) ||
    (sessionsRequired != null && sessions > sessionsRequired) ||
    (servingsRequired != null && servings > servingsRequired) ||
    (creditRequired != null && credit > creditRequired);
  return exceeded ? COVERAGE_OUTCOMES.EXCEEDED : COVERAGE_OUTCOMES.SATISFIED;
}

function maxPresent(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null);
  if (present.length === 0) {
    return null;
  }
  return Math.max(...present);
}

export function assessEligibility(input: {
  minAge: number | null;
  minWeightLbs: number | null;
  requiresParticipantBreakdown: boolean;
  eligibleParticipantCount: number | null;
  guestCount: number;
}): { outcome: "SATISFIED" | "NEEDS_INFORMATION" | "INELIGIBLE" } {
  const restricted = input.minAge != null || input.minWeightLbs != null || input.requiresParticipantBreakdown;
  if (!restricted) {
    return { outcome: "SATISFIED" };
  }
  if (input.eligibleParticipantCount == null) {
    return { outcome: "NEEDS_INFORMATION" };
  }
  if (input.eligibleParticipantCount <= 0) {
    return { outcome: "INELIGIBLE" };
  }
  return { outcome: "SATISFIED" };
}

export function uncoveredFoodServings(input: { requiredServings: number; includedServings: number }): number {
  return Math.max(0, input.requiredServings - input.includedServings);
}

export type InclusionProduct = {
  id: string;
  kind: string;
  experienceGrants?: ExperienceGrant[] | null;
};

/**
 * Drops a product only when a package grant fully covers that product's declared grant.
 * Products without grants stay, so undeclared inclusions are not assumed.
 * A food product whose key is partly covered is priced for the uncovered guests only.
 */
export function applyPackageInclusions<T extends InclusionProduct>(input: {
  products: T[];
  guestCount: number;
}): { products: T[]; guestCountByProductId: Record<string, number>; omittedProductIds: string[] } {
  const packageGrants = input.products
    .filter((product) => product.kind === "PACKAGE")
    .flatMap((product) => product.experienceGrants ?? []);
  if (packageGrants.length === 0) {
    return { products: input.products, guestCountByProductId: {}, omittedProductIds: [] };
  }
  const foodRemaining = new Map<string, number>();
  const consumedFood = new Set<string>();
  for (const grant of packageGrants) {
    if (grant.kind !== COVERAGE_KINDS.FOOD || (grant.participantRule === PARTICIPANT_RULES.FIXED && (grant.fixedParticipants ?? 0) < input.guestCount)) {
      continue;
    }
    foodRemaining.set(grant.experienceKey, (foodRemaining.get(grant.experienceKey) ?? 0) + (grant.servings ?? 0));
  }
  const omittedProductIds: string[] = [];
  const guestCountByProductId: Record<string, number> = {};
  const products = input.products.filter((product) => {
    if (product.kind === "PACKAGE") {
      return true;
    }
    const grants = product.experienceGrants ?? [];
    if (grants.length === 0) {
      return true;
    }
    const food = grants.find((grant) => grant.kind === COVERAGE_KINDS.FOOD);
    const others = grants.filter((grant) => grant.kind !== COVERAGE_KINDS.FOOD);
    const othersCovered =
      others.length === 0 ||
      others.every((grant) =>
        packageGrants.some(
          (included) =>
            included.experienceKey === grant.experienceKey &&
            included.kind === grant.kind &&
            coversGrant(included, grant, input.guestCount),
        ),
      );
    if (food && othersCovered) {
      const included = foodRemaining.get(food.experienceKey) ?? 0;
      if (included <= 0) {
        if (consumedFood.has(food.experienceKey) && others.length === 0) {
          omittedProductIds.push(product.id);
          return false;
        }
        return true;
      }
      const uncovered = uncoveredFoodServings({
        requiredServings: input.guestCount,
        includedServings: included,
      });
      foodRemaining.set(food.experienceKey, 0);
      consumedFood.add(food.experienceKey);
      if (uncovered === 0 && othersCovered) {
        omittedProductIds.push(product.id);
        return false;
      }
      if (others.length === 0) {
        guestCountByProductId[product.id] = uncovered;
      }
      return true;
    }
    if (others.length > 0 && othersCovered && !food) {
      omittedProductIds.push(product.id);
      return false;
    }
    return true;
  });
  return { products, guestCountByProductId, omittedProductIds };
}

function coversGrant(included: ExperienceGrant, productGrant: ExperienceGrant, guestCount: number): boolean {
  if (included.participantRule === PARTICIPANT_RULES.FIXED && (included.fixedParticipants ?? 0) < guestCount) {
    return false;
  }
  const durationOk =
    productGrant.durationMinutesPerParticipant == null ||
    (included.durationMinutesPerParticipant != null &&
      included.durationMinutesPerParticipant >= productGrant.durationMinutesPerParticipant);
  const sessionsOk =
    productGrant.sessionsPerParticipant == null ||
    (included.sessionsPerParticipant != null &&
      included.sessionsPerParticipant >= productGrant.sessionsPerParticipant);
  const creditOk =
    productGrant.creditCents == null ||
    (included.creditCents != null && included.creditCents >= productGrant.creditCents);
  return durationOk && sessionsOk && creditOk;
}

export type PricedCoverageCandidate = {
  id: string;
  totalCents: number;
  organizationId: string;
  grants: ExperienceGrant[];
};

/**
 * Price-compares only candidates that meet the same mandatory coverage.
 * A cheaper partial candidate is not a winner.
 * This does not collapse Good / Recommended / Premium into one cheapest option.
 */
export function rankEquivalentExperiences(input: {
  organizationId: string;
  requirements: ExperienceRequirement[];
  candidates: PricedCoverageCandidate[];
}): {
  eligibleIds: string[];
  rejectedIds: string[];
  winnerId: string | null;
  infeasible: boolean;
} {
  const eligible: PricedCoverageCandidate[] = [];
  const rejectedIds: string[] = [];
  for (const candidate of input.candidates) {
    if (candidate.organizationId !== input.organizationId) {
      rejectedIds.push(candidate.id);
      continue;
    }
    const comparison = compareCoverage({
      organizationId: input.organizationId,
      requirements: input.requirements,
      grants: candidate.grants,
    });
    if (comparison.eligibleForPriceComparison) {
      eligible.push(candidate);
    } else {
      rejectedIds.push(candidate.id);
    }
  }
  eligible.sort((left, right) => left.totalCents - right.totalCents);
  return {
    eligibleIds: eligible.map((row) => row.id),
    rejectedIds,
    winnerId: eligible[0]?.id ?? null,
    infeasible: eligible.length === 0,
  };
}

export function coverageRequirementsFromSelection(input: {
  guestCount: number;
  selections: Array<{ interestSlug: string }>;
  minimums?: Record<string, ActivityMinimum>;
}): ExperienceRequirement[] {
  return input.selections.map((selection) => {
    const minimum = input.minimums?.[selection.interestSlug];
    return {
      experienceKey: selection.interestSlug,
      kind: COVERAGE_KINDS.ACTIVITY,
      mandatory: true,
      durationMinutesPerParticipant: minimum?.durationMinutes ?? null,
      sessionsPerParticipant: minimum?.sessions ?? null,
      servings: null,
      creditCents: null,
      guestCount: input.guestCount,
    };
  });
}

export function productMeetsActivityMinimum(input: {
  durationMinutes: number | null;
  sessions: number | null;
  minimum: ActivityMinimum | undefined;
}): boolean {
  if (!input.minimum) {
    return true;
  }
  if (input.minimum.durationMinutes != null) {
    if (input.durationMinutes == null || input.durationMinutes < input.minimum.durationMinutes) {
      return false;
    }
  }
  if (input.minimum.sessions != null) {
    if (input.sessions == null || input.sessions < input.minimum.sessions) {
      return false;
    }
  }
  return true;
}

export function storedProposalTotalCents(payload: {
  lineItems?: Array<{ totalCents: number }> | null;
}): number {
  return (payload.lineItems ?? []).reduce((sum, row) => sum + row.totalCents, 0);
}
