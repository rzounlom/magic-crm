/**
 * Deterministic Scenario Lab synthetic venue identifiers.
 * Slugs are TEST-only; never used as customer defaults.
 */

export const SCENARIO_LAB_SEED_EXPECTED_ENDPOINT = "ep-lucky-hall-av5j542n";

export const SCENARIO_LAB_SEED_ORG_SLUG = "magiccrm-scenario-lab";
export const SCENARIO_LAB_SEED_ORG_NAME = "MagicCRM Scenario Lab TEST";
export const SCENARIO_LAB_SEED_LOCATION_NAME = "MagicCRM Scenario Lab Center";
export const SCENARIO_LAB_SEED_TIMEZONE = "America/Chicago";
export const SCENARIO_LAB_SEED_CURRENCY = "USD";

/** Fictional contact block for docs/UI notes — Location has no address columns. */
export const SCENARIO_LAB_SEED_SYNTHETIC_CONTACT = {
  addressLine1: "100 Test Lane",
  addressLine2: "Suite LAB",
  city: "Exampleville",
  region: "TX",
  postalCode: "00000",
  phone: "+1-555-0100",
  email: "scenario-lab@example.com",
} as const;

export const SCENARIO_LAB_SEED_HOURS_NOTE =
  "Scenario Lab TEST synthetic operating hours — NOT a real venue. Safe disposable QA only.";

export const SCENARIO_LAB_SEED_RESOURCE_NOTE = "Scenario Lab TEST synthetic unit — not real inventory.";

export const SCENARIO_LAB_SEED_CATEGORY_SLUG = "lab-entertainment";

export const SCENARIO_LAB_SEED_OFFERINGS = [
  {
    productSlug: "lab-bowling",
    productName: "TEST Bowling",
    kind: "ATTRACTION" as const,
    interestSlug: "lab-bowling",
    interestLabel: "Bowling (TEST)",
    resourceTypeSlug: "lab-bowling-lane",
    resourceTypeName: "TEST Bowling Lane",
    unitPrefix: "TEST Lane",
    units: 4,
    capacity: 6,
    durationMinutes: 60,
    priceStrategy: "PER_PERSON" as const,
    amountCents: 1500,
    sortOrder: 10,
  },
  {
    productSlug: "lab-arcade",
    productName: "TEST Arcade",
    kind: "ATTRACTION" as const,
    interestSlug: "lab-arcade",
    interestLabel: "Arcade (TEST)",
    resourceTypeSlug: "lab-arcade-bay",
    resourceTypeName: "TEST Arcade Bay",
    unitPrefix: "TEST Bay",
    units: 2,
    capacity: 12,
    durationMinutes: 60,
    priceStrategy: "PER_PERSON" as const,
    amountCents: 1200,
    sortOrder: 20,
  },
  {
    productSlug: "lab-party-room",
    productName: "TEST Party Room Rental",
    kind: "RENTAL" as const,
    interestSlug: "lab-party-room",
    interestLabel: "Party room rental (TEST)",
    resourceTypeSlug: "lab-party-room",
    resourceTypeName: "TEST Party Room",
    unitPrefix: "TEST Room",
    units: 2,
    capacity: 20,
    durationMinutes: 120,
    priceStrategy: "FIXED_RENTAL" as const,
    amountCents: 25000,
    sortOrder: 30,
  },
] as const;

export type ScenarioLabSeedOffering = (typeof SCENARIO_LAB_SEED_OFFERINGS)[number];

export function assertScenarioLabSeedEndpoint(
  identity: string,
  expectedEndpoint: string = SCENARIO_LAB_SEED_EXPECTED_ENDPOINT,
): void {
  if (!identity.includes(expectedEndpoint)) {
    throw new Error(
      `[scenario-lab] Refusing seed: database identity "${identity}" is not the dedicated Scenario Lab endpoint (${expectedEndpoint}).`,
    );
  }
}
