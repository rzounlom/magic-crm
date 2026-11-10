/**
 * Phase 10B — Scoped quote permission sync (gated).
 *
 * Adds missing `crm.quotes.approve` / `crm.quotes.price_override` definitions and
 * links them to Administrators / Event Sales for ONE organization.
 * Additive only (createMany skipDuplicates). Does not reset groups.
 *
 * Refuses to run unless BOTH flags are present:
 *   --org <organizationId>
 *   --confirm APPLY
 *
 * Usage (after explicit owner approval only):
 *   npx tsx --tsconfig tsconfig.json scripts/apply-quote-permission-sync.ts \
 *     --org mdutc2nkvpafezukeem8942v --confirm APPLY
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import {
  DEFAULT_SECURITY_GROUPS,
  SYSTEM_GROUP_KEYS,
} from "@/server/authorization/default-security-groups";
import { recordAuditEvent } from "@/server/services/audit";
import { syncPermissionDefinitions } from "@/server/services/sync-permission-definitions";
import { PERMISSIONS } from "@/types/permissions";

const QUOTE_KEYS = [PERMISSIONS.CRM_QUOTES_APPROVE, PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE] as const;

config();
config({ path: ".env.local", override: true });

function argValue(argv: string[], flag: string): string | null {
  const idx = argv.indexOf(flag);
  if (idx >= 0 && argv[idx + 1]) {
    return argv[idx + 1]!;
  }
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const organizationId = argValue(argv, "--org");
  const confirm = argValue(argv, "--confirm");
  if (!organizationId || confirm !== "APPLY") {
    throw new Error(
      "Refused: require --org <organizationId> and --confirm APPLY after explicit owner approval.",
    );
  }
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }

  const env = parseRuntimeEnv(process.env);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const organization = await database.organization.findFirst({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true },
    });
    if (!organization) {
      throw new Error(`Organization ${organizationId} not found.`);
    }

    await syncPermissionDefinitions(database);
    const definitions = await database.permissionDefinition.findMany({
      where: { key: { in: [...QUOTE_KEYS] }, active: true },
      select: { id: true, key: true },
    });
    const idByKey = new Map(definitions.map((row) => [row.key, row.id]));
    for (const key of QUOTE_KEYS) {
      if (!idByKey.has(key)) {
        throw new Error(`Permission definition ${key} missing after syncPermissionDefinitions.`);
      }
    }

    const linksCreated: Array<{ systemKey: string; permissionKey: string }> = [];
    for (const template of DEFAULT_SECURITY_GROUPS) {
      const wanted = template.permissionKeys.filter((key) =>
        (QUOTE_KEYS as readonly string[]).includes(key),
      );
      if (wanted.length === 0) {
        continue;
      }
      const group = await database.securityGroup.findFirst({
        where: { organizationId, systemKey: template.systemKey },
        select: { id: true, systemKey: true },
      });
      if (!group) {
        throw new Error(`Missing system group ${template.systemKey} for ${organizationId}`);
      }
      const permissionIds = wanted.map((key) => idByKey.get(key)!);
      const before = await database.securityGroupPermission.count({
        where: { securityGroupId: group.id, permissionDefinitionId: { in: permissionIds } },
      });
      await database.securityGroupPermission.createMany({
        data: permissionIds.map((permissionDefinitionId) => ({
          organizationId,
          securityGroupId: group.id,
          permissionDefinitionId,
        })),
        skipDuplicates: true,
      });
      const after = await database.securityGroupPermission.count({
        where: { securityGroupId: group.id, permissionDefinitionId: { in: permissionIds } },
      });
      for (const key of wanted) {
        linksCreated.push({ systemKey: group.systemKey ?? template.systemKey, permissionKey: key });
      }
      void before;
      void after;
    }

    // Safety: Front Desk / Operations must not receive quote permissions from this script.
    for (const systemKey of [SYSTEM_GROUP_KEYS.FRONT_DESK, SYSTEM_GROUP_KEYS.OPERATIONS]) {
      const group = await database.securityGroup.findFirst({
        where: { organizationId, systemKey },
        select: {
          id: true,
          permissions: { select: { permissionDefinition: { select: { key: true } } } },
        },
      });
      const keys = new Set(group?.permissions.map((row) => row.permissionDefinition.key) ?? []);
      for (const key of QUOTE_KEYS) {
        if (keys.has(key)) {
          throw new Error(`Safety abort: ${systemKey} has ${key} after scoped sync.`);
        }
      }
    }

    await recordAuditEvent(database, {
      organizationId,
      action: "security_group.permissions_changed",
      resourceType: "organization",
      resourceId: organizationId,
      metadata: {
        phase: "10b_scoped_quote_permission_sync",
        linksCreated: linksCreated.map((row) => `${row.systemKey}:${row.permissionKey}`).join(","),
        quoteKeys: QUOTE_KEYS.join(","),
      },
    });

    console.log(
      JSON.stringify(
        {
          applied: true,
          organization,
          linksCreated,
          message: "Scoped quote permission sync completed (additive only).",
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
