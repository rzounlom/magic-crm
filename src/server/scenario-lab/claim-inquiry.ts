import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  SCENARIO_LAB_ENTITY_TYPES,
  SCENARIO_LAB_RUN_STATUSES,
  SCENARIO_LAB_TIMELINE_KINDS,
} from "@/server/scenario-lab/constants";
import { appendTimeline, createTimelineEntry } from "@/server/scenario-lab/timeline";

const CORRELATION_TOKEN_PATTERN = /^[a-f0-9]{32,64}$/i;

export function isPlausibleScenarioLabCorrelationToken(value: string | undefined | null): boolean {
  return Boolean(value && CORRELATION_TOKEN_PATTERN.test(value.trim()));
}

type ClaimLookupDatabase = {
  scenarioLabRun: {
    findFirst: (args: {
      where: {
        organizationId: string;
        correlationToken: string;
        status: { in: string[] };
      };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
  scenarioLabOwnedEntity: {
    findFirst: (args: {
      where: {
        organizationId: string;
        runId: string;
        entityType: string;
      };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
};

type ClaimDb = Pick<PrismaClient, "scenarioLabRun" | "scenarioLabOwnedEntity" | "$transaction" | "$queryRaw">;

/**
 * True only when the token matches a tenant-scoped READY/RUNNING run that does not
 * already own an inquiry. Forged or consumed tokens return false — they must not
 * suppress normal customer notifications or grant privileged access.
 */
export async function isClaimableScenarioLabCorrelationToken(
  database: ClaimLookupDatabase,
  input: {
    organizationId: string;
    correlationToken?: string | null;
  },
): Promise<boolean> {
  const token = input.correlationToken?.trim();
  if (!token || !isPlausibleScenarioLabCorrelationToken(token)) {
    return false;
  }

  const run = await database.scenarioLabRun.findFirst({
    where: {
      organizationId: input.organizationId,
      correlationToken: token,
      status: {
        in: [SCENARIO_LAB_RUN_STATUSES.READY, SCENARIO_LAB_RUN_STATUSES.RUNNING],
      },
    },
    select: { id: true },
  });
  if (!run) {
    return false;
  }

  const owned = await database.scenarioLabOwnedEntity.findFirst({
    where: {
      organizationId: input.organizationId,
      runId: run.id,
      entityType: SCENARIO_LAB_ENTITY_TYPES.INQUIRY,
    },
    select: { id: true },
  });
  return !owned;
}

/**
 * After a real public inquiry is persisted, claim it for a Scenario Lab run when
 * a valid correlation token is present. Never grants privileged access.
 * Invalid/expired/consumed tokens are ignored so normal public intake is not broken.
 */
export async function claimScenarioLabInquiryIfPresent(
  database: ClaimDb,
  input: {
    organizationId: string;
    inquiryId: string;
    correlationToken?: string | null;
  },
): Promise<{ claimed: boolean; runId?: string }> {
  const token = input.correlationToken?.trim();
  if (!token || !isPlausibleScenarioLabCorrelationToken(token)) {
    return { claimed: false };
  }

  return database.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id
      FROM scenario_lab_runs
      WHERE "organizationId" = ${input.organizationId}
        AND "correlationToken" = ${token}
      FOR UPDATE
    `;

    const run = await tx.scenarioLabRun.findFirst({
      where: {
        organizationId: input.organizationId,
        correlationToken: token,
      },
      select: { id: true, status: true, timeline: true },
    });
    if (!run) {
      return { claimed: false };
    }

    if (
      run.status !== SCENARIO_LAB_RUN_STATUSES.READY &&
      run.status !== SCENARIO_LAB_RUN_STATUSES.RUNNING
    ) {
      return { claimed: false };
    }

    const alreadyOwned = await tx.scenarioLabOwnedEntity.findFirst({
      where: {
        organizationId: input.organizationId,
        entityType: SCENARIO_LAB_ENTITY_TYPES.INQUIRY,
        entityId: input.inquiryId,
      },
      select: { runId: true },
    });
    if (alreadyOwned) {
      return { claimed: alreadyOwned.runId === run.id, runId: alreadyOwned.runId };
    }

    const runAlreadyHasInquiry = await tx.scenarioLabOwnedEntity.findFirst({
      where: {
        organizationId: input.organizationId,
        runId: run.id,
        entityType: SCENARIO_LAB_ENTITY_TYPES.INQUIRY,
      },
      select: { id: true },
    });
    if (runAlreadyHasInquiry) {
      return { claimed: false };
    }

    try {
      await tx.scenarioLabOwnedEntity.create({
        data: {
          organizationId: input.organizationId,
          runId: run.id,
          entityType: SCENARIO_LAB_ENTITY_TYPES.INQUIRY,
          entityId: input.inquiryId,
        },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        return { claimed: false };
      }
      throw error;
    }

    const timeline = appendTimeline(
      run.timeline,
      createTimelineEntry({
        kind: SCENARIO_LAB_TIMELINE_KINDS.OBSERVED_STATE,
        code: "inquiry_linked",
        message: "Inquiry successfully persisted and linked to this scenario run.",
      }),
    );

    await tx.scenarioLabRun.update({
      where: { id: run.id },
      data: {
        status: SCENARIO_LAB_RUN_STATUSES.COMPLETED,
        inquiryLinkedAt: new Date(),
        timeline: timeline as unknown as Prisma.InputJsonValue,
      },
    });

    return { claimed: true, runId: run.id };
  });
}
