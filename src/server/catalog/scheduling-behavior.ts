import { formatDurationMinutes } from "@/lib/event-planner/labels";
import { PRODUCT_SCHEDULING_BEHAVIORS, type ProductSchedulingBehavior } from "@/types/catalog";

export type ResolvedSchedulingRole = ProductSchedulingBehavior | "DINING";

const STORED_BEHAVIORS = new Set<string>(Object.values(PRODUCT_SCHEDULING_BEHAVIORS));

export function resolveSchedulingBehavior(product: {
  kind: string;
  schedulingBehavior?: string | null;
  durationMinutes?: number | null;
  hasResourceRequirements?: boolean;
}): ResolvedSchedulingRole {
  const explicit = product.schedulingBehavior?.trim() ?? "";
  if (STORED_BEHAVIORS.has(explicit)) {
    if (explicit === PRODUCT_SCHEDULING_BEHAVIORS.SCHEDULED && product.kind === "FOOD") {
      return "DINING";
    }
    return explicit as ProductSchedulingBehavior;
  }
  if (product.kind === "FOOD") {
    return "DINING";
  }
  if (product.kind === "RENTAL") {
    return PRODUCT_SCHEDULING_BEHAVIORS.SPACE_WINDOW;
  }
  const timed = (product.durationMinutes ?? 0) > 0;
  if (product.kind === "ADD_ON" && !(timed && product.hasResourceRequirements)) {
    return PRODUCT_SCHEDULING_BEHAVIORS.NON_SCHEDULED;
  }
  if (!timed && !product.hasResourceRequirements) {
    return PRODUCT_SCHEDULING_BEHAVIORS.NON_SCHEDULED;
  }
  return PRODUCT_SCHEDULING_BEHAVIORS.SCHEDULED;
}

export function isSampleItinerarySegment(segment: { role?: string | null }): boolean {
  return segment.role !== "SPACE";
}

/** Drop a leading or trailing duration so customer copy can name the activity. */
export function customerActivityName(name: string): string {
  return (
    name
      .replace(/^\d+\s*(?:hours|hour|minutes|minute|mins|min)\s+/i, "")
      .replace(/\s+[-–]\s+\d+\s*(?:minutes|minute|mins|min|hours|hour)\s*$/i, "")
      .trim() || name
  );
}

export function addedScheduledActivities(input: {
  sequenced: Array<{ name: string; durationMinutes: number }>;
  baselineNames: string[];
}): Array<{ name: string; durationMinutes: number }> {
  const baseline = new Set(input.baselineNames.map((name) => customerActivityName(name)));
  const seen = new Set<string>();
  const added: Array<{ name: string; durationMinutes: number }> = [];
  for (const item of input.sequenced) {
    if (!item.durationMinutes || item.durationMinutes <= 0) {
      continue;
    }
    const name = customerActivityName(item.name);
    if (baseline.has(name) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    added.push({ name, durationMinutes: item.durationMinutes });
  }
  return added;
}

function joinActivityNames(names: string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function optionExperienceSentence(addedNames: string[], fallback: string): string {
  if (addedNames.length === 1) {
    return `Adds ${addedNames[0]} for a broader experience.`;
  }
  if (addedNames.length > 1) {
    return `Adds ${joinActivityNames(addedNames)} for a broader experience.`;
  }
  return fallback;
}

export function eventDurationExplanation(input: {
  requestedMinutes: number | null;
  eventLengthMinutes: number;
  sequenced: Array<{ name: string; durationMinutes: number; role?: string | null }>;
  roomMinutes: number;
  /** Scheduled names already on the requested/base option. Items in this list are not treated as the reason the option is longer. */
  baselineNames?: string[];
}): string | null {
  const requestedMinutes = input.requestedMinutes;
  if (!requestedMinutes || input.eventLengthMinutes <= requestedMinutes) {
    return null;
  }
  const lengthLabel = formatDurationMinutes(input.eventLengthMinutes);
  const scheduledTotal = input.sequenced.reduce((sum, row) => sum + row.durationMinutes, 0);
  // A longer room entitlement is not scheduled content, so it does not explain event length.
  if (scheduledTotal <= requestedMinutes) {
    return null;
  }
  // A dining swap keeps the same block. Extra time comes from activities.
  const activities = input.sequenced.filter((row) => row.role !== "DINING");
  const added = addedScheduledActivities({
    sequenced: activities,
    baselineNames: input.baselineNames ?? [],
  });
  const delta = input.eventLengthMinutes - requestedMinutes;
  const addedTotal = added.reduce((sum, row) => sum + row.durationMinutes, 0);
  if (added.length === 1 && added[0]!.durationMinutes === delta) {
    const span = added[0]!.durationMinutes === 60 ? "an hour" : formatDurationMinutes(added[0]!.durationMinutes);
    return `This option is ${lengthLabel} because it adds ${span} of ${added[0]!.name}.`;
  }
  if (added.length > 1 && addedTotal === delta) {
    return `This option is ${lengthLabel} because it adds ${joinActivityNames(added.map((row) => row.name))}.`;
  }
  return `This option is ${lengthLabel} because it includes additional scheduled activities.`;
}
