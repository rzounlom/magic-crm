import type { PrismaClient } from "@/generated/prisma/client";
import { InquiryError } from "@/server/errors";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { recordSecurityAudit } from "@/server/services/audit";
import { SALES_KNOWLEDGE_TYPES, type SalesKnowledgeType } from "@/types/inquiry";
import { PERMISSIONS } from "@/types/permissions";

type KnowledgeDb = PrismaClient;

const KNOWLEDGE_TYPES = new Set<string>(Object.values(SALES_KNOWLEDGE_TYPES));

export type SalesKnowledgeInput = {
  type: string;
  name: string;
  shortDescription: string;
  details: string;
  priceText?: string | null;
  durationMinutes?: number | null;
  minGuests?: number | null;
  maxGuests?: number | null;
  waiverRequired?: boolean;
  active?: boolean;
  salesNotes?: string | null;
  customerFacingNotes?: string | null;
};

function assertKnowledgeInput(input: SalesKnowledgeInput) {
  if (!KNOWLEDGE_TYPES.has(input.type)) {
    throw new InquiryError("INVALID_KNOWLEDGE", "Choose a valid knowledge type.");
  }
  if (!input.name.trim() || input.name.trim().length > 160) {
    throw new InquiryError("INVALID_KNOWLEDGE", "Enter a name.");
  }
  if (!input.shortDescription.trim() || input.shortDescription.length > 280) {
    throw new InquiryError("INVALID_KNOWLEDGE", "Enter a short description.");
  }
  if (!input.details.trim() || input.details.length > 4000) {
    throw new InquiryError("INVALID_KNOWLEDGE", "Enter details.");
  }
}

export async function listSalesKnowledge(ctx: RequestContext, database: KnowledgeDb) {
  await requirePermission(ctx, PERMISSIONS.AI_VIEW, database);
  return database.salesKnowledgeItem.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function getSalesKnowledgeItem(
  ctx: RequestContext,
  database: KnowledgeDb,
  id: string,
) {
  await requirePermission(ctx, PERMISSIONS.AI_VIEW, database);
  return database.salesKnowledgeItem.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
}

export async function createSalesKnowledgeItem(
  ctx: RequestContext,
  database: KnowledgeDb,
  input: SalesKnowledgeInput,
) {
  await requirePermission(ctx, PERMISSIONS.AI_MANAGE, database);
  assertKnowledgeInput(input);
  const item = await database.salesKnowledgeItem.create({
    data: {
      organizationId: ctx.organizationId,
      type: input.type,
      name: input.name.trim(),
      shortDescription: input.shortDescription.trim(),
      details: input.details.trim(),
      priceText: input.priceText?.trim() || null,
      durationMinutes: input.durationMinutes ?? null,
      minGuests: input.minGuests ?? null,
      maxGuests: input.maxGuests ?? null,
      waiverRequired: input.waiverRequired === true,
      active: input.active !== false,
      salesNotes: input.salesNotes?.trim() || null,
      customerFacingNotes: input.customerFacingNotes?.trim() || null,
    },
  });
  await recordSecurityAudit(database, ctx, {
    action: "sales_knowledge.created",
    resourceType: "sales_knowledge_item",
    resourceId: item.id,
    metadata: { type: item.type },
  });
  return item;
}

export async function updateSalesKnowledgeItem(
  ctx: RequestContext,
  database: KnowledgeDb,
  id: string,
  input: SalesKnowledgeInput,
) {
  await requirePermission(ctx, PERMISSIONS.AI_MANAGE, database);
  assertKnowledgeInput(input);
  const existing = await database.salesKnowledgeItem.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!existing) {
    throw new InquiryError("INVALID_KNOWLEDGE", "That knowledge item was not found.");
  }
  const item = await database.salesKnowledgeItem.update({
    where: { id },
    data: {
      type: input.type,
      name: input.name.trim(),
      shortDescription: input.shortDescription.trim(),
      details: input.details.trim(),
      priceText: input.priceText?.trim() || null,
      durationMinutes: input.durationMinutes ?? null,
      minGuests: input.minGuests ?? null,
      maxGuests: input.maxGuests ?? null,
      waiverRequired: input.waiverRequired === true,
      active: input.active !== false,
      salesNotes: input.salesNotes?.trim() || null,
      customerFacingNotes: input.customerFacingNotes?.trim() || null,
    },
  });
  await recordSecurityAudit(database, ctx, {
    action: "sales_knowledge.updated",
    resourceType: "sales_knowledge_item",
    resourceId: item.id,
    metadata: { type: item.type, active: item.active },
  });
  return item;
}

const KNOWLEDGE_SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "am",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "can",
  "could",
  "would",
  "should",
  "will",
  "what",
  "which",
  "who",
  "whom",
  "where",
  "when",
  "why",
  "how",
  "at",
  "to",
  "for",
  "of",
  "in",
  "on",
  "with",
  "from",
  "by",
  "about",
  "into",
  "over",
  "after",
  "before",
  "than",
  "then",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "or",
  "and",
  "but",
  "not",
  "no",
  "yes",
  "if",
  "so",
  "as",
  "there",
  "their",
  "they",
  "them",
  "we",
  "you",
  "your",
  "my",
  "me",
  "our",
  "us",
  "have",
  "has",
  "had",
  "besides",
  "anything",
  "something",
  "tell",
  "also",
  "please",
  "just",
  "only",
]);

const KNOWLEDGE_SEARCH_CANDIDATE_LIMIT = 40;
const KNOWLEDGE_SEARCH_RESULT_LIMIT = 8;

export type SalesKnowledgeSearchRecord = {
  name: string;
  shortDescription: string;
  details: string;
  customerFacingNotes?: string | null;
  salesNotes?: string | null;
  type: string;
};

export function salesKnowledgeSearchTerms(query: string): string[] {
  const normalized = query
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ");
  const terms = normalized.split(/\s+/).filter((term) => {
    if (term.length < 2) {
      return false;
    }
    if (KNOWLEDGE_SEARCH_STOP_WORDS.has(term)) {
      return false;
    }
    if (/^\d{1,2}$/.test(term)) {
      return false;
    }
    return true;
  });
  return [...new Set(terms)].slice(0, 8);
}

export function rankSalesKnowledgeItems<T extends SalesKnowledgeSearchRecord>(
  items: T[],
  terms: string[],
  limit = KNOWLEDGE_SEARCH_RESULT_LIMIT,
): T[] {
  if (terms.length === 0) {
    return items.slice(0, limit);
  }
  const locationTerms = terms.filter((term) =>
    items.some((item) => knowledgeLocationLine(item.details).includes(term)),
  );
  return [...items]
    .map((item) => ({ item, score: scoreSalesKnowledgeMatch(item, terms, locationTerms) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function scoreSalesKnowledgeMatch(
  item: SalesKnowledgeSearchRecord,
  terms: string[],
  locationTerms: string[] = [],
): number {
  let score = 0;
  const locationLine = knowledgeLocationLine(item.details);
  if (locationTerms.length > 0) {
    if (locationTerms.some((term) => locationLine.includes(term))) {
      score += 6;
    } else if (locationLine) {
      score -= 8;
    }
  }
  for (const term of terms) {
    if (fieldContains(item.name, term)) {
      score += 4;
      continue;
    }
    if (locationLine.includes(term)) {
      score += 3;
      continue;
    }
    if (
      fieldContains(item.shortDescription, term) ||
      fieldContains(item.details, term) ||
      fieldContains(item.customerFacingNotes, term) ||
      fieldContains(item.type, term)
    ) {
      score += 1;
      continue;
    }
    if (fieldContains(item.salesNotes, term)) {
      score += 1;
    }
  }
  return score;
}

export async function searchActiveSalesKnowledge(
  database: KnowledgeDb,
  organizationId: string,
  input: { query: string; type?: SalesKnowledgeType },
) {
  const terms = salesKnowledgeSearchTerms(input.query);
  const candidates = await database.salesKnowledgeItem.findMany({
    where: {
      organizationId,
      active: true,
      ...(input.type ? { type: input.type } : {}),
      ...(terms.length > 0
        ? {
            OR: terms.flatMap((term) => [
              { name: { contains: term, mode: "insensitive" as const } },
              { shortDescription: { contains: term, mode: "insensitive" as const } },
              { details: { contains: term, mode: "insensitive" as const } },
              { customerFacingNotes: { contains: term, mode: "insensitive" as const } },
              { salesNotes: { contains: term, mode: "insensitive" as const } },
              { type: { contains: term, mode: "insensitive" as const } },
            ]),
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: terms.length > 0 ? KNOWLEDGE_SEARCH_CANDIDATE_LIMIT : KNOWLEDGE_SEARCH_RESULT_LIMIT,
  });
  return rankSalesKnowledgeItems(candidates, terms);
}

function knowledgeLocationLine(details: string): string {
  const firstLine = details.split("\n")[0]?.toLowerCase() ?? "";
  return firstLine.startsWith("location:") ? firstLine : "";
}

function fieldContains(value: string | null | undefined, term: string): boolean {
  return (value ?? "").toLowerCase().includes(term);
}
