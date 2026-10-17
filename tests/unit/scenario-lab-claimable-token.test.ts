import { describe, expect, it } from "vitest";

import {
  isClaimableScenarioLabCorrelationToken,
  isPlausibleScenarioLabCorrelationToken,
} from "@/server/scenario-lab/claim-inquiry";
import { SCENARIO_LAB_ENTITY_TYPES, SCENARIO_LAB_RUN_STATUSES } from "@/server/scenario-lab/constants";

describe("isPlausibleScenarioLabCorrelationToken", () => {
  it("accepts high-entropy hex tokens only", () => {
    expect(isPlausibleScenarioLabCorrelationToken("a".repeat(32))).toBe(true);
    expect(isPlausibleScenarioLabCorrelationToken("not-a-token")).toBe(false);
    expect(isPlausibleScenarioLabCorrelationToken("")).toBe(false);
  });
});

describe("isClaimableScenarioLabCorrelationToken", () => {
  it("rejects forged tokens that do not match a READY/RUNNING run", async () => {
    const database = {
      scenarioLabRun: {
        findFirst: async () => null,
      },
      scenarioLabOwnedEntity: {
        findFirst: async () => null,
      },
    };

    await expect(
      isClaimableScenarioLabCorrelationToken(database, {
        organizationId: "org_1",
        correlationToken: "f".repeat(32),
      }),
    ).resolves.toBe(false);
  });

  it("rejects tokens for runs that already own an inquiry", async () => {
    const database = {
      scenarioLabRun: {
        findFirst: async () => ({ id: "run_1" }),
      },
      scenarioLabOwnedEntity: {
        findFirst: async (args: { where: { entityType: string } }) => {
          expect(args.where.entityType).toBe(SCENARIO_LAB_ENTITY_TYPES.INQUIRY);
          return { id: "owned_1" };
        },
      },
    };

    await expect(
      isClaimableScenarioLabCorrelationToken(database, {
        organizationId: "org_1",
        correlationToken: "a".repeat(32),
      }),
    ).resolves.toBe(false);
  });

  it("accepts a READY run without owned inquiry", async () => {
    const database = {
      scenarioLabRun: {
        findFirst: async (args: {
          where: { status: { in: string[] } };
        }) => {
          expect(args.where.status.in).toEqual([
            SCENARIO_LAB_RUN_STATUSES.READY,
            SCENARIO_LAB_RUN_STATUSES.RUNNING,
          ]);
          return { id: "run_1" };
        },
      },
      scenarioLabOwnedEntity: {
        findFirst: async () => null,
      },
    };

    await expect(
      isClaimableScenarioLabCorrelationToken(database, {
        organizationId: "org_1",
        correlationToken: "b".repeat(32),
      }),
    ).resolves.toBe(true);
  });
});
