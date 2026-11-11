/**
 * Phase 10D — Read-only staff permission resolution for Generations roles.
 * Does not create quotes or mutate Production.
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { hasPermission } from "@/server/policies/require-permission";
import { PERMISSIONS } from "@/types/permissions";

config();
config({ path: ".env.local", override: true });

const ORG_ID = "mdutc2nkvpafezukeem8942v";

async function sampleMember(
  database: ReturnType<typeof createPrismaClient>,
  systemKey: string,
) {
  const group = await database.securityGroup.findFirst({
    where: { organizationId: ORG_ID, systemKey },
    select: {
      id: true,
      name: true,
      systemKey: true,
      members: {
        take: 1,
        select: { userProfile: { select: { id: true, email: true } } },
      },
    },
  });
  const member = group?.members[0]?.userProfile ?? null;
  if (!member) {
    return {
      systemKey,
      groupId: group?.id ?? null,
      member: null,
      capabilities: null,
      note: "No member to resolve; reporting group-permission links only.",
    };
  }
  const ctx = { organizationId: ORG_ID, userId: member.id };
  return {
    systemKey,
    groupId: group?.id ?? null,
    member: { id: member.id, email: member.email },
    capabilities: {
      quotesApprove: await hasPermission(ctx, PERMISSIONS.CRM_QUOTES_APPROVE, database),
      quotesPriceOverride: await hasPermission(
        ctx,
        PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE,
        database,
      ),
    },
  };
}

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  const env = parseRuntimeEnv(process.env);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const roles = await Promise.all(
      ["administrators", "event_sales", "front_desk", "operations"].map((systemKey) =>
        sampleMember(database, systemKey),
      ),
    );
    const quoteLinkCounts = await database.securityGroupPermission.groupBy({
      by: ["securityGroupId"],
      where: {
        organizationId: ORG_ID,
        permissionDefinition: {
          key: { in: [PERMISSIONS.CRM_QUOTES_APPROVE, PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE] },
        },
      },
      _count: { _all: true },
    });
    const otherTenantQuoteLinks = await database.securityGroupPermission.count({
      where: {
        organizationId: { not: ORG_ID },
        permissionDefinition: {
          key: { in: [PERMISSIONS.CRM_QUOTES_APPROVE, PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE] },
        },
      },
    });
    console.log(
      JSON.stringify(
        {
          mode: "read_only",
          roles,
          quoteLinkCountsByGroup: quoteLinkCounts,
          otherTenantQuotePermissionLinks: otherTenantQuoteLinks,
          expected: {
            administrators: { quotesApprove: true, quotesPriceOverride: true },
            event_sales: { quotesApprove: true, quotesPriceOverride: false },
            front_desk: { quotesApprove: false, quotesPriceOverride: false },
            operations: { quotesApprove: false, quotesPriceOverride: false },
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
