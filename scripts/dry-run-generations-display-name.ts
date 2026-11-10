/**
 * Phase 10B — Read-only proposal to set Generations customerFacingName.
 * Does not write.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/dry-run-generations-display-name.ts
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { customerFacingOrganizationName } from "@/lib/inquiries/organization-display-name";

const GENERATIONS_ORG_ID = "mdutc2nkvpafezukeem8942v";
const PROPOSED_NAME = "Generations Adventureplex";

config();
config({ path: ".env.local", override: true });

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  const env = parseRuntimeEnv(process.env);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const columnReady = await database.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'organizations'
          AND column_name = 'customerFacingName'
      ) AS exists
    `;
    const migrationColumnPresent = Boolean(columnReady[0]?.exists);

    const base = await database.$queryRaw<Array<{ id: string; name: string; slug: string }>>`
      SELECT id, name, slug
      FROM organizations
      WHERE id = ${GENERATIONS_ORG_ID}
      LIMIT 1
    `;
    const organization = base[0];
    if (!organization) {
      throw new Error(`Organization ${GENERATIONS_ORG_ID} not found.`);
    }

    let customerFacingName: string | null = null;
    if (migrationColumnPresent) {
      const named = await database.$queryRaw<Array<{ customerFacingName: string | null }>>`
        SELECT "customerFacingName"
        FROM organizations
        WHERE id = ${GENERATIONS_ORG_ID}
        LIMIT 1
      `;
      customerFacingName = named[0]?.customerFacingName ?? null;
    }

    console.log(
      JSON.stringify(
        {
          mode: "dry_run_read_only",
          organizationId: organization.id,
          migrationColumnPresent,
          unchanged: {
            name: organization.name,
            slug: organization.slug,
          },
          current: {
            customerFacingName,
            resolvedDisplay: customerFacingOrganizationName({
              name: organization.name,
              customerFacingName,
            }),
          },
          proposed: {
            customerFacingName: PROPOSED_NAME,
            resolvedDisplayAfter: PROPOSED_NAME,
            prerequisites: [
              "Deploy migration 20261110160000_organization_customer_facing_name",
              "Explicit owner approval to set Generations Adventureplex",
            ],
            sqlAfterMigration: `UPDATE organizations SET "customerFacingName" = '${PROPOSED_NAME}', "updatedAt" = NOW() WHERE id = '${GENERATIONS_ORG_ID}' AND slug = '${organization.slug}';`,
          },
          ownerApprovalRequired: true,
          note: "Does not rename organization.name or slug. Other tenants unaffected (null customerFacingName).",
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
