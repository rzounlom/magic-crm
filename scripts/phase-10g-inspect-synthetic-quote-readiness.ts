/**
 * Phase 10G — Read-only inspect synthetic tenant quote readiness (pricing + perms).
 * Never touches Generations Production config.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import {
  loadApprovedPluginBaselineRegistry,
  organizationUsesApprovedPluginBaseline,
  tryBuildApprovedPluginBaselineConfig,
} from "@/server/event-planner/wp-parity/approved-plugin-baseline";
import { PERMISSIONS } from "@/types/permissions";

config();
config({ path: ".env.local", override: true });

const SYNTHETIC_SLUG = "magiccrm-test-center-b";
const OUT = path.join("playwright", ".fixtures", "phase-10g-synthetic-quote-readiness.json");

async function main() {
  const env = parseRuntimeEnv(process.env);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const org = await database.organization.findFirst({
      where: { slug: SYNTHETIC_SLUG },
      select: { id: true, slug: true, name: true },
    });
    if (!org) {
      throw new Error("Synthetic org missing");
    }

    const registry = loadApprovedPluginBaselineRegistry();
    const usesBaseline = organizationUsesApprovedPluginBaseline(org.id, registry);
    const built = tryBuildApprovedPluginBaselineConfig(org.id);

    const groups = await database.securityGroup.findMany({
      where: { organizationId: org.id },
      select: {
        id: true,
        name: true,
        systemKey: true,
        permissions: {
          select: { permissionDefinition: { select: { key: true } } },
        },
      },
    });

    const groupSummary = groups.map((g) => {
      const keys = new Set(g.permissions.map((p) => p.permissionDefinition.key));
      return {
        systemKey: g.systemKey,
        name: g.name,
        hasApprove: keys.has(PERMISSIONS.CRM_QUOTES_APPROVE),
        hasPriceOverride: keys.has(PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE),
      };
    });

    const payload = {
      org,
      approvedBaseline: {
        usesBaseline,
        registryOrganizationIds: registry.organizationIds,
        builtPricingSource: built?.pricingSource ?? null,
      },
      groups: groupSummary,
    };
    writeFileSync(OUT, JSON.stringify(payload, null, 2));
    console.log(JSON.stringify({ ok: true, out: OUT, ...payload }, null, 2));
  } finally {
    await database.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
