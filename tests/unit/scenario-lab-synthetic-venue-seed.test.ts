import { describe, expect, it } from "vitest";

import {
  assertScenarioLabSeedEndpoint,
  SCENARIO_LAB_SEED_EXPECTED_ENDPOINT,
  SCENARIO_LAB_SEED_OFFERINGS,
  SCENARIO_LAB_SEED_ORG_SLUG,
} from "@/server/scenario-lab/synthetic-venue-constants";

describe("Scenario Lab synthetic venue seed guards", () => {
  it("accepts the dedicated Scenario Lab endpoint identity", () => {
    expect(() =>
      assertScenarioLabSeedEndpoint(
        `${SCENARIO_LAB_SEED_EXPECTED_ENDPOINT}.c-11.us-east-1.aws.neon.tech/neondb`,
      ),
    ).not.toThrow();
  });

  it("refuses DEV / unknown endpoints", () => {
    expect(() =>
      assertScenarioLabSeedEndpoint("ep-bold-art-avjy5nt4.c-11.us-east-1.aws.neon.tech/neondb"),
    ).toThrow(/Refusing seed/);
    expect(() =>
      assertScenarioLabSeedEndpoint("ep-sparkling-bird.example.neon.tech/neondb"),
    ).toThrow(/Refusing seed/);
  });

  it("defines exactly three managed TEST offerings with lab- slugs", () => {
    expect(SCENARIO_LAB_SEED_OFFERINGS).toHaveLength(3);
    expect(SCENARIO_LAB_SEED_ORG_SLUG).toBe("magiccrm-scenario-lab");
    for (const offering of SCENARIO_LAB_SEED_OFFERINGS) {
      expect(offering.productSlug.startsWith("lab-")).toBe(true);
      expect(offering.interestSlug.startsWith("lab-")).toBe(true);
      expect(offering.resourceTypeSlug.startsWith("lab-")).toBe(true);
      expect(offering.productName.includes("TEST")).toBe(true);
    }
  });
});
