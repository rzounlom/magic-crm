/**
 * Phase 10A — Read-only Generations operational readiness audit.
 * Does not create, update, or delete any records.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/audit-generations-operational-readiness-readonly.ts
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { customerFacingOrganizationName } from "@/lib/inquiries/organization-display-name";
import {
  DEFAULT_SECURITY_GROUPS,
  SYSTEM_GROUP_KEYS,
} from "@/server/authorization/default-security-groups";
import { depositPercentFromTenant, depositRequiredCents } from "@/server/catalog/pricing";
import {
  loadApprovedPluginBaselineRegistry,
  organizationUsesApprovedPluginBaseline,
  buildApprovedPluginBaselineConfig,
} from "@/server/event-planner/wp-parity/approved-plugin-baseline";
import {
  summarizeWpInventoryCoverage,
  WP_EXCLUSIVE_ROOM_MAPPINGS,
} from "@/server/event-planner/wp-parity/inventory-mapping";
import { resolveWpCustomerQuoteDeliveryPolicy } from "@/server/event-planner/wp-parity/pricing-verification";
import { WP_KNOWN_CATALOG_DISCREPANCIES } from "@/server/event-planner/wp-parity/quote-draft";
import { ALL_PERMISSION_KEYS, PERMISSIONS } from "@/types/permissions";

const GENERATIONS_ORG_ID = "mdutc2nkvpafezukeem8942v";
const SAMPLE_TOTAL_CENTS = 33_848; // Phase 9C fixture total for deposit math comparison

config();
config({ path: ".env.local", override: true });

function hostFromDatabaseUrl(url: string): string {
  try {
    return new URL(url.replace(/^postgresql:/, "http:")).host;
  } catch {
    return "(unparseable)";
  }
}

async function main() {
  const env = parseRuntimeEnv(process.env);
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test. Use the authorized customer/dev database.");
  }
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const host = hostFromDatabaseUrl(env.DATABASE_URL);
    console.error(
      JSON.stringify(
        {
          mode: "read_only",
          host,
          organizationId: GENERATIONS_ORG_ID,
          emailProviderEnv: process.env.EMAIL_PROVIDER ?? "none",
        },
        null,
        2,
      ),
    );

    const organization = await database.organization.findFirst({
      where: { id: GENERATIONS_ORG_ID },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        currency: true,
        depositPercent: true,
        onboardingStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!organization) {
      throw new Error(`Organization ${GENERATIONS_ORG_ID} not found.`);
    }

    const locations = await database.location.findMany({
      where: { organizationId: GENERATIONS_ORG_ID },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        active: true,
      },
      orderBy: { name: "asc" },
    });

    const taxSettings = await database.organizationTaxSettings.findFirst({
      where: { organizationId: GENERATIONS_ORG_ID },
    });
    const locationTaxProfiles = await database.locationTaxProfile.findMany({
      where: { organizationId: GENERATIONS_ORG_ID },
      select: {
        id: true,
        locationId: true,
        jurisdictionCode: true,
        jurisdictionResolved: true,
        taxTimeZone: true,
        streetLine1: true,
        city: true,
        region: true,
        postalCode: true,
        country: true,
      },
    });
    const taxRateSchedules = await database.taxRateSchedule.findMany({
      where: { organizationId: GENERATIONS_ORG_ID, active: true },
      select: {
        id: true,
        locationId: true,
        taxType: true,
        jurisdictionCode: true,
        rateBps: true,
        effectiveFrom: true,
        effectiveTo: true,
        active: true,
      },
      take: 50,
    });
    const productTaxClassCount = await database.productTaxClassification.count({
      where: { organizationId: GENERATIONS_ORG_ID },
    });

    const registry = loadApprovedPluginBaselineRegistry();
    const usesBaseline = organizationUsesApprovedPluginBaseline(organization.id, registry);
    const baselinePack = usesBaseline ? buildApprovedPluginBaselineConfig(organization.id, registry) : null;
    const deliveryPolicy = resolveWpCustomerQuoteDeliveryPolicy({
      status: "ready",
      pricingSource: baselinePack?.pricingSource ?? "plugin_defaults",
    });

    const securityGroups = await database.securityGroup.findMany({
      where: { organizationId: GENERATIONS_ORG_ID },
      select: {
        id: true,
        name: true,
        systemKey: true,
        permissions: {
          select: {
            permissionDefinition: { select: { key: true, active: true } },
          },
        },
        members: {
          select: {
            userProfile: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                displayName: true,
                clerkUserId: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const groupSummaries = securityGroups.map((group) => {
      const keys = new Set(
        group.permissions
          .filter((row) => row.permissionDefinition.active)
          .map((row) => row.permissionDefinition.key),
      );
      return {
        id: group.id,
        name: group.name,
        systemKey: group.systemKey,
        memberCount: group.members.length,
        members: group.members.map((row) => ({
          id: row.userProfile.id,
          email: row.userProfile.email,
          name:
            row.userProfile.displayName ||
            [row.userProfile.firstName, row.userProfile.lastName].filter(Boolean).join(" ") ||
            null,
        })),
        capabilities: {
          inquiriesManage: keys.has(PERMISSIONS.CRM_INQUIRIES_MANAGE),
          quotesApprove: keys.has(PERMISSIONS.CRM_QUOTES_APPROVE),
          quotesPriceOverride: keys.has(PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE),
          communicationsSend: keys.has(PERMISSIONS.COMMUNICATIONS_SEND),
          eventsConfirm: keys.has(PERMISSIONS.EVENTS_CONFIRM),
          paymentsCollect: keys.has(PERMISSIONS.PAYMENTS_COLLECT),
          paymentsView: keys.has(PERMISSIONS.PAYMENTS_VIEW),
        },
      };
    });

    const administrators = groupSummaries.find((row) => row.systemKey === SYSTEM_GROUP_KEYS.ADMINISTRATORS);
    const eventSales = groupSummaries.find((row) => row.systemKey === SYSTEM_GROUP_KEYS.EVENT_SALES);

    const permissionDefs = await database.permissionDefinition.findMany({
      select: { key: true, active: true },
      orderBy: { key: "asc" },
    });
    const defKeys = new Set(permissionDefs.map((row) => row.key));
    const missingPermissionDefinitions = ALL_PERMISSION_KEYS.filter((key) => !defKeys.has(key));
    const expectedBySystemKey = Object.fromEntries(
      DEFAULT_SECURITY_GROUPS.map((group) => [group.systemKey, [...group.permissionKeys]]),
    );
    const permissionSyncGaps = groupSummaries.map((group) => {
      const expected = expectedBySystemKey[group.systemKey ?? ""] ?? [];
      const actual = new Set(
        (securityGroups.find((row) => row.id === group.id)?.permissions ?? [])
          .filter((row) => row.permissionDefinition.active)
          .map((row) => row.permissionDefinition.key),
      );
      return {
        systemKey: group.systemKey,
        missingFromExpected: expected.filter((key) => !actual.has(key)),
        hasQuotesApprove: actual.has(PERMISSIONS.CRM_QUOTES_APPROVE),
        hasPriceOverride: actual.has(PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE),
      };
    });

    const resourceTypes = await database.resourceType.findMany({
      where: { organizationId: GENERATIONS_ORG_ID },
      select: {
        id: true,
        slug: true,
        name: true,
        active: true,
        inventoryConfigured: true,
        schedulingMode: true,
        slotMinutes: true,
        _count: { select: { resources: { where: { active: true } } } },
      },
      orderBy: { slug: "asc" },
    });
    const inventoryCoverage = summarizeWpInventoryCoverage({
      resourceTypes: resourceTypes.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        inventoryConfigured: row.inventoryConfigured,
        active: row.active,
      })),
    });

    const productCount = await database.product.count({
      where: { organizationId: GENERATIONS_ORG_ID },
    });
    const activeProductCount = await database.product.count({
      where: { organizationId: GENERATIONS_ORG_ID, active: true },
    });
    const saladPrice = await database.product.findFirst({
      where: { organizationId: GENERATIONS_ORG_ID, slug: "salad-pan" },
      select: {
        id: true,
        slug: true,
        name: true,
        active: true,
        prices: {
          where: { active: true },
          select: { amountCents: true, additionalHourCents: true, strategy: true },
          take: 3,
        },
      },
    });
    const lowerRoomPrice = await database.product.findFirst({
      where: { organizationId: GENERATIONS_ORG_ID, slug: "lower-event-room" },
      select: {
        id: true,
        slug: true,
        name: true,
        active: true,
        prices: {
          where: { active: true },
          select: {
            amountCents: true,
            additionalHourCents: true,
            includedHours: true,
            strategy: true,
          },
          take: 3,
        },
      },
    });

    const inquiryCounts = await database.inquiry.groupBy({
      by: ["status"],
      where: { organizationId: GENERATIONS_ORG_ID },
      _count: { _all: true },
    });
    const bookingCounts = await database.booking.groupBy({
      by: ["status"],
      where: { organizationId: GENERATIONS_ORG_ID },
      _count: { _all: true },
    });
    const communicationKinds = await database.communicationEvent.groupBy({
      by: ["kind", "status"],
      where: { organizationId: GENERATIONS_ORG_ID },
      _count: { _all: true },
    });

    const recentWpIntake = await database.conversationMessage.findMany({
      where: {
        organizationId: GENERATIONS_ORG_ID,
        senderType: "CUSTOMER",
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        createdAt: true,
        metadata: true,
        conversation: { select: { inquiryId: true } },
      },
    });
    const pricingSourceSamples: Array<{
      inquiryId: string;
      createdAt: string;
      pricingSource: string | null;
      status: string | null;
    }> = [];
    for (const row of recentWpIntake) {
      const meta = row.metadata as {
        privateCalculation?: { pricingSource?: string; status?: string };
        wpIntake?: unknown;
      } | null;
      if (!meta || typeof meta !== "object") {
        continue;
      }
      const calc = meta.privateCalculation;
      if (!calc && !("wpIntake" in meta)) {
        continue;
      }
      pricingSourceSamples.push({
        inquiryId: row.conversation.inquiryId,
        createdAt: row.createdAt.toISOString(),
        pricingSource: calc?.pricingSource ?? null,
        status: calc?.status ?? null,
      });
      if (pricingSourceSamples.length >= 10) {
        break;
      }
    }

    const operatingHoursPolicies = await database.locationOperatingHoursPolicy.findMany({
      where: { organizationId: GENERATIONS_ORG_ID },
      select: {
        id: true,
        locationId: true,
        verificationStatus: true,
        approvedAt: true,
        approvedByNote: true,
      },
    });

    const depositPercent = depositPercentFromTenant(organization.depositPercent);
    const depositExample = depositRequiredCents(SAMPLE_TOTAL_CENTS, depositPercent);

    const exclusiveRoomCoverage = WP_EXCLUSIVE_ROOM_MAPPINGS.map((mapping) => {
      const matched = mapping.resourceTypeSlugs.find((slug) =>
        resourceTypes.some((row) => row.active && row.slug === slug && row.inventoryConfigured),
      );
      const type = matched ? resourceTypes.find((row) => row.slug === matched) : null;
      return {
        room: mapping.key,
        candidateSlugs: mapping.resourceTypeSlugs,
        matchedSlug: matched ?? null,
        activeUnits: type?._count.resources ?? 0,
        inventoryConfigured: type?.inventoryConfigured ?? false,
      };
    });

    console.log(
      JSON.stringify(
        {
          mode: "read_only",
          host,
          organization: {
            ...organization,
            customerFacingDisplayName: customerFacingOrganizationName(organization.name),
            looksLikeSlugName: /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(organization.name.trim()),
          },
          locations,
          deposit: {
            configuredPercent: organization.depositPercent,
            effectivePercent: depositPercent,
            appliesTo: "All MagiCRM bookings for this organization (organization.depositPercent). Not event-type scoped.",
            rounding: "Math.trunc((totalCents * percent + 50) / 100) via percentOfCents",
            exampleTotalCents: SAMPLE_TOTAL_CENTS,
            exampleDepositRequiredCents: depositExample,
            employeeOverrideApi: "none — depositRequiredCents is computed from organization.depositPercent; no staff deposit-override action found",
            confirmationRequiresDepositCollection: false,
            confirmationSupportsExternalPaymentAttestation: true,
            partialPaymentLedgerField: "booking.depositPaidCents (no Stripe Payment model in schema yet)",
            catalogSeedDepositPercent: 25,
          },
          tax: {
            settings: taxSettings,
            locationTaxProfileCount: locationTaxProfiles.length,
            locationTaxProfiles,
            activeTaxRateScheduleCount: taxRateSchedules.length,
            taxRateSchedules,
            productTaxClassificationCount: productTaxClassCount,
            bookingAmountDueTaxNote:
              "Booking.taxCents remains 0 on amount due (R2C.2). WP F&B tax may appear as quote lineItems only.",
          },
          pricing: {
            registry: {
              source: registry.source,
              catalogVersion: registry.catalogVersion,
              approvalBasis: registry.approvalBasis,
              finalLivePriceRevalidation: registry.finalLivePriceRevalidation,
              organizationListed: usesBaseline,
            },
            pack: baselinePack
              ? {
                  pricingSource: baselinePack.pricingSource,
                  rulesVersion: baselinePack.rulesVersion,
                  pricingRevision: baselinePack.pricingRevision,
                  customPackageCount: baselinePack.packages.length,
                }
              : null,
            customerQuoteDeliveryPolicy: deliveryPolicy,
            knownCatalogDiscrepancies: WP_KNOWN_CATALOG_DISCREPANCIES,
            productionSalad: saladPrice,
            productionLowerRoom: lowerRoomPrice,
            recentInquiryPricingSources: pricingSourceSamples,
          },
          permissions: {
            missingPermissionDefinitions,
            permissionSyncGaps,
            administrators,
            eventSales,
            allGroups: groupSummaries.map((row) => ({
              systemKey: row.systemKey,
              name: row.name,
              memberCount: row.memberCount,
              capabilities: row.capabilities,
            })),
          },
          inventory: {
            productCount,
            activeProductCount,
            resourceTypeCount: resourceTypes.length,
            resourceTypes: resourceTypes.map((row) => ({
              slug: row.slug,
              name: row.name,
              active: row.active,
              inventoryConfigured: row.inventoryConfigured,
              activeUnits: row._count.resources,
              schedulingMode: row.schedulingMode,
              slotMinutes: row.slotMinutes,
            })),
            attractionCoverage: inventoryCoverage.attractions,
            exclusiveRoomCoverage,
          },
          operatingHoursPolicies,
          activity: {
            inquiriesByStatus: inquiryCounts.map((row) => ({
              status: row.status,
              count: row._count._all,
            })),
            bookingsByStatus: bookingCounts.map((row) => ({
              status: row.status,
              count: row._count._all,
            })),
            communicationsByKindStatus: communicationKinds.map((row) => ({
              kind: row.kind,
              status: row.status,
              count: row._count._all,
            })),
          },
          email: {
            EMAIL_PROVIDER: process.env.EMAIL_PROVIDER ?? "none",
            note: "Runtime Production email mode is deployment env, not a tenant DB field. Audit machine env may differ from Vercel Production.",
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
