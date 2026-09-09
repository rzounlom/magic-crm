import { MAX_BULK_RESOURCES } from "@/types/resource-schedule";

export function resourceTypeSlugFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "resource";
}

export function numberedResourceNames(pattern: string, count: number, startAt: number): string[] {
  const safeCount = Math.min(MAX_BULK_RESOURCES, Math.max(0, Math.floor(count)));
  const template = pattern.includes("{n}") ? pattern.trim() : `${pattern.trim()} {n}`;
  return Array.from({ length: safeCount }, (_, index) =>
    template.replaceAll("{n}", String(startAt + index)),
  );
}

export function resourceNotesFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const notes = (metadata as { notes?: unknown }).notes;
  return typeof notes === "string" && notes.trim() ? notes.trim() : null;
}

export function resourceMetadata(input: {
  notes?: string | null;
  capacityKind?: "per_unit" | "occupancy" | null;
}): Record<string, string> | undefined {
  const payload: Record<string, string> = {};
  if (input.notes?.trim()) {
    payload.notes = input.notes.trim();
  }
  if (input.capacityKind) {
    payload.capacityKind = input.capacityKind;
  }
  return Object.keys(payload).length > 0 ? payload : undefined;
}
