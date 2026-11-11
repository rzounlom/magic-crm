/**
 * Phase 10C — one-shot read-only checks (org uniqueness + permission catalog drift).
 * Does not mutate Production.
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { PERMISSION_CATALOG } from "@/types/permissions";

config();
config({ path: ".env.local", override: true });

const ORG_ID = "mdutc2nkvpafezukeem8942v";
const SLUG = "generations-crm-test-1788129640704833684";

async function main() {
  const env = parseRuntimeEnv(process.env);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const matches = await database.organization.findMany({
      where: { OR: [{ id: ORG_ID }, { slug: SLUG }] },
      select: { id: true, slug: true, name: true, customerFacingName: true },
    });
    const dualMatchCount = await database.organization.count({
      where: { id: ORG_ID, slug: SLUG },
    });
    const defs = await database.permissionDefinition.findMany({
      select: { key: true, active: true },
    });
    const catalogKeys = new Set<string>(PERMISSION_CATALOG.map((entry) => entry.key));
    const staleOutsideCatalog = defs
      .filter((row) => !catalogKeys.has(row.key))
      .map((row) => ({ key: row.key, active: row.active }));
    const missingFromDb = PERMISSION_CATALOG.map((entry) => entry.key).filter(
      (key) => !defs.some((row) => row.key === key),
    );

    console.log(
      JSON.stringify(
        {
          mode: "read_only",
          matches,
          dualMatchCount,
          brandingUpdateWouldAffectExactlyOne: dualMatchCount === 1,
          permissionDefs: {
            dbCount: defs.length,
            catalogCount: PERMISSION_CATALOG.length,
            missingFromDb,
            staleOutsideCatalog,
            note:
              "apply-quote-permission-sync calls syncPermissionDefinitions (global defs only). Group links remain org-scoped. Re-run is additive via skipDuplicates; stale defs not in catalog would be deactivated globally if present.",
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
  console.error(error);
  process.exit(1);
});
