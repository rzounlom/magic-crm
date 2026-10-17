import { randomBytes } from "node:crypto";

import {
  SCENARIO_LAB_TIMELINE_KINDS,
  type ScenarioLabTimelineEntry,
  type ScenarioLabTimelineKind,
} from "@/server/scenario-lab/constants";

export function createTimelineEntry(input: {
  kind: ScenarioLabTimelineKind;
  code: string;
  message: string;
  at?: Date;
}): ScenarioLabTimelineEntry {
  return {
    id: `tle_${randomBytes(8).toString("hex")}`,
    at: (input.at ?? new Date()).toISOString(),
    kind: input.kind,
    code: input.code,
    message: input.message,
  };
}

export function parseTimeline(value: unknown): ScenarioLabTimelineEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: ScenarioLabTimelineEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.at !== "string" ||
      typeof row.code !== "string" ||
      typeof row.message !== "string" ||
      typeof row.kind !== "string"
    ) {
      continue;
    }
    if (!(Object.values(SCENARIO_LAB_TIMELINE_KINDS) as string[]).includes(row.kind)) {
      continue;
    }
    entries.push({
      id: row.id,
      at: row.at,
      kind: row.kind as ScenarioLabTimelineKind,
      code: row.code,
      message: row.message,
    });
  }
  return entries;
}

export function appendTimeline(
  existing: unknown,
  entry: ScenarioLabTimelineEntry,
): ScenarioLabTimelineEntry[] {
  return [...parseTimeline(existing), entry];
}
