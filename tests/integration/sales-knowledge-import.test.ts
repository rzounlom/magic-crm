import { afterAll, afterEach, describe, expect, it } from "vitest";

import { parseSalesKnowledgeDataset } from "@/server/sales-knowledge/dataset";
import { loadSalesKnowledgeDatasetFromDirectory } from "@/server/sales-knowledge/load-dataset-files";
import { importSalesKnowledgeItems } from "@/server/services/sales-knowledge-import-service";
import { searchActiveSalesKnowledge } from "@/server/services/sales-knowledge-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

afterEach(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
});

afterAll(async () => {
  await db.$disconnect();
});

async function provisionTenant(suffix: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_import_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_import_${suffix}_${crypto.randomUUID()}`,
      organizationName: `Import ${suffix}`,
      organizationSlug: `import-${suffix}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  const organization = await db.organization.findFirstOrThrow({
    where: { id: result.organizationId },
  });
  return organization;
}

describe("sales knowledge import (postgres)", () => {
  it("imports only the selected tenant and stays idempotent", async () => {
    const target = await provisionTenant("target");
    const other = await provisionTenant("other");
    const dataset = loadSalesKnowledgeDatasetFromDirectory();

    const first = await importSalesKnowledgeItems(db, {
      organizationSlug: target.slug,
      items: dataset.items,
      skippedVerificationItems: dataset.skippedVerificationItems,
    });
    expect(first.created).toBe(41);
    expect(first.updated).toBe(0);
    expect(first.skippedVerificationItems).toBe(7);

    const second = await importSalesKnowledgeItems(db, {
      organizationSlug: target.slug,
      items: dataset.items,
      skippedVerificationItems: dataset.skippedVerificationItems,
    });
    expect(second.created).toBe(0);
    expect(second.unchanged).toBe(41);
    expect(
      await db.salesKnowledgeItem.count({
        where: { organizationId: target.id },
      }),
    ).toBe(41);
    expect(
      await db.salesKnowledgeItem.count({
        where: { organizationId: other.id },
      }),
    ).toBe(0);

    await db.salesKnowledgeItem.updateMany({
      where: { organizationId: target.id, name: "Bowling" },
      data: { priceText: "OLD PRICE" },
    });
    const third = await importSalesKnowledgeItems(db, {
      organizationSlug: target.slug,
      items: dataset.items,
    });
    expect(third.updated).toBe(1);
    const bowling = await db.salesKnowledgeItem.findFirstOrThrow({
      where: { organizationId: target.id, name: "Bowling" },
    });
    expect(bowling.priceText).toContain("$30/lane");
  });

  it("keeps Raceway searchable and does not publish verification conflicts", async () => {
    const organization = await provisionTenant("search");
    const other = await provisionTenant("search-other");
    const dataset = loadSalesKnowledgeDatasetFromDirectory();
    await importSalesKnowledgeItems(db, {
      organizationSlug: organization.slug,
      items: dataset.items,
    });

    const raceway = await searchActiveSalesKnowledge(db, organization.id, { query: "raceway" });
    expect(raceway.some((item) => item.name === "Go-Kart Racing")).toBe(true);
    expect(raceway.every((item) => item.details.includes("Location:"))).toBe(true);

    const goKart = await searchActiveSalesKnowledge(db, organization.id, { query: "go kart" });
    expect(goKart.some((item) => item.name === "Go-Kart Racing")).toBe(true);
    expect(goKart.find((item) => item.name === "Go-Kart Racing")?.details).toContain(
      "Generations Raceway",
    );
    expect(goKart.find((item) => item.name === "Go-Kart Racing")?.details).not.toContain(
      "AdventurePlex bowling",
    );

    const birthdays = await searchActiveSalesKnowledge(db, organization.id, { query: "birthday" });
    expect(birthdays.some((item) => /birthday package/i.test(item.name))).toBe(true);

    const deposits = await searchActiveSalesKnowledge(db, organization.id, { query: "deposit" });
    expect(deposits.some((item) => item.name === "Birthday Party Deposit")).toBe(true);
    expect(deposits.some((item) => item.name === "Large Group / Corporate Deposit")).toBe(true);

    const hours = await searchActiveSalesKnowledge(db, organization.id, { query: "Thursday hours" });
    expect(hours.some((item) => item.name === "AdventurePlex Regular Operating Hours")).toBe(true);
    expect(hours.some((item) => /Thursday: 3:00 PM–9:00 PM/.test(item.details))).toBe(true);
    expect(hours.some((item) => /Monday: Closed for private events/.test(item.details))).toBe(true);

    const monday = await searchActiveSalesKnowledge(db, organization.id, { query: "Monday hours" });
    expect(monday.some((item) => /Closed for private events/.test(item.details))).toBe(true);

    const kidsRaceway = await searchActiveSalesKnowledge(db, organization.id, {
      query: "What can a 10 year old do at Generations Raceway?",
    });
    expect(
      kidsRaceway.some((item) =>
        ["Go-Kart Racing", "Putt Mania", "Game Zone Arcade", "Generations Raceway Attractions"].includes(
          item.name,
        ),
      ),
    ).toBe(true);
    expect(kidsRaceway.some((item) => item.name === "AdventurePlex Regular Operating Hours")).toBe(false);

    const kidsOnly = await searchActiveSalesKnowledge(db, organization.id, {
      query: "What is there for kids at the Raceway?",
    });
    expect(kidsOnly.some((item) => item.details.includes("Location: Generations Raceway"))).toBe(true);

    const besidesKarts = await searchActiveSalesKnowledge(db, organization.id, {
      query: "Does Raceway have anything besides go karts?",
    });
    expect(besidesKarts.some((item) => item.name === "Putt Mania" || item.name === "Game Zone Arcade")).toBe(
      true,
    );

    const putt = await searchActiveSalesKnowledge(db, organization.id, { query: "Tell me about Putt Mania." });
    expect(putt.some((item) => item.name === "Putt Mania")).toBe(true);

    const racewayHours = await searchActiveSalesKnowledge(db, organization.id, {
      query: "Raceway Thursday hours",
    });
    expect(racewayHours.some((item) => item.name === "AdventurePlex Regular Operating Hours")).toBe(false);

    const otherHours = await searchActiveSalesKnowledge(db, other.id, { query: "Thursday hours" });
    expect(otherHours).toEqual([]);

    const verification = parseSalesKnowledgeDataset({
      knowledge: [],
      needsVerification: JSON.parse(
        JSON.stringify([{ topic: "AdventurePlex operating hours", conflict: "Tue-Thu 3-9pm" }]),
      ),
    });
    expect(verification.items).toHaveLength(0);
    expect(verification.skippedVerificationItems).toBe(1);
  });

  it("cannot import by guessing another tenant id", async () => {
    const target = await provisionTenant("guess");
    const other = await provisionTenant("safe");
    const dataset = parseSalesKnowledgeDataset({
      knowledge: [
        {
          type: SALES_KNOWLEDGE_TYPES.FAQ,
          name: "Only Target",
          shortDescription: "Target only",
          details: "Should stay on the selected slug.",
          waiverRequired: false,
          active: true,
        },
      ],
    });

    await importSalesKnowledgeItems(db, {
      organizationSlug: target.slug,
      items: dataset.items,
    });
    await expect(
      importSalesKnowledgeItems(db, {
        organizationSlug: "not-a-real-tenant",
        items: dataset.items,
      }),
    ).rejects.toThrow(/No organization found/);
    expect(
      await db.salesKnowledgeItem.count({
        where: { organizationId: other.id },
      }),
    ).toBe(0);
  });
});
