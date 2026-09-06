import { AI_HANDOFF_CUSTOMER_MESSAGE } from "@/types/inquiry";

export const HUMAN_HANDOFF_TOOL_DESCRIPTION =
  "Use only when the customer explicitly requests a person OR completing their request requires a human action that MagicCRM cannot perform, such as confirming live availability or finalizing a reservation. Do not call merely because the lead is qualified, has a preferred date/time, asks normal pricing/package/policy questions, or may eventually book.";

export const SALES_AGENT_HANDOFF_POLICY = `Handoff is a boundary for required human action, not a signal that a lead is valuable.

Continue selling and qualifying until an action requires a person. Follow ANSWER → QUALIFY → NUDGE → HAND OFF ONLY WHEN NECESSARY:
1. Answer known questions from tenant knowledge and this conversation.
2. Recommend relevant offerings.
3. Collect useful missing facts naturally.
4. Help the customer narrow choices.
5. Move them toward a booking decision.
6. Involve staff only when actual human action is required.

Do not hand off because a preferred date, preferred time, guest count, pricing question, well-qualified lead, or likely future booking intent exists.

Hand off only for:
- an explicit request to talk to a person or have someone call
- live availability confirmation, or a request to reserve, book, or hold a time
- human-only approval the customer wants escalated (custom/negotiated pricing, contracts, unsupported custom quotes)

Do not invent or approve discounts. Explain that staff would need to approve special pricing, keep comparing packages, and hand off only if the customer asks to escalate that request.

If one fact is unconfirmed, answer cautiously and keep helping. Do not hand off solely because knowledge is incomplete.

Never say a team member will help from here while the customer is still gathering information.`;

export const HANDOFF_DECLINED_PAYLOAD = {
  handedOff: false,
  declined: true,
  reason:
    "Handoff declined. Continue answering this sales question. A preferred date/time, guest count, pricing or package question, incomplete fact, or qualified lead is not a handoff.",
} as const;

export type SalesAgentHandoffCategory =
  | "explicit_human"
  | "booking_availability"
  | "human_approval"
  | "normal_sales"
  | "unspecified";

export type SalesAgentHandoffDecision = {
  allow: boolean;
  category: SalesAgentHandoffCategory;
};

const EXPLICIT_HUMAN_PATTERNS = [
  /\b(talk|speak)\s+(to|with)\b/,
  /\bcall me\b/,
  /\bsomeone to call\b/,
  /\breal person\b/,
  /\b(a |the )human\b/,
  /\bevents team\b/,
  /\b(a |the )?manager\b/,
];

const BOOKING_AVAILABILITY_PATTERNS = [
  /\b(reserve|reservation|reserving)\b/,
  /\b(book|booking|booked)\b/,
  /\bhold (that |this |the )?(time|spot|date|room)\b/,
  /\b(saturday|sunday|monday|tuesday|wednesday|thursday|friday|weekend)\b.{0,80}\bavailable\b/,
  /\bavailable\b.{0,80}\b(saturday|sunday|monday|tuesday|wednesday|thursday|friday|weekend|\d{1,2}(:\d{2})?\s*(am|pm)?)\b/,
];

const HUMAN_APPROVAL_PATTERNS = [
  /\bapprove\b/,
  /\bapproval\b/,
  /\bescalat/,
  /\bcustom discounted\b/,
  /\bcustom (price|pricing|quote|deal)\b/,
  /\bnegotiat/,
  /\bspecial pricing\b/,
];

const NORMAL_SALES_PATTERNS = [
  /\bhow much\b/,
  /\bcost\b/,
  /\bprice/,
  /\bwhats? included\b/,
  /\brecommend\b/,
  /\bdeposit\b/,
  /\bwhat time are you open\b/,
  /\bhours\b/,
  /\byear old\b/,
  /\baxe throw\b/,
  /\bfood\b/,
  /\bdiscount\b/,
  /\bpackage\b/,
];

export function evaluateSalesAgentHandoff(input: { lastCustomerMessage: string }): SalesAgentHandoffDecision {
  const message = normalizeCustomerMessage(input.lastCustomerMessage);

  if (matchesAny(message, EXPLICIT_HUMAN_PATTERNS)) {
    return { allow: true, category: "explicit_human" };
  }
  if (matchesAny(message, BOOKING_AVAILABILITY_PATTERNS)) {
    return { allow: true, category: "booking_availability" };
  }
  if (matchesAny(message, HUMAN_APPROVAL_PATTERNS)) {
    return { allow: true, category: "human_approval" };
  }
  if (matchesAny(message, NORMAL_SALES_PATTERNS)) {
    return { allow: false, category: "normal_sales" };
  }

  return { allow: false, category: "unspecified" };
}

export function looksLikeHandoffFarewell(text: string): boolean {
  const normalized = normalizeCustomerMessage(text);
  return (
    normalized === normalizeCustomerMessage(AI_HANDOFF_CUSTOMER_MESSAGE) ||
    normalized.includes("passed this to a team member") ||
    normalized.includes("team member who can help from here") ||
    /a team member will (help|take|follow|finalize)/.test(normalized)
  );
}

function normalizeCustomerMessage(value: string): string {
  return value
    .toLowerCase()
    .replace(/[“”"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}
