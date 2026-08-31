import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { ensureDefaultSecurityGroups } from "@/server/services/ensure-default-security-groups";
import { syncPermissionDefinitions } from "@/server/services/sync-permission-definitions";

if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
  config({ path: ".env.test", override: true });
} else {
  config();
  config({ path: ".env.local", override: true });
}

async function main() {
  const env = parseRuntimeEnv(process.env);
  const db = createPrismaClient(env.DATABASE_URL);

  try {
    await syncPermissionDefinitions(db);

    const organizations = await db.organization.findMany({ select: { id: true } });
    for (const organization of organizations) {
      await ensureDefaultSecurityGroups(db, {
        organizationId: organization.id,
        organizationCreated: false,
        isClerkOrganizationAdmin: false,
      });
    }

    console.info(
      `Synced permission catalog and default groups for ${organizations.length} organization(s).`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
