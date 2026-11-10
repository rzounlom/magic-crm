/**
 * Read-only helper for Phase 10A permission gap inspection.
 * Usage: npx tsx --tsconfig tsconfig.json scripts/inspect-generations-permissions-readonly.ts
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { DEFAULT_SECURITY_GROUPS } from "@/server/authorization/default-security-groups";
import { ALL_PERMISSION_KEYS, PERMISSIONS } from "@/types/permissions";

const GENERATIONS_ORG_ID = "mdutc2nkvpafezukeem8942v";

config();
config({ path: ".env.local", override: true });

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  const env = parseRuntimeEnv(process.env);
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const defs = await db.permissionDefinition.findMany({
      select: { key: true, active: true },
      orderBy: { key: "asc" },
    });
    const defKeys = new Set(defs.map((row) => row.key));
    const missingDefs = ALL_PERMISSION_KEYS.filter((key) => !defKeys.has(key));

    const groups = await db.securityGroup.findMany({
      where: { organizationId: GENERATIONS_ORG_ID },
      select: {
        systemKey: true,
        name: true,
        permissions: { select: { permissionDefinition: { select: { key: true } } } },
      },
    });

    const expectedBySystemKey = Object.fromEntries(
      DEFAULT_SECURITY_GROUPS.map((group) => [group.systemKey, [...group.permissionKeys]]),
    );

    const comparison = groups.map((group) => {
      const actual = new Set(group.permissions.map((row) => row.permissionDefinition.key));
      const expected = expectedBySystemKey[group.systemKey ?? ""] ?? [];
      const missing = expected.filter((key) => !actual.has(key));
      const extra = [...actual].filter((key) => expected.length > 0 && !expected.includes(key as never));
      return {
        systemKey: group.systemKey,
        name: group.name,
        actualCount: actual.size,
        expectedCount: expected.length,
        missingFromExpected: missing,
        hasQuotesApprove: actual.has(PERMISSIONS.CRM_QUOTES_APPROVE),
        hasPriceOverride: actual.has(PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE),
        extraNotInTemplate: extra,
      };
    });

    console.log(
      JSON.stringify(
        {
          mode: "read_only",
          permissionDefinitionCount: defs.length,
          missingPermissionDefinitions: missingDefs,
          quoteRelatedDefs: defs.filter((row) => row.key.includes("quote")),
          groupComparison: comparison,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
