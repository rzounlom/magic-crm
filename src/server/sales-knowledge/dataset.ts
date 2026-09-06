import { SALES_KNOWLEDGE_TYPES, type SalesKnowledgeType } from "@/types/inquiry";

export const SALES_KNOWLEDGE_DATASET_LIMITS = {
  name: 160,
  shortDescription: 280,
  details: 4000,
  priceText: 160,
  notes: 2000,
} as const;

export type RawSalesKnowledgeRecord = {
  type: string;
  name: string;
  shortDescription: string;
  details: string;
  priceText?: string | null;
  durationMinutes?: number | null;
  minGuests?: number | null;
  maxGuests?: number | null;
  waiverRequired: boolean;
  active: boolean;
  customerFacingNotes?: string | null;
  salesNotes?: string | null;
  locationLabel?: string | null;
  sourceUrl?: string | null;
};

export type RawNeedsVerificationRecord = {
  topic?: string;
  status?: string;
  conflict?: string;
};

export type MappedSalesKnowledgeRecord = {
  type: SalesKnowledgeType;
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
};

export type SalesKnowledgeDatasetParseResult = {
  items: MappedSalesKnowledgeRecord[];
  skippedVerificationItems: number;
  ignoredSourceUrls: number;
};

export class SalesKnowledgeDatasetError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid sales knowledge dataset:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "SalesKnowledgeDatasetError";
    this.issues = issues;
  }
}

const KNOWLEDGE_TYPES = new Set<string>(Object.values(SALES_KNOWLEDGE_TYPES));

export function locationPrefix(locationLabel: string): string {
  return `Location: ${locationLabel.trim()}`;
}

export function mapSalesKnowledgeRecord(record: RawSalesKnowledgeRecord): MappedSalesKnowledgeRecord {
  const type = record.type as SalesKnowledgeType;
  const details = withLocationContext(record.details.trim(), record.locationLabel);
  return {
    type,
    name: record.name.trim(),
    shortDescription: record.shortDescription.trim(),
    details,
    priceText: emptyToNull(record.priceText),
    durationMinutes: record.durationMinutes ?? null,
    minGuests: record.minGuests ?? null,
    maxGuests: record.maxGuests ?? null,
    waiverRequired: record.waiverRequired === true,
    active: record.active === true,
    customerFacingNotes: emptyToNull(record.customerFacingNotes),
    salesNotes: emptyToNull(record.salesNotes),
  };
}

export function parseSalesKnowledgeDataset(input: {
  knowledge: unknown;
  needsVerification?: unknown;
}): SalesKnowledgeDatasetParseResult {
  const issues: string[] = [];
  if (!Array.isArray(input.knowledge)) {
    throw new SalesKnowledgeDatasetError(["sales-knowledge.json must be an array"]);
  }

  const seen = new Set<string>();
  const items: MappedSalesKnowledgeRecord[] = [];
  let ignoredSourceUrls = 0;

  input.knowledge.forEach((entry, index) => {
    const label = `record ${index + 1}`;
    if (!isRecord(entry)) {
      issues.push(`${label}: must be an object`);
      return;
    }
    const raw = entry as RawSalesKnowledgeRecord;
    issues.push(...validateRawRecord(raw, label));
    if (typeof raw.sourceUrl === "string" && raw.sourceUrl.trim()) {
      ignoredSourceUrls += 1;
    }
    const key = `${String(raw.type ?? "").trim()}::${String(raw.name ?? "").trim()}`;
    if (seen.has(key)) {
      issues.push(`${label}: duplicate type+name "${key}"`);
    }
    seen.add(key);
    if (issues.length === 0) {
      const mapped = mapSalesKnowledgeRecord(raw);
      issues.push(...validateMappedRecord(mapped, label));
      items.push(mapped);
    }
  });

  let skippedVerificationItems = 0;
  if (input.needsVerification !== undefined) {
    if (!Array.isArray(input.needsVerification)) {
      issues.push("needs-verification.json must be an array");
    } else {
      skippedVerificationItems = input.needsVerification.length;
    }
  }

  if (issues.length > 0) {
    throw new SalesKnowledgeDatasetError(issues);
  }

  return { items, skippedVerificationItems, ignoredSourceUrls };
}

export function knowledgeIdentity(item: Pick<MappedSalesKnowledgeRecord, "type" | "name">): string {
  return `${item.type}::${item.name}`;
}

function withLocationContext(details: string, locationLabel: string | null | undefined): string {
  const label = locationLabel?.trim();
  if (!label) {
    return details;
  }
  const prefix = locationPrefix(label);
  if (details.startsWith(prefix)) {
    return details;
  }
  return `${prefix}\n\n${details}`;
}

function validateRawRecord(record: RawSalesKnowledgeRecord, label: string): string[] {
  const issues: string[] = [];
  if (!KNOWLEDGE_TYPES.has(record.type)) {
    issues.push(`${label}: invalid type`);
  }
  if (typeof record.name !== "string" || !record.name.trim()) {
    issues.push(`${label}: name is required`);
  } else if (record.name.trim().length > SALES_KNOWLEDGE_DATASET_LIMITS.name) {
    issues.push(`${label}: name exceeds ${SALES_KNOWLEDGE_DATASET_LIMITS.name} characters`);
  }
  if (typeof record.shortDescription !== "string" || !record.shortDescription.trim()) {
    issues.push(`${label}: shortDescription is required`);
  } else if (record.shortDescription.trim().length > SALES_KNOWLEDGE_DATASET_LIMITS.shortDescription) {
    issues.push(`${label}: shortDescription exceeds ${SALES_KNOWLEDGE_DATASET_LIMITS.shortDescription} characters`);
  }
  if (typeof record.details !== "string" || !record.details.trim()) {
    issues.push(`${label}: details are required`);
  }
  if (typeof record.waiverRequired !== "boolean") {
    issues.push(`${label}: waiverRequired must be a boolean`);
  }
  if (typeof record.active !== "boolean") {
    issues.push(`${label}: active must be a boolean`);
  }
  issues.push(...validateOptionalNumber(record.durationMinutes, `${label}: durationMinutes`, { positive: true }));
  issues.push(...validateOptionalNumber(record.minGuests, `${label}: minGuests`, { min: 0 }));
  issues.push(...validateOptionalNumber(record.maxGuests, `${label}: maxGuests`, { min: 0 }));
  if (
    isPresentNumber(record.minGuests) &&
    isPresentNumber(record.maxGuests) &&
    record.minGuests > record.maxGuests
  ) {
    issues.push(`${label}: minGuests cannot be greater than maxGuests`);
  }
  if (record.priceText != null && String(record.priceText).trim().length > SALES_KNOWLEDGE_DATASET_LIMITS.priceText) {
    issues.push(`${label}: priceText exceeds ${SALES_KNOWLEDGE_DATASET_LIMITS.priceText} characters`);
  }
  return issues;
}

function validateMappedRecord(record: MappedSalesKnowledgeRecord, label: string): string[] {
  const issues: string[] = [];
  if (record.details.length > SALES_KNOWLEDGE_DATASET_LIMITS.details) {
    issues.push(`${label}: details exceed ${SALES_KNOWLEDGE_DATASET_LIMITS.details} characters after mapping`);
  }
  if (record.customerFacingNotes && record.customerFacingNotes.length > SALES_KNOWLEDGE_DATASET_LIMITS.notes) {
    issues.push(`${label}: customerFacingNotes exceed ${SALES_KNOWLEDGE_DATASET_LIMITS.notes} characters`);
  }
  if (record.salesNotes && record.salesNotes.length > SALES_KNOWLEDGE_DATASET_LIMITS.notes) {
    issues.push(`${label}: salesNotes exceed ${SALES_KNOWLEDGE_DATASET_LIMITS.notes} characters`);
  }
  return issues;
}

function validateOptionalNumber(
  value: number | null | undefined,
  label: string,
  options: { positive?: boolean; min?: number },
): string[] {
  if (value == null) {
    return [];
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return [`${label} must be an integer`];
  }
  if (options.positive && value <= 0) {
    return [`${label} must be positive`];
  }
  if (options.min !== undefined && value < options.min) {
    return [`${label} must be at least ${options.min}`];
  }
  return [];
}

function isPresentNumber(value: number | null | undefined): value is number {
  return typeof value === "number";
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
