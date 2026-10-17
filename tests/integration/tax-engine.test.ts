import { afterAll, afterEach, describe, expect, it } from "vitest";

import { calculateTax } from "@/server/catalog/tax";
import { loadTaxConfigForProposal, toTaxCalculationInput } from "@/server/catalog/load-tax-config";
import { provisionOrganization } from "@/server/services/provision-organization";
import {
  PRODUCT_TAX_CLASSES,
  PRODUCT_TAXABILITIES,
  TAX_APPROVAL_STATUSES,
  TAX_CALCULATION_STATUSES,
  TAX_TYPES,
  TAX_VERIFICATION_STATUSES,
} from "@/types/tax";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";
import { futureEventDate } from "../helpers/future-event-date";

const EVENT_DATE = futureEventDate(28);

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

afterEach(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
}, 60_000);

afterAll(async () => {
  await db.$disconnect();
});

async function provision() {
  const provisioned = await provisionOrganization(
    {
      clerkUserId: `user_tax_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_tax_${crypto.randomUUID()}`,
      organizationName: "Tax Tenant",
      organizationSlug: `tax-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(provisioned.organizationId);
  const location = await db.location.findFirstOrThrow({
    where: { organizationId: provisioned.organizationId },
  });
  return { organizationId: provisioned.organizationId, locationId: location.id };
}

describe("tax engine persistence and gating", () => {
  it("defaults new tenants to disabled tax with no amount-due impact", async () => {
    const { organizationId, locationId } = await provision();
    const settings = await db.organizationTaxSettings.findUnique({ where: { organizationId } });
    expect(settings).toBeNull();

    const config = await loadTaxConfigForProposal(db, organizationId, locationId);
    const result = calculateTax(
      toTaxCalculationInput({
        organizationId,
        locationId,
        taxDate: EVENT_DATE,
        lineItems: [
          {
            productId: "p1",
            slug: "pizza",
            name: "Pizza",
            kind: "FOOD",
            quantity: 1,
            totalCents: 2000,
          },
        ],
        config,
      }),
    );
    expect(result.status).toBe(TAX_CALCULATION_STATUSES.DISABLED);
    expect(result.taxTotalCents).toBeNull();
    expect(result.chargeable).toBe(false);
  });

  it("isolates location jurisdictions and requires activation + classification", async () => {
    const a = await provision();
    const b = await provision();

    await db.organizationTaxSettings.create({
      data: {
        organizationId: a.organizationId,
        calculationEnabled: true,
        collectionEnabled: false,
      },
    });
    await db.locationTaxProfile.create({
      data: {
        organizationId: a.organizationId,
        locationId: a.locationId,
        streetLine1: "1018 West Edison Road",
        city: "Mishawaka",
        region: "IN",
        postalCode: "46545",
        country: "US",
        countyName: "St. Joseph",
        jurisdictionCode: "US-IN-ST-JOSEPH",
        jurisdictionResolved: true,
        taxTimeZone: "America/Indiana/Indianapolis",
      },
    });
    await db.taxRateSchedule.create({
      data: {
        organizationId: a.organizationId,
        locationId: a.locationId,
        taxType: TAX_TYPES.STATE_SALES,
        jurisdictionCode: "US-IN-ST-JOSEPH",
        rateBps: 700,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        sourceUrl: "https://www.in.gov/dor/about/news-publications/our-team/tax-types/",
        sourceCitation: "IN DOR 7% research fixture — not Generations activation",
        verificationStatus: TAX_VERIFICATION_STATUSES.VERIFIED,
        approvalStatus: TAX_APPROVAL_STATUSES.APPROVED,
        active: true,
      },
    });

    // Org B has a rate row but calculation remains disabled and different location.
    await db.organizationTaxSettings.create({
      data: { organizationId: b.organizationId, calculationEnabled: false, collectionEnabled: false },
    });
    await db.locationTaxProfile.create({
      data: {
        organizationId: b.organizationId,
        locationId: b.locationId,
        jurisdictionCode: "US-XX-OTHER",
        jurisdictionResolved: true,
        taxTimeZone: "America/New_York",
      },
    });
    await db.taxRateSchedule.create({
      data: {
        organizationId: b.organizationId,
        locationId: b.locationId,
        taxType: TAX_TYPES.STATE_SALES,
        jurisdictionCode: "US-XX-OTHER",
        rateBps: 1000,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        verificationStatus: TAX_VERIFICATION_STATUSES.VERIFIED,
        approvalStatus: TAX_APPROVAL_STATUSES.APPROVED,
        active: true,
      },
    });

    const category = await db.productCategory.create({
      data: {
        organizationId: a.organizationId,
        slug: "food",
        name: "Food",
        sortOrder: 1,
      },
    });
    const product = await db.product.create({
      data: {
        organizationId: a.organizationId,
        categoryId: category.id,
        slug: "pizza-pitcher-combo",
        name: "Pizza & Pitcher",
        kind: "FOOD",
        audience: "ALL",
        active: true,
      },
    });
    await db.productTaxClassification.create({
      data: {
        organizationId: a.organizationId,
        productId: product.id,
        componentKey: "",
        classification: PRODUCT_TAX_CLASSES.PREPARED_FOOD,
        taxability: PRODUCT_TAXABILITIES.TAXABLE,
      },
    });

    const configA = await loadTaxConfigForProposal(db, a.organizationId, a.locationId);
    const configB = await loadTaxConfigForProposal(db, b.organizationId, b.locationId);
    expect(configA.rates[0]?.rateBps).toBe(700);
    expect(configB.rates[0]?.rateBps).toBe(1000);
    // No cross-tenant rate leakage
    expect(configA.rates.every((row) => row.locationId === a.locationId)).toBe(true);

    const calculated = calculateTax(
      toTaxCalculationInput({
        organizationId: a.organizationId,
        locationId: a.locationId,
        taxDate: EVENT_DATE,
        lineItems: [
          {
            productId: product.id,
            slug: product.slug,
            name: product.name,
            kind: "FOOD",
            quantity: 1,
            totalCents: 2000,
          },
        ],
        config: configA,
      }),
    );
    expect(calculated.status).toBe(TAX_CALCULATION_STATUSES.CALCULATED);
    expect(calculated.taxTotalCents).toBe(140);
    expect(calculated.chargeable).toBe(false);

    const disabledB = calculateTax(
      toTaxCalculationInput({
        organizationId: b.organizationId,
        locationId: b.locationId,
        taxDate: EVENT_DATE,
        lineItems: [
          {
            productId: "x",
            slug: "x",
            name: "X",
            kind: "FOOD",
            quantity: 1,
            totalCents: 2000,
          },
        ],
        config: configB,
      }),
    );
    expect(disabledB.status).toBe(TAX_CALCULATION_STATUSES.DISABLED);

    // Rate existence without classification → incomplete
    await db.productTaxClassification.deleteMany({ where: { organizationId: a.organizationId } });
    const configNoClass = await loadTaxConfigForProposal(db, a.organizationId, a.locationId);
    const unresolved = calculateTax(
      toTaxCalculationInput({
        organizationId: a.organizationId,
        locationId: a.locationId,
        taxDate: EVENT_DATE,
        lineItems: [
          {
            productId: product.id,
            slug: product.slug,
            name: product.name,
            kind: "FOOD",
            quantity: 1,
            totalCents: 2000,
          },
        ],
        config: configNoClass,
      }),
    );
    expect(unresolved.status).toBe(TAX_CALCULATION_STATUSES.UNRESOLVED_CLASSIFICATION);
    expect(unresolved.taxTotalCents).toBeNull();
  });

  it("does not silently inherit another location jurisdiction within an organization", async () => {
    const { organizationId, locationId } = await provision();
    const second = await db.location.create({
      data: {
        organizationId,
        name: "Second",
        slug: `second-${crypto.randomUUID().slice(0, 8)}`,
        timezone: "America/Indiana/Indianapolis",
      },
    });
    await db.organizationTaxSettings.create({
      data: { organizationId, calculationEnabled: true, collectionEnabled: false },
    });
    await db.locationTaxProfile.create({
      data: {
        organizationId,
        locationId,
        jurisdictionCode: "US-IN-ST-JOSEPH",
        jurisdictionResolved: true,
        taxTimeZone: "America/Indiana/Indianapolis",
      },
    });
    const configSecond = await loadTaxConfigForProposal(db, organizationId, second.id);
    expect(configSecond.locationProfile?.jurisdictionResolved).toBe(false);
    const result = calculateTax(
      toTaxCalculationInput({
        organizationId,
        locationId: second.id,
        taxDate: EVENT_DATE,
        lineItems: [
          {
            productId: "p",
            slug: "p",
            name: "P",
            kind: "FOOD",
            quantity: 1,
            totalCents: 1000,
          },
        ],
        config: configSecond,
      }),
    );
    expect(result.status).toBe(TAX_CALCULATION_STATUSES.UNRESOLVED_JURISDICTION);
  });
});
