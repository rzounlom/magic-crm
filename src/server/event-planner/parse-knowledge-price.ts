import { dollarsToCents } from "@/lib/event-planner/money";

export type ParsedKnowledgePrice = {
  kind: "per_person" | "per_resource" | "package" | "flat" | "unknown";
  amountCents: number | null;
  includedGuests?: number;
  additionalGuestCents?: number;
  childAmountCents?: number;
  unitLabel?: string;
  complete: boolean;
};

const DOLLAR_PATTERN = /\$\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/;

function parseDollarAmount(source: string): number | null {
  const match = source.match(DOLLAR_PATTERN);
  if (!match) {
    return null;
  }
  const value = Number.parseFloat(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) {
    return null;
  }
  return dollarsToCents(value);
}

function firstSentence(text: string): string {
  return text.split(/[.;]/)[0] ?? text;
}

export function parseKnowledgePrice(priceText: string | null | undefined): ParsedKnowledgePrice {
  const text = (priceText ?? "").trim();
  if (!text) {
    return { kind: "unknown", amountCents: null, complete: false };
  }
  if (/variable|custom event quote|menu pricing|to be determined|contact/i.test(text) && !DOLLAR_PATTERN.test(text)) {
    return { kind: "unknown", amountCents: null, complete: false };
  }

  const lower = text.toLowerCase();
  const amountCents = parseDollarAmount(text);
  if (amountCents == null) {
    return { kind: "unknown", amountCents: null, complete: false };
  }

  const upToMatch = text.match(/up to\s+(\d+)\s+guests?/i);
  const additionalMatch = text.match(
    /\$\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\s*(?:each\s+)?additional(?:\s+guest)?/i,
  );
  if (upToMatch) {
    return {
      kind: "package",
      amountCents,
      includedGuests: Number.parseInt(upToMatch[1], 10),
      additionalGuestCents: additionalMatch
        ? dollarsToCents(Number.parseFloat(additionalMatch[1].replace(/,/g, "")))
        : undefined,
      complete: true,
    };
  }

  const childMatch = text.match(
    /\$\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\s*\/?\s*(?:child|kid)/i,
  );
  const adultMatch = /\/adult|per adult/i.test(text);
  if (adultMatch && childMatch) {
    return {
      kind: "per_person",
      amountCents,
      childAmountCents: dollarsToCents(Number.parseFloat(childMatch[1].replace(/,/g, ""))),
      unitLabel: "person",
      complete: true,
    };
  }

  const snippet = firstSentence(lower);
  if (/\/\s*lane|\bper lane\b|\/lane/.test(snippet)) {
    return { kind: "per_resource", amountCents, unitLabel: "lane", complete: true };
  }
  if (/\/\s*bay|\bper bay\b/.test(snippet)) {
    return { kind: "per_resource", amountCents, unitLabel: "bay", complete: true };
  }
  if (/\/\s*person|\bper person\b|\/person/.test(snippet) || /\/\s*game/.test(snippet)) {
    return { kind: "per_person", amountCents, unitLabel: "person", complete: true };
  }

  return { kind: "flat", amountCents, complete: true };
}

export function estimateKnowledgePriceCents(input: {
  priceText: string | null | undefined;
  guestCount: number;
  guestMix?: string | null;
  quantity?: number;
}): { cents: number; complete: boolean; parsed: ParsedKnowledgePrice } {
  const parsed = parseKnowledgePrice(input.priceText);
  const quantity = Math.max(1, input.quantity ?? 1);
  if (!parsed.complete || parsed.amountCents == null) {
    return { cents: 0, complete: false, parsed };
  }

  if (parsed.kind === "package") {
    const included = parsed.includedGuests ?? input.guestCount;
    const extra = Math.max(0, input.guestCount - included);
    const extraCents = parsed.additionalGuestCents ?? 0;
    return {
      cents: parsed.amountCents + extra * extraCents,
      complete: parsed.additionalGuestCents != null || extra === 0,
      parsed,
    };
  }

  if (parsed.kind === "per_person") {
    const unit =
      input.guestMix === "mostly_children" && parsed.childAmountCents != null
        ? parsed.childAmountCents
        : parsed.amountCents;
    return { cents: unit * input.guestCount, complete: true, parsed };
  }

  if (parsed.kind === "per_resource") {
    return { cents: parsed.amountCents * quantity, complete: true, parsed };
  }

  return { cents: parsed.amountCents, complete: true, parsed };
}
