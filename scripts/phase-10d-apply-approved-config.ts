/**
 * Phase 10D — Apply owner-approved Generations Production configuration.
 *
 * Modes:
 *   --preflight   read-only checks; exit 1 on failure
 *   --apply-branding  tenant-scoped customerFacingName UPDATE (after preflight)
 *   --verify      independent read-back after apply
 *
 * Permission sync remains scripts/apply-quote-permission-sync.ts --confirm APPLY
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { customerFacingOrganizationName } from "@/lib/inquiries/organization-display-name";
import {
  loadApprovedPluginBaselineRegistry,
  organizationUsesApprovedPluginBaseline,
  tryBuildApprovedPluginBaselineConfig,
} from "@/server/event-planner/wp-parity/approved-plugin-baseline";
import { resolveWpCustomerQuoteDeliveryPolicy } from "@/server/event-planner/wp-parity/pricing-verification";
import { PERMISSIONS } from "@/types/permissions";

config();
config({ path: ".env.local", override: true });

const ORG_ID = "mdutc2nkvpafezukeem8942v";
const SLUG = "generations-crm-test-1788129640704833684";
const EXPECTED_ADMIN_GROUP_ID = "nynsi7e9ted3h424ljazpepv";
const EXPECTED_EVENT_SALES_GROUP_ID = "dbpld54b8ywdd7qs3vspri4f";
const PROPOSED_NAME = "Generations Adventureplex";
const EXPECTED_HOST = "ep-bold-art-avjy5nt4";

const QUOTE_KEYS = [PERMISSIONS.CRM_QUOTES_APPROVE, PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE] as const;

type Mode = "preflight" | "apply-branding" | "verify";

function parseMode(argv: string[]): Mode {
  if (argv.includes("--apply-branding")) {
    return "apply-branding";
  }
  if (argv.includes("--verify")) {
    return "verify";
  }
  return "preflight";
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "(unparseable)";
  }
}

async function groupQuoteKeys(
  database: ReturnType<typeof createPrismaClient>,
  organizationId: string,
  systemKey: string,
) {
  const group = await database.securityGroup.findFirst({
    where: { organizationId, systemKey },
    select: {
      id: true,
      name: true,
      systemKey: true,
      permissions: { select: { permissionDefinition: { select: { key: true } } } },
    },
  });
  const keys = new Set(group?.permissions.map((row) => row.permissionDefinition.key) ?? []);
  return {
    id: group?.id ?? null,
    name: group?.name ?? null,
    systemKey: group?.systemKey ?? systemKey,
    hasApprove: keys.has(PERMISSIONS.CRM_QUOTES_APPROVE),
    hasPriceOverride: keys.has(PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE),
    quoteKeys: [...keys].filter((key) => (QUOTE_KEYS as readonly string[]).includes(key)),
  };
}

async function gatherState(database: ReturnType<typeof createPrismaClient>) {
  const host = hostFromUrl(process.env.DATABASE_URL ?? "");
  const dualMatchCount = await database.organization.count({
    where: { id: ORG_ID, slug: SLUG },
  });
  const organization = await database.organization.findFirst({
    where: { id: ORG_ID, slug: SLUG },
    select: {
      id: true,
      name: true,
      slug: true,
      customerFacingName: true,
      depositPercent: true,
      updatedAt: true,
    },
  });

  const columnReady = await database.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'organizations'
        AND column_name = 'customerFacingName'
    ) AS exists
  `;

  const quoteDefs = await database.permissionDefinition.findMany({
    where: { key: { in: [...QUOTE_KEYS] } },
    select: { id: true, key: true, active: true, name: true },
  });

  const administrators = await groupQuoteKeys(database, ORG_ID, "administrators");
  const eventSales = await groupQuoteKeys(database, ORG_ID, "event_sales");
  const frontDesk = await groupQuoteKeys(database, ORG_ID, "front_desk");
  const operations = await groupQuoteKeys(database, ORG_ID, "operations");

  const salad = await database.product.findFirst({
    where: { organizationId: ORG_ID, slug: "salad-pan" },
    select: {
      id: true,
      slug: true,
      prices: { select: { amountCents: true, additionalHourCents: true, strategy: true }, take: 5 },
    },
  });
  const lowerRoom = await database.product.findFirst({
    where: { organizationId: ORG_ID, slug: "lower-event-room" },
    select: {
      id: true,
      slug: true,
      prices: {
        select: { amountCents: true, additionalHourCents: true, includedHours: true, strategy: true },
        take: 5,
      },
    },
  });

  const registry = loadApprovedPluginBaselineRegistry();
  const pack = tryBuildApprovedPluginBaselineConfig(ORG_ID);
  const delivery = resolveWpCustomerQuoteDeliveryPolicy({
    pricingSource: "approved_plugin_baseline",
    status: "ready",
  });

  const otherOrgsWithAdventureplex = await database.organization.count({
    where: {
      id: { not: ORG_ID },
      customerFacingName: PROPOSED_NAME,
    },
  });

  const bookingCount = await database.booking.count({ where: { organizationId: ORG_ID } });
  const paymentAttestHint = await database.booking.count({
    where: { organizationId: ORG_ID, depositPaidCents: { gt: 0 } },
  });

  return {
    host,
    databaseRole: process.env.MAGICCRM_DATABASE_ROLE ?? null,
    emailProvider: process.env.EMAIL_PROVIDER ?? "(unset)",
    dualMatchCount,
    customerFacingNameColumnPresent: Boolean(columnReady[0]?.exists),
    organization,
    resolvedDisplay: organization
      ? customerFacingOrganizationName({
          name: organization.name,
          customerFacingName: organization.customerFacingName,
        })
      : null,
    quoteDefs,
    groups: { administrators, eventSales, frontDesk, operations },
    depositPercent: organization?.depositPercent ?? null,
    pricing: {
      orgListedInBaselineRegistry: organizationUsesApprovedPluginBaseline(ORG_ID, registry),
      packSource: pack?.pricingSource ?? null,
      catalogVersion: pack?.rulesVersion ?? null,
      pricingRevision: pack?.pricingRevision ?? null,
      finalLivePriceRevalidation: registry.finalLivePriceRevalidation,
      delivery,
      saladCatalogCents: salad?.prices[0]?.amountCents ?? null,
      lowerRoomAdditionalHourCents: lowerRoom?.prices[0]?.additionalHourCents ?? null,
      wpBaselineSaladCents: pack?.catalog.food.salad ?? null,
      wpBaselineLowerExtraCents: pack?.catalog.rooms.lower_extra ?? null,
    },
    otherOrgsWithAdventureplex,
    activitySnapshot: { bookingCount, bookingsWithDepositPaid: paymentAttestHint },
  };
}

function assertPreflight(state: Awaited<ReturnType<typeof gatherState>>): string[] {
  const failures: string[] = [];
  if (!state.host.includes(EXPECTED_HOST)) {
    failures.push(`Unexpected DATABASE_URL host ${state.host}; expected ${EXPECTED_HOST}`);
  }
  if (state.databaseRole === "test") {
    failures.push("MAGICCRM_DATABASE_ROLE=test — refuse Production apply");
  }
  if (state.dualMatchCount !== 1 || !state.organization) {
    failures.push(`Expected exactly one org for id+slug; got dualMatchCount=${state.dualMatchCount}`);
  }
  if (!state.customerFacingNameColumnPresent) {
    failures.push("customerFacingName column missing");
  }
  if (state.organization && state.organization.depositPercent !== 25) {
    failures.push(`depositPercent is ${state.organization.depositPercent}, expected 25`);
  }
  if (state.pricing.packSource !== "approved_plugin_baseline") {
    failures.push(`pricing source is ${state.pricing.packSource}, expected approved_plugin_baseline`);
  }
  if (state.pricing.delivery.canDeliver !== false) {
    failures.push("customer quote delivery is not blocked");
  }
  const email = state.emailProvider.toLowerCase();
  if (email !== "none" && email !== "(unset)" && email !== "") {
    failures.push(`EMAIL_PROVIDER=${state.emailProvider}; expected none/disabled`);
  }
  if (state.groups.administrators.id !== EXPECTED_ADMIN_GROUP_ID) {
    failures.push(
      `Administrators group id ${state.groups.administrators.id} != ${EXPECTED_ADMIN_GROUP_ID}`,
    );
  }
  if (state.groups.eventSales.id !== EXPECTED_EVENT_SALES_GROUP_ID) {
    failures.push(
      `Event Sales group id ${state.groups.eventSales.id} != ${EXPECTED_EVENT_SALES_GROUP_ID}`,
    );
  }
  for (const key of QUOTE_KEYS) {
    const existing = state.quoteDefs.find((row) => row.key === key);
    if (existing && !existing.active) {
      failures.push(`Permission ${key} exists but is inactive — inspect before apply`);
    }
  }
  if (state.groups.frontDesk.hasApprove || state.groups.frontDesk.hasPriceOverride) {
    failures.push("Front Desk already has quote permissions — inspect before apply");
  }
  if (state.groups.operations.hasApprove || state.groups.operations.hasPriceOverride) {
    failures.push("Operations already has quote permissions — inspect before apply");
  }
  if (state.groups.eventSales.hasPriceOverride) {
    failures.push("Event Sales already has price_override — inspect before apply");
  }
  return failures;
}

async function applyBranding(database: ReturnType<typeof createPrismaClient>) {
  const result = await database.$executeRaw`
    UPDATE organizations
    SET "customerFacingName" = ${PROPOSED_NAME}, "updatedAt" = NOW()
    WHERE id = ${ORG_ID}
      AND slug = ${SLUG}
  `;
  return { affectedRows: Number(result) };
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }

  const env = parseRuntimeEnv(process.env);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    if (mode === "preflight") {
      const before = await gatherState(database);
      const failures = assertPreflight(before);
      console.log(
        JSON.stringify(
          {
            mode: "preflight",
            ok: failures.length === 0,
            failures,
            before,
          },
          null,
          2,
        ),
      );
      if (failures.length > 0) {
        process.exitCode = 1;
      }
      return;
    }

    if (mode === "apply-branding") {
      const before = await gatherState(database);
      const failures = assertPreflight(before);
      if (failures.length > 0) {
        console.log(JSON.stringify({ mode: "apply-branding", ok: false, failures, before }, null, 2));
        process.exitCode = 1;
        return;
      }
      if (before.organization?.customerFacingName === PROPOSED_NAME) {
        console.log(
          JSON.stringify(
            {
              mode: "apply-branding",
              ok: true,
              alreadyApplied: true,
              affectedRows: 0,
              before,
              after: before,
            },
            null,
            2,
          ),
        );
        return;
      }
      const apply = await applyBranding(database);
      const after = await gatherState(database);
      const ok =
        apply.affectedRows === 1 &&
        after.organization?.customerFacingName === PROPOSED_NAME &&
        after.organization.name === before.organization!.name &&
        after.organization.slug === before.organization!.slug;
      console.log(
        JSON.stringify(
          {
            mode: "apply-branding",
            ok,
            affectedRows: apply.affectedRows,
            before: {
              customerFacingName: before.organization?.customerFacingName ?? null,
              name: before.organization?.name,
              slug: before.organization?.slug,
              resolvedDisplay: before.resolvedDisplay,
            },
            after: {
              customerFacingName: after.organization?.customerFacingName ?? null,
              name: after.organization?.name,
              slug: after.organization?.slug,
              resolvedDisplay: after.resolvedDisplay,
            },
          },
          null,
          2,
        ),
      );
      if (!ok) {
        process.exitCode = 1;
      }
      return;
    }

    const after = await gatherState(database);
    console.log(JSON.stringify({ mode: "verify", after }, null, 2));
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
