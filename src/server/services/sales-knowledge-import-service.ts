import type { PrismaClient } from "@/generated/prisma/client";
import {
  knowledgeIdentity,
  type MappedSalesKnowledgeRecord,
} from "@/server/sales-knowledge/dataset";
import { SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";

type ImportDb = PrismaClient;

export type SalesKnowledgeImportCounts = {
  created: number;
  updated: number;
  unchanged: number;
  skippedVerificationItems: number;
  byType: Record<string, number>;
};

export type SalesKnowledgeImportResult = SalesKnowledgeImportCounts & {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
};

const EMPTY_TYPE_COUNTS = (): Record<string, number> =>
  Object.fromEntries(Object.values(SALES_KNOWLEDGE_TYPES).map((type) => [type, 0]));

export async function importSalesKnowledgeItems(
  database: ImportDb,
  input: {
    organizationSlug: string;
    items: MappedSalesKnowledgeRecord[];
    skippedVerificationItems?: number;
  },
): Promise<SalesKnowledgeImportResult> {
  const organization = await database.organization.findFirst({
    where: { slug: input.organizationSlug.trim().toLowerCase() },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) {
    throw new Error(`No organization found for slug "${input.organizationSlug}".`);
  }

  const counts: SalesKnowledgeImportCounts = {
    created: 0,
    updated: 0,
    unchanged: 0,
    skippedVerificationItems: input.skippedVerificationItems ?? 0,
    byType: EMPTY_TYPE_COUNTS(),
  };

  for (const item of input.items) {
    counts.byType[item.type] = (counts.byType[item.type] ?? 0) + 1;
    const existing = await database.salesKnowledgeItem.findFirst({
      where: {
        organizationId: organization.id,
        type: item.type,
        name: item.name,
      },
    });
    if (!existing) {
      await database.salesKnowledgeItem.create({
        data: {
          organizationId: organization.id,
          ...item,
        },
      });
      counts.created += 1;
      continue;
    }
    if (sameKnowledge(existing, item)) {
      counts.unchanged += 1;
      continue;
    }
    await database.salesKnowledgeItem.update({
      where: { id: existing.id },
      data: item,
    });
    counts.updated += 1;
  }

  return {
    ...counts,
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
  };
}

export function summarizeImportIdentity(item: MappedSalesKnowledgeRecord): string {
  return knowledgeIdentity(item);
}

function sameKnowledge(
  existing: {
    type: string;
    name: string;
    shortDescription: string;
    details: string;
    priceText: string | null;
    durationMinutes: number | null;
    minGuests: number | null;
    maxGuests: number | null;
    waiverRequired: boolean;
    active: boolean;
    customerFacingNotes: string | null;
    salesNotes: string | null;
  },
  item: MappedSalesKnowledgeRecord,
): boolean {
  return (
    existing.type === item.type &&
    existing.name === item.name &&
    existing.shortDescription === item.shortDescription &&
    existing.details === item.details &&
    existing.priceText === item.priceText &&
    existing.durationMinutes === item.durationMinutes &&
    existing.minGuests === item.minGuests &&
    existing.maxGuests === item.maxGuests &&
    existing.waiverRequired === item.waiverRequired &&
    existing.active === item.active &&
    existing.customerFacingNotes === item.customerFacingNotes &&
    existing.salesNotes === item.salesNotes
  );
}
