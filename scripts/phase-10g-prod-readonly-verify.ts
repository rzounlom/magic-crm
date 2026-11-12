/**
 * Phase 10G finalization — read-only Generations Production config verify.
 * Does not modify any records.
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
import { resolveWpCustomerQuoteDeliveryPolicy } from "@/server/event-planner/wp-parity/pricing-verification";
import { PERMISSIONS } from "@/types/permissions";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const ORG_ID = "mdutc2nkvpafezukeem8942v";
const OUT = path.join("playwright", ".fixtures", "phase-10g-prod-readonly.json");

async function main() {
  const env = parseRuntimeEnv(process.env);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const organization = await database.organization.findFirst({
      where: { id: ORG_ID },
      select: {
        id: true,
        slug: true,
        name: true,
        customerFacingName: true,
        depositPercent: true,
      },
    });
    if (!organization) {
      throw new Error("Generations org missing");
    }

    const groups = await database.securityGroup.findMany({
      where: { organizationId: ORG_ID, systemKey: { in: ["administrators", "event_sales"] } },
      select: {
        systemKey: true,
        permissions: { select: { permissionDefinition: { select: { key: true } } } },
      },
    });
    const byKey = Object.fromEntries(
      groups.map((g) => {
        const keys = new Set(g.permissions.map((p) => p.permissionDefinition.key));
        return [
          g.systemKey,
          {
            hasApprove: keys.has(PERMISSIONS.CRM_QUOTES_APPROVE),
            hasPriceOverride: keys.has(PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE),
          },
        ];
      }),
    );

    const registry = loadApprovedPluginBaselineRegistry();
    const usesBaseline = organizationUsesApprovedPluginBaseline(ORG_ID, registry);
    const built = tryBuildApprovedPluginBaselineConfig(ORG_ID);
    const delivery = resolveWpCustomerQuoteDeliveryPolicy({
      status: "ready",
      pricingSource: built?.pricingSource ?? "plugin_defaults",
    });

    const hoursPolicyCount = await database.locationOperatingHoursPolicy.count({
      where: { organizationId: ORG_ID },
    });

    const payload = {
      organization: {
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
        customerFacingName: organization.customerFacingName,
        depositPercent: organization.depositPercent,
      },
      permissions: byKey,
      pricing: {
        usesBaseline,
        packSource: built?.pricingSource ?? null,
        finalLivePriceRevalidation: registry.finalLivePriceRevalidation,
        delivery: {
          canApprove: delivery.canApprove,
          canDeliver: delivery.canDeliver,
          code: delivery.code,
        },
      },
      operatingHoursPolicyCount: hoursPolicyCount,
      env: {
        emailProvider: process.env.EMAIL_PROVIDER ?? null,
        resendConfigured: Boolean(process.env.RESEND_API_KEY),
        stripeSecretConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
        magiccrmDatabaseRole: process.env.MAGICCRM_DATABASE_ROLE ?? null,
      },
    };
    writeFileSync(OUT, JSON.stringify(payload, null, 2));
    process.stdout.write(`${JSON.stringify({ ok: true, out: OUT, ...payload }, null, 2)}\n`);
  } finally {
    await database.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
