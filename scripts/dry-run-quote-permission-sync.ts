/**
 * Phase 10B — Read-only dry-run for quote permission synchronization.
 *
 * Reports exact Production (or target DB) mutations that would be applied by a
 * scoped quote-permission sync. Does not write.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/dry-run-quote-permission-sync.ts
 *   npx tsx --tsconfig tsconfig.json scripts/dry-run-quote-permission-sync.ts --org mdutc2nkvpafezukeem8942v
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import {
  DEFAULT_SECURITY_GROUPS,
  SYSTEM_GROUP_KEYS,
} from "@/server/authorization/default-security-groups";
import { PERMISSION_CATALOG, PERMISSIONS } from "@/types/permissions";

const DEFAULT_ORG_ID = "mdutc2nkvpafezukeem8942v";
const QUOTE_KEYS = [PERMISSIONS.CRM_QUOTES_APPROVE, PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE] as const;

config();
config({ path: ".env.local", override: true });

function hostFromDatabaseUrl(url: string): string {
  try {
    return new URL(url.replace(/^postgresql:/, "http:")).host;
  } catch {
    return "(unparseable)";
  }
}

function parseOrgArg(argv: string[]): string {
  const idx = argv.indexOf("--org");
  if (idx >= 0 && argv[idx + 1]) {
    return argv[idx + 1]!;
  }
  return DEFAULT_ORG_ID;
}

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  const organizationId = parseOrgArg(process.argv.slice(2));
  const env = parseRuntimeEnv(process.env);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const catalogByKey = new Map(PERMISSION_CATALOG.map((row) => [row.key, row]));
    const existingDefs = await database.permissionDefinition.findMany({
      select: { id: true, key: true, active: true, module: true, name: true, description: true },
    });
    const existingByKey = new Map(existingDefs.map((row) => [row.key, row]));

    const definitionsToCreate = QUOTE_KEYS.filter((key) => !existingByKey.has(key)).map((key) => {
      const entry = catalogByKey.get(key)!;
      return {
        key: entry.key,
        module: entry.module,
        name: entry.name,
        description: entry.description,
        active: true,
      };
    });

    const organization = await database.organization.findFirst({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true },
    });
    if (!organization) {
      throw new Error(`Organization ${organizationId} not found.`);
    }

    const groups = await database.securityGroup.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        systemKey: true,
        permissions: { select: { permissionDefinition: { select: { key: true } } } },
      },
    });

    const expectedAdds: Array<{
      systemKey: string;
      groupId: string;
      groupName: string;
      permissionKey: string;
    }> = [];
    const unintendedRisk: string[] = [];

    for (const template of DEFAULT_SECURITY_GROUPS) {
      const group = groups.find((row) => row.systemKey === template.systemKey);
      if (!group) {
        unintendedRisk.push(`Missing system group ${template.systemKey} for org ${organizationId}`);
        continue;
      }
      const actual = new Set(group.permissions.map((row) => row.permissionDefinition.key));
      for (const key of QUOTE_KEYS) {
        if (!template.permissionKeys.includes(key)) {
          if (actual.has(key)) {
            unintendedRisk.push(
              `${template.systemKey} unexpectedly already has ${key} (not in template)`,
            );
          }
          continue;
        }
        if (!actual.has(key)) {
          expectedAdds.push({
            systemKey: template.systemKey,
            groupId: group.id,
            groupName: group.name,
            permissionKey: key,
          });
        }
      }
    }

    const frontDesk = groups.find((row) => row.systemKey === SYSTEM_GROUP_KEYS.FRONT_DESK);
    const operations = groups.find((row) => row.systemKey === SYSTEM_GROUP_KEYS.OPERATIONS);
    const frontDeskKeys = new Set(
      frontDesk?.permissions.map((row) => row.permissionDefinition.key) ?? [],
    );
    const operationsKeys = new Set(
      operations?.permissions.map((row) => row.permissionDefinition.key) ?? [],
    );

    console.log(
      JSON.stringify(
        {
          mode: "dry_run_read_only",
          host: hostFromDatabaseUrl(env.DATABASE_URL),
          organization,
          note: [
            "This dry-run proposes the smallest scoped quote-permission sync for one organization.",
            "Full `npm run db:sync-auth` would also sync permission definitions globally and ensure default groups for EVERY organization (additive createMany only).",
            "Do not apply without explicit owner approval.",
          ],
          permissionDefinitions: {
            toCreate: definitionsToCreate,
            alreadyPresent: QUOTE_KEYS.filter((key) => existingByKey.has(key)),
          },
          groupPermissionLinksToCreate: expectedAdds,
          safetyChecks: {
            frontDeskWouldReceiveQuoteApprove: false,
            frontDeskCurrentlyHasQuoteApprove: frontDeskKeys.has(PERMISSIONS.CRM_QUOTES_APPROVE),
            frontDeskCurrentlyHasPriceOverride: frontDeskKeys.has(PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE),
            operationsWouldReceiveQuoteApprove: false,
            operationsCurrentlyHasQuoteApprove: operationsKeys.has(PERMISSIONS.CRM_QUOTES_APPROVE),
            operationsCurrentlyHasPriceOverride: operationsKeys.has(
              PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE,
            ),
            administratorsShouldReceive: [
              PERMISSIONS.CRM_QUOTES_APPROVE,
              PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE,
            ],
            eventSalesShouldReceive: [PERMISSIONS.CRM_QUOTES_APPROVE],
            eventSalesShouldNotReceive: [PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE],
            unintendedRisk,
          },
          serverSideAuthorization: {
            approvePath: "approveAndSendWpStaffQuote requires crm.inquiries.manage + crm.quotes.approve (+ communications.send to deliver)",
            priceOverridePath: "updateWpStaffQuoteDraft requires crm.quotes.price_override when unit prices change",
            matchesTemplates: true,
          },
          proposedSqlSketch: {
            createDefinitions: definitionsToCreate.map(
              (row) =>
                `INSERT INTO permission_definitions (id, key, module, name, description, active, "createdAt", "updatedAt") VALUES (cuid(), '${row.key}', '${row.module}', …) ON CONFLICT DO NOTHING;`,
            ),
            linkPermissions: expectedAdds.map(
              (row) =>
                `INSERT INTO security_group_permissions (…) VALUES (org=${organizationId}, group=${row.groupId}, key=${row.permissionKey}) ON CONFLICT DO NOTHING;`,
            ),
          },
          ownerApprovalRequired: true,
          applyScript: "scripts/apply-quote-permission-sync.ts (gated; not executed in Phase 10B)",
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
