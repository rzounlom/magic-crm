import { estimateKnowledgePriceCents } from "@/server/event-planner/parse-knowledge-price";
import {
  notesExcludeItem,
  notesPreferItem,
  parseInquiryNotes,
  type InquiryNoteSignals,
} from "@/server/event-planner/inquiry-notes";
import {
  AVAILABILITY_UNVALIDATED_NOTE,
  CUSTOMER_AVAILABILITY_NOTE,
  DINING_PREFERENCE_LABELS,
  EVENT_PLAN_TIER_TITLES,
  EVENT_PLAN_TIERS,
  type EventPlanActivity,
  type EventPlanDining,
  type EventPlanDraft,
  type EventPlanPayload,
  type EventPlanRanking,
  type EventPlanSpace,
  type EventPlanTier,
} from "@/types/event-planner";
import { SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";

export type PlannerKnowledgeItem = {
  id: string;
  type: string;
  name: string;
  shortDescription: string;
  details: string;
  priceText: string | null;
  durationMinutes: number | null;
  minGuests: number | null;
  maxGuests: number | null;
  customerFacingNotes: string | null;
  salesNotes: string | null;
};

export type PlannerInquiryFacts = {
  eventType: string | null;
  eventGoal: string | null;
  guestCount: number;
  guestMix: string | null;
  desiredDurationMinutes: number | null;
  desiredDate: string | null;
  desiredStartTime: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  diningPreference: string | null;
  spacePreference: string | null;
  attractionInterestIds: string[];
  customerNotes: string | null;
};

export type BuildEventPlansInput = {
  inquiry: PlannerInquiryFacts;
  knowledge: PlannerKnowledgeItem[];
  similarActivityNames?: string[];
  currency: string;
};

const AGE_MINIMUM_PATTERN = /\b(?:must be |participants must be |ages?\s+)?(\d{2})\s*\+/i;

type ScoredItem = { item: PlannerKnowledgeItem; score: number };

function combinedText(item: PlannerKnowledgeItem): string {
  return [item.name, item.shortDescription, item.details, item.customerFacingNotes, item.salesNotes]
    .filter(Boolean)
    .join("\n");
}

function knowledgeMinimumAge(item: PlannerKnowledgeItem): number | null {
  const match = combinedText(item).match(AGE_MINIMUM_PATTERN);
  if (!match) {
    return null;
  }
  const age = Number.parseInt(match[1], 10);
  return Number.isFinite(age) ? age : null;
}

function assumedAgeForMix(guestMix: string | null, youngerKids: boolean): number {
  if (youngerKids || guestMix === "mostly_children") {
    return 8;
  }
  if (guestMix === "teens") {
    return 15;
  }
  if (guestMix === "mixed_ages") {
    return 12;
  }
  return 21;
}

export function isAttractionAgeEligible(
  item: PlannerKnowledgeItem,
  guestMix: string | null,
  youngerKids = false,
): boolean {
  const minimum = knowledgeMinimumAge(item);
  if (minimum == null) {
    return true;
  }
  return assumedAgeForMix(guestMix, youngerKids) >= minimum;
}

export function isLaneLike(item: PlannerKnowledgeItem): boolean {
  return /lane|bay|throwing station/i.test(combinedText(item));
}

export function isFoodItem(item: PlannerKnowledgeItem): boolean {
  if (item.type === SALES_KNOWLEDGE_TYPES.FOOD_BEVERAGE) {
    return true;
  }
  return (
    item.type === SALES_KNOWLEDGE_TYPES.ADD_ON &&
    /food|pizza|cater|dining|menu|appetizer|entree|tableside|slider|fajita/i.test(combinedText(item))
  );
}

export function isSpaceItem(item: PlannerKnowledgeItem): boolean {
  return /private (event )?room|event space|party room|meeting room/i.test(combinedText(item));
}

function eventTypeKeywords(eventType: string | null): string[] {
  const type = (eventType ?? "").toLowerCase();
  if (type.includes("corporate")) {
    return ["team", "race", "kart", "axe", "bowling", "competitive", "social"];
  }
  if (type.includes("school") || type.includes("church") || type.includes("youth") || type.includes("nonprofit")) {
    return ["laser", "bowling", "mini golf", "climb", "arcade", "pizza"];
  }
  if (type.includes("birthday")) {
    return ["laser", "bowling", "party", "arcade", "kart", "birthday"];
  }
  if (type.includes("sports")) {
    return ["kart", "laser", "bowling", "competitive", "race"];
  }
  if (type.includes("private") || type.includes("family")) {
    return ["mini golf", "bowling", "laser", "kart", "family"];
  }
  return [];
}

function goalKeywords(eventGoal: string | null): string[] {
  const goal = (eventGoal ?? "").toLowerCase();
  if (goal.includes("team")) {
    return ["team", "kart", "axe", "bowling", "competitive"];
  }
  if (goal.includes("youth") || goal.includes("family")) {
    return ["laser", "bowling", "mini golf", "climb"];
  }
  if (goal.includes("celebration") || goal.includes("fun")) {
    return ["laser", "bowling", "kart", "party"];
  }
  if (goal.includes("competition")) {
    return ["kart", "axe", "laser", "bowling"];
  }
  return [];
}

function activityQuantity(
  item: PlannerKnowledgeItem,
  guestCount: number,
): { quantity: number; unitLabel?: string; rotationNote?: string } {
  const cap = item.maxGuests;
  if (cap && cap > 0 && cap < guestCount && isLaneLike(item)) {
    return {
      quantity: Math.ceil(guestCount / cap),
      unitLabel: /bay/i.test(combinedText(item)) ? "bay" : "lane",
    };
  }
  if (cap && cap > 0 && cap < guestCount) {
    const groups = Math.ceil(guestCount / cap);
    return {
      quantity: 1,
      rotationNote: `${guestCount} guests exceed this attraction’s published group size of ${cap}. Plan ${groups} rotating groups.`,
    };
  }
  return { quantity: 1 };
}

function isImpracticalSoleActivity(item: PlannerKnowledgeItem, guestCount: number): boolean {
  const cap = item.maxGuests;
  if (!cap || isLaneLike(item)) {
    return false;
  }
  return guestCount > cap * 4;
}

function spaceFits(item: PlannerKnowledgeItem, guestCount: number): boolean {
  if (item.maxGuests && guestCount > item.maxGuests) {
    return false;
  }
  return true;
}

function scoreAttraction(
  item: PlannerKnowledgeItem,
  inquiry: PlannerInquiryFacts,
  similarActivityNames: string[],
  signals: InquiryNoteSignals,
): number {
  let score = 1;
  const text = combinedText(item).toLowerCase();
  if (inquiry.attractionInterestIds.includes(item.id)) {
    score += 22;
  }
  if (notesPreferItem(item.name, signals)) {
    score += 16;
  }
  for (const keyword of eventTypeKeywords(inquiry.eventType)) {
    if (text.includes(keyword) || item.name.toLowerCase().includes(keyword)) {
      score += 3;
    }
  }
  for (const keyword of goalKeywords(inquiry.eventGoal)) {
    if (text.includes(keyword) || item.name.toLowerCase().includes(keyword)) {
      score += 3;
    }
  }
  if (signals.teamBuilding && /kart|axe|bowling|laser|team/i.test(text)) {
    score += 4;
  }
  if (similarActivityNames.some((name) => name.toLowerCase() === item.name.toLowerCase())) {
    score += 6;
  }
  if (item.type === SALES_KNOWLEDGE_TYPES.PACKAGE) {
    score += inquiry.eventType && text.includes(inquiry.eventType.toLowerCase()) ? 6 : -3;
  }
  if (isImpracticalSoleActivity(item, inquiry.guestCount)) {
    score -= 8;
  }
  return score;
}

function eligibleActivities(
  knowledge: PlannerKnowledgeItem[],
  inquiry: PlannerInquiryFacts,
  signals: InquiryNoteSignals,
): PlannerKnowledgeItem[] {
  return knowledge.filter((item) => {
    if (item.type !== SALES_KNOWLEDGE_TYPES.ATTRACTION && item.type !== SALES_KNOWLEDGE_TYPES.PACKAGE) {
      return false;
    }
    if (item.minGuests && inquiry.guestCount < item.minGuests) {
      return false;
    }
    if (!isAttractionAgeEligible(item, inquiry.guestMix, signals.youngerKids)) {
      return false;
    }
    if (notesExcludeItem(item.name, signals)) {
      return false;
    }
    return true;
  });
}

function diningKeywords(preference: string | null, eventType: string | null): string[] {
  switch (preference) {
    case "pizza_light":
      return ["pizza", "light fare", "appetizer"];
    case "catered_slider":
      return ["slider"];
    case "catered_fajita":
      return ["fajita"];
    case "catered_help":
      if ((eventType ?? "").toLowerCase().includes("corporate")) {
        return ["slider", "cater", "fajita"];
      }
      if (/school|church|youth|birthday/i.test(eventType ?? "")) {
        return ["pizza", "light"];
      }
      return ["slider", "cater", "food"];
    case "not_sure":
      return ["cater", "food", "dining", "pizza", "slider"];
    default:
      return ["food", "dining", "cater"];
  }
}

function foodRank(item: PlannerKnowledgeItem, keywords: string[]): number {
  const text = combinedText(item).toLowerCase();
  return keywords.reduce((score, word) => (text.includes(word) ? score + 2 : score), 0);
}

function diningFromItem(item: PlannerKnowledgeItem, inquiry: PlannerInquiryFacts): EventPlanDining {
  const estimate = estimateKnowledgePriceCents({
    priceText: item.priceText,
    guestCount: inquiry.guestCount,
    guestMix: inquiry.guestMix,
  });
  return {
    knowledgeItemId: item.id,
    label: item.name,
    quantity: inquiry.guestCount,
    priceCents: estimate.cents,
    priceText: item.priceText,
  };
}

function pickDining(
  knowledge: PlannerKnowledgeItem[],
  inquiry: PlannerInquiryFacts,
  tier: EventPlanTier,
): EventPlanDining {
  if (inquiry.diningPreference === "none") {
    return { label: DINING_PREFERENCE_LABELS.none, priceCents: 0, quantity: inquiry.guestCount };
  }

  const foods = knowledge.filter(isFoodItem);
  const byId = foods.find((item) => item.id === inquiry.diningPreference);
  const keywords = diningKeywords(inquiry.diningPreference, inquiry.eventType);
  const ranked = [...foods].sort(
    (left, right) => foodRank(right, keywords) - foodRank(left, keywords) || left.name.localeCompare(right.name),
  );

  const pizza = foods.find((item) => /pizza|light fare/i.test(combinedText(item)));
  const slider = foods.find((item) => /slider/i.test(combinedText(item)));
  const fajita = foods.find((item) => /fajita/i.test(combinedText(item)));
  const specific = ["pizza_light", "catered_slider", "catered_fajita"].includes(inquiry.diningPreference ?? "");

  let chosen = byId ?? ranked[0];
  if (inquiry.diningPreference === "not_sure") {
    if (tier === EVENT_PLAN_TIERS.BUDGET) {
      chosen = pizza ?? ranked[0];
    } else if (tier === EVENT_PLAN_TIERS.PREMIUM) {
      chosen = fajita ?? slider ?? ranked[0];
    } else {
      chosen = slider ?? ranked[0];
    }
  } else if (inquiry.diningPreference === "catered_help") {
    chosen = ranked[0];
  } else if (!specific && !byId) {
    if (tier === EVENT_PLAN_TIERS.BUDGET) {
      chosen = pizza ?? ranked[0];
    }
    if (tier === EVENT_PLAN_TIERS.PREMIUM && ranked.length > 1) {
      chosen = fajita ?? ranked[1] ?? chosen;
    }
  }

  if (!chosen) {
    const label =
      inquiry.diningPreference && inquiry.diningPreference in DINING_PREFERENCE_LABELS
        ? DINING_PREFERENCE_LABELS[inquiry.diningPreference as keyof typeof DINING_PREFERENCE_LABELS]
        : "Dining to be confirmed";
    return { label, priceCents: 0, quantity: inquiry.guestCount };
  }

  const dining = diningFromItem(chosen, inquiry);
  if (
    specific &&
    inquiry.budgetMax != null &&
    dining.priceCents > inquiry.budgetMax * 0.7 &&
    pizza &&
    pizza.id !== chosen.id &&
    (tier === EVENT_PLAN_TIERS.BUDGET || dining.priceCents > inquiry.budgetMax)
  ) {
    const cheaper = diningFromItem(pizza, inquiry);
    if (cheaper.priceCents < dining.priceCents) {
      return cheaper;
    }
  }
  return dining;
}

function pickSpaces(
  knowledge: PlannerKnowledgeItem[],
  inquiry: PlannerInquiryFacts,
  tier: EventPlanTier,
  signals: InquiryNoteSignals,
): EventPlanSpace[] {
  const rooms = knowledge
    .filter((item) => isSpaceItem(item) && spaceFits(item, inquiry.guestCount))
    .sort((left, right) => {
      const leftPrivate = /private/i.test(combinedText(left)) ? 1 : 0;
      const rightPrivate = /private/i.test(combinedText(right)) ? 1 : 0;
      if (leftPrivate !== rightPrivate) {
        return rightPrivate - leftPrivate;
      }
      return left.name.localeCompare(right.name);
    });
  if (rooms.length === 0) {
    return [];
  }
  if (tier === EVENT_PLAN_TIERS.BUDGET && !signals.wantsPrivateRoom) {
    return [];
  }
  const wantsRoom =
    inquiry.spacePreference === "private" ||
    inquiry.spacePreference === "semi_private" ||
    signals.wantsPrivateRoom ||
    signals.dinnerTogether ||
    tier === EVENT_PLAN_TIERS.PREMIUM;
  if (!wantsRoom) {
    return [];
  }
  return [spaceFromItem(rooms[0], inquiry)];
}

function spaceFromItem(room: PlannerKnowledgeItem, inquiry: PlannerInquiryFacts): EventPlanSpace {
  const estimate = estimateKnowledgePriceCents({
    priceText: room.priceText,
    guestCount: inquiry.guestCount,
  });
  return {
    knowledgeItemId: room.id,
    name: room.name,
    priceCents: estimate.cents,
    priceText: room.priceText,
  };
}

function toActivity(item: PlannerKnowledgeItem, inquiry: PlannerInquiryFacts): EventPlanActivity {
  const sizing = activityQuantity(item, inquiry.guestCount);
  const estimate = estimateKnowledgePriceCents({
    priceText: item.priceText,
    guestCount: inquiry.guestCount,
    guestMix: inquiry.guestMix,
    quantity: sizing.quantity,
  });
  return {
    knowledgeItemId: item.id,
    name: item.name,
    quantity: sizing.quantity,
    unitLabel: sizing.unitLabel,
    priceCents: estimate.cents,
    priceText: item.priceText,
    rotationNote: sizing.rotationNote,
  };
}

export function budgetTargetCents(inquiry: PlannerInquiryFacts): number | null {
  if (inquiry.budgetMin != null && inquiry.budgetMax != null) {
    return Math.round((inquiry.budgetMin + inquiry.budgetMax) / 2);
  }
  if (inquiry.budgetMax != null) {
    return inquiry.budgetMax;
  }
  if (inquiry.budgetMin != null) {
    return inquiry.budgetMin;
  }
  return null;
}

function tierBudgetTarget(inquiry: PlannerInquiryFacts, tier: EventPlanTier): number | null {
  const target = budgetTargetCents(inquiry);
  if (target == null) {
    return null;
  }
  if (tier === EVENT_PLAN_TIERS.BUDGET) {
    return Math.round(target * 0.78);
  }
  if (tier === EVENT_PLAN_TIERS.PREMIUM) {
    const raised = Math.round(target * 1.18);
    return inquiry.budgetMax != null ? Math.min(raised, Math.round(inquiry.budgetMax * 1.12)) : raised;
  }
  return target;
}

function composeActivities(
  ranked: PlannerKnowledgeItem[],
  inquiry: PlannerInquiryFacts,
  targetCents: number | null,
  extrasCents: number,
  minCount: number,
  maxCount: number,
  tier: EventPlanTier,
): EventPlanActivity[] {
  if (ranked.length === 0) {
    return [];
  }
  const preferred = ranked.filter((item) => inquiry.attractionInterestIds.includes(item.id));
  const rest = ranked.filter((item) => !inquiry.attractionInterestIds.includes(item.id));
  const ordered = [...preferred, ...rest];
  const usable = ordered.filter(
    (item, index) =>
      !(isImpracticalSoleActivity(item, inquiry.guestCount) && ordered.length > 1 && index === 0 && minCount === 1),
  );
  const pool = usable.length > 0 ? usable : ordered;
  const startPool = [
    ...pool.filter(
      (item) => inquiry.attractionInterestIds.includes(item.id) || toActivity(item, inquiry).priceCents > 0,
    ),
    ...pool.filter(
      (item) => !inquiry.attractionInterestIds.includes(item.id) && toActivity(item, inquiry).priceCents === 0,
    ),
  ];
  const uniqueStart = startPool.filter(
    (item, index) => startPool.findIndex((row) => row.id === item.id) === index,
  );
  let selected = uniqueStart.slice(0, Math.min(minCount, uniqueStart.length)).map((item) => toActivity(item, inquiry));

  const total = () => selected.reduce((sum, row) => sum + row.priceCents, 0) + extrasCents;
  const unused = () => pool.filter((item) => !selected.some((row) => row.knowledgeItemId === item.id));

  while (targetCents != null && selected.length < Math.min(maxCount, pool.length) && total() < targetCents * 0.88) {
    const remaining = unused();
    const priced = remaining.filter((item) => toActivity(item, inquiry).priceCents > 0);
    const candidates = priced.length > 0 ? priced : remaining;
    if (candidates.length === 0) {
      break;
    }
    const ceiling = tierOverCeiling(inquiry, targetCents, tier);
    const next = candidates.reduce((best, item) => {
      const cost = toActivity(item, inquiry).priceCents;
      const projected = total() + cost;
      const bestCost = toActivity(best, inquiry).priceCents;
      const bestProjected = total() + bestCost;
      const bestOver = ceiling != null && bestProjected > ceiling;
      const itemOver = ceiling != null && projected > ceiling;
      if (itemOver !== bestOver) {
        return itemOver ? best : item;
      }
      return Math.abs(projected - targetCents) < Math.abs(bestProjected - targetCents) ? item : best;
    });
    const nextActivity = toActivity(next, inquiry);
    if (ceiling != null && total() + nextActivity.priceCents > ceiling && selected.length >= minCount) {
      break;
    }
    selected = [...selected, nextActivity];
  }

  const overCeiling = tierOverCeiling(inquiry, targetCents, tier);
  while (overCeiling != null && selected.length > minCount && total() > overCeiling) {
    selected = selected.slice(0, -1);
  }

  if (selected.length === 1 && isImpracticalSoleActivity(pool[0], inquiry.guestCount) && pool.length > 1) {
    selected = [toActivity(pool[0], inquiry), toActivity(pool[1], inquiry)];
  }

  return selected;
}

function planTotal(activities: EventPlanActivity[], dining: EventPlanDining, spaces: EventPlanSpace[]): number {
  return (
    activities.reduce((sum, row) => sum + row.priceCents, 0) +
    dining.priceCents +
    spaces.reduce((sum, row) => sum + row.priceCents, 0)
  );
}

function pricingComplete(
  activities: EventPlanActivity[],
  dining: EventPlanDining,
  spaces: EventPlanSpace[],
): boolean {
  return (
    activities.every((row) => row.priceCents > 0 || !row.priceText) &&
    (dining.priceCents > 0 || dining.label === DINING_PREFERENCE_LABELS.none || !dining.priceText) &&
    spaces.every((space) => space.priceCents > 0 || !space.priceText)
  );
}

function tierOverCeiling(
  inquiry: PlannerInquiryFacts,
  targetCents: number | null,
  tier: EventPlanTier,
): number | null {
  if (tier === EVENT_PLAN_TIERS.BUDGET) {
    if (targetCents != null && inquiry.budgetMax != null) {
      return Math.min(Math.round(targetCents * 1.12), inquiry.budgetMax);
    }
    if (targetCents != null) {
      return Math.round(targetCents * 1.12);
    }
    return inquiry.budgetMax;
  }
  if (tier === EVENT_PLAN_TIERS.PREMIUM) {
    if (inquiry.budgetMax != null) {
      return Math.round(inquiry.budgetMax * 1.12);
    }
    return targetCents != null ? Math.round(targetCents * 1.25) : null;
  }
  if (targetCents != null && inquiry.budgetMax != null) {
    return Math.min(Math.round(targetCents * 1.15), Math.round(inquiry.budgetMax * 1.08));
  }
  if (targetCents != null) {
    return Math.round(targetCents * 1.15);
  }
  return inquiry.budgetMax != null ? Math.round(inquiry.budgetMax * 1.08) : null;
}

function durationForTier(requested: number, tier: EventPlanTier): number {
  if (tier === EVENT_PLAN_TIERS.BUDGET && requested >= 180) {
    return Math.max(120, requested - 60);
  }
  if (tier === EVENT_PLAN_TIERS.PREMIUM) {
    return Math.min(300, requested + 60);
  }
  return requested;
}

function buildSchedule(
  activities: EventPlanActivity[],
  durationMinutes: number,
  startTime: string | null,
): string[] {
  if (activities.length === 0) {
    return ["A team member will confirm the event flow."];
  }
  const slice = Math.max(30, Math.floor(durationMinutes / activities.length));
  const lines: string[] = [];
  let offset = 0;
  for (const activity of activities) {
    const window = startTime
      ? `${startTime} + ${offset} min for about ${slice} minutes`
      : `About ${slice} minutes`;
    const rotation = activity.rotationNote ? ` ${activity.rotationNote}` : "";
    const quantity =
      activity.quantity > 1 && activity.unitLabel
        ? ` (${activity.quantity} ${activity.unitLabel}${activity.quantity === 1 ? "" : "s"})`
        : "";
    lines.push(`${activity.name}${quantity}: ${window}.${rotation}`.trim());
    offset += slice;
  }
  return lines;
}

function reasonFor(
  tier: EventPlanTier,
  inquiry: PlannerInquiryFacts,
  activities: EventPlanActivity[],
  dining: EventPlanDining,
  spaces: EventPlanSpace[],
): string {
  const goal = inquiry.eventGoal ? inquiry.eventGoal.toLowerCase() : "event";
  const names = activities.map((item) => item.name).join(", ") || "the available attractions";
  const spaceBit = spaces[0] ? ` and ${spaces[0].name.toLowerCase()}` : "";
  if (tier === EVENT_PLAN_TIERS.BUDGET) {
    return `A focused ${goal} plan using ${names}, with ${dining.label.toLowerCase()}${spaceBit ? "" : " and a simpler space setup"}, kept toward the lower end of your budget.`;
  }
  if (tier === EVENT_PLAN_TIERS.PREMIUM) {
    return `Adds more experience around ${names} with ${dining.label.toLowerCase()}${spaceBit} for a stronger ${goal} event.`;
  }
  return `Best match for your ${goal} event. This plan combines ${names} with ${dining.label.toLowerCase()}${spaceBit} while staying close to your target budget.`;
}

function rankCandidate(
  inquiry: PlannerInquiryFacts,
  tier: EventPlanTier,
  activities: EventPlanActivity[],
  dining: EventPlanDining,
  spaces: EventPlanSpace[],
  targetCents: number | null,
  signals: InquiryNoteSignals,
): EventPlanRanking {
  const total = planTotal(activities, dining, spaces);
  const reasons: string[] = [];
  let score = 0;

  if (targetCents && targetCents > 0) {
    const ratio = total / targetCents;
    const distance = Math.abs(1 - ratio);
    const budgetScore = Math.max(0, 45 - Math.round(distance * 80));
    score += budgetScore;
    if (distance <= 0.15) {
      reasons.push("close to stated budget");
    }
    if (inquiry.budgetMax != null && total > inquiry.budgetMax * 1.2) {
      score -= 35;
      reasons.push("above stated maximum");
    }
    if (inquiry.budgetMin != null && total < inquiry.budgetMin * 0.45 && tier === EVENT_PLAN_TIERS.BEST_FIT) {
      score -= 20;
      reasons.push("well below stated budget");
    }
  }

  const interestHits = activities.filter((row) => inquiry.attractionInterestIds.includes(row.knowledgeItemId)).length;
  score += interestHits * 10;
  if (interestHits > 0) {
    reasons.push("includes selected attractions");
  }
  if (tier === EVENT_PLAN_TIERS.BEST_FIT && inquiry.attractionInterestIds.length > 0 && interestHits === 0) {
    score -= 12;
  }

  const diningMatch =
    inquiry.diningPreference &&
    inquiry.diningPreference !== "not_sure" &&
    inquiry.diningPreference !== "none" &&
    (dining.knowledgeItemId === inquiry.diningPreference ||
      diningKeywords(inquiry.diningPreference, inquiry.eventType).some((word) =>
        dining.label.toLowerCase().includes(word),
      ));
  if (diningMatch) {
    score += 12;
    reasons.push("matches dining preference");
  }
  if (inquiry.diningPreference === "none" && dining.label === DINING_PREFERENCE_LABELS.none) {
    score += 8;
  }

  if ((inquiry.spacePreference === "private" || signals.wantsPrivateRoom) && spaces.length > 0) {
    score += 10;
    reasons.push("includes private space");
  }
  if ((inquiry.spacePreference === "private" || signals.wantsPrivateRoom) && spaces.length === 0 && tier !== EVENT_PLAN_TIERS.BUDGET) {
    score -= 8;
  }

  score += Math.min(12, (activities.length - 1) * 4);
  if (activities.some((row) => row.rotationNote) && activities.length === 1) {
    score -= 10;
  }

  if (notesPreferItem(activities.map((row) => row.name).join(" "), signals)) {
    score += 8;
  }

  return { score, reasons };
}

function shapeKey(activities: EventPlanActivity[], dining: EventPlanDining, spaces: EventPlanSpace[]): string {
  return [
    activities.map((row) => row.knowledgeItemId).join(","),
    dining.knowledgeItemId ?? dining.label,
    spaces.map((row) => row.knowledgeItemId).join(","),
  ].join("|");
}

export function buildEventPlans(input: BuildEventPlansInput): EventPlanDraft[] {
  const { inquiry, knowledge, currency } = input;
  const similarActivityNames = input.similarActivityNames ?? [];
  const signals = parseInquiryNotes(inquiry.customerNotes);
  const requestedDuration = inquiry.desiredDurationMinutes ?? 180;
  const ranked = eligibleActivities(knowledge, inquiry, signals)
    .map((item) => ({ item, score: scoreAttraction(item, inquiry, similarActivityNames, signals) }))
    .sort((left: ScoredItem, right: ScoredItem) => right.score - left.score || left.item.name.localeCompare(right.item.name))
    .map((entry) => entry.item);

  if (ranked.length === 0) {
    return [];
  }

  const historical = similarActivityNames[0] ?? null;
  const configs: Array<{
    tier: EventPlanTier;
    sortOrder: number;
    minActivities: number;
    maxActivities: number;
  }> = [
    {
      tier: EVENT_PLAN_TIERS.BUDGET,
      sortOrder: 0,
      minActivities: 1,
      maxActivities: Math.min(2, ranked.length),
    },
    {
      tier: EVENT_PLAN_TIERS.BEST_FIT,
      sortOrder: 1,
      minActivities: Math.min(2, ranked.length),
      maxActivities: Math.min(3, ranked.length),
    },
    {
      tier: EVENT_PLAN_TIERS.PREMIUM,
      sortOrder: 2,
      minActivities: Math.min(ranked.length >= 3 ? 3 : 2, ranked.length),
      maxActivities: Math.min(4, ranked.length),
    },
  ];

  const drafts: EventPlanDraft[] = configs.map((config) => {
    const durationMinutes = durationForTier(requestedDuration, config.tier);
    const dining = pickDining(knowledge, inquiry, config.tier);
    const spaces = pickSpaces(knowledge, inquiry, config.tier, signals);
    const extras = dining.priceCents + spaces.reduce((sum, row) => sum + row.priceCents, 0);
    const activities = composeActivities(
      ranked,
      inquiry,
      tierBudgetTarget(inquiry, config.tier),
      extras,
      config.minActivities,
      config.maxActivities,
      config.tier,
    );
    const total = planTotal(activities, dining, spaces);
    const ranking = rankCandidate(
      inquiry,
      config.tier,
      activities,
      dining,
      spaces,
      budgetTargetCents(inquiry),
      signals,
    );
    const payload: EventPlanPayload = {
      guestCount: inquiry.guestCount,
      eventDate: inquiry.desiredDate,
      startTime: inquiry.desiredStartTime,
      durationMinutes,
      activities,
      dining,
      spaces,
      schedule: buildSchedule(activities, durationMinutes, inquiry.desiredStartTime),
      pricingComplete: pricingComplete(activities, dining, spaces),
      historicalInfluence: historical,
      customerAvailabilityNote: CUSTOMER_AVAILABILITY_NOTE,
      ranking,
    };

    return {
      tier: config.tier,
      title: EVENT_PLAN_TIER_TITLES[config.tier],
      sortOrder: config.sortOrder,
      estimatedTotalCents: total,
      currency,
      guestCount: inquiry.guestCount,
      durationMinutes,
      customerFacingReason: reasonFor(config.tier, inquiry, activities, dining, spaces),
      availabilityValidated: false,
      availabilityNote: AVAILABILITY_UNVALIDATED_NOTE,
      payload,
    };
  });

  const unique = new Set(drafts.map((draft) => shapeKey(draft.payload.activities, draft.payload.dining, draft.payload.spaces)));
  if (unique.size === 1 && ranked.length > 1) {
    const premium = drafts[2];
    const extra = ranked.find(
      (item) => !premium.payload.activities.some((row) => row.knowledgeItemId === item.id),
    );
    if (extra) {
      premium.payload.activities = [...premium.payload.activities, toActivity(extra, inquiry)];
      premium.estimatedTotalCents = planTotal(
        premium.payload.activities,
        premium.payload.dining,
        premium.payload.spaces,
      );
      premium.payload.schedule = buildSchedule(
        premium.payload.activities,
        premium.durationMinutes,
        inquiry.desiredStartTime,
      );
      premium.payload.ranking = rankCandidate(
        inquiry,
        EVENT_PLAN_TIERS.PREMIUM,
        premium.payload.activities,
        premium.payload.dining,
        premium.payload.spaces,
        budgetTargetCents(inquiry),
        signals,
      );
      premium.customerFacingReason = reasonFor(
        EVENT_PLAN_TIERS.PREMIUM,
        inquiry,
        premium.payload.activities,
        premium.payload.dining,
        premium.payload.spaces,
      );
    }
  }

  return drafts;
}

export function attractionInterestIdsFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}
