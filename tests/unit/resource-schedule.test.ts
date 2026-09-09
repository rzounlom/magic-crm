import { describe, expect, it } from "vitest";

import { derivePlanResourceRequirements, inferResourceTypeFromKnowledge } from "@/server/resources/requirements";
import { localEventWindow, rangesOverlap } from "@/server/resources/time-window";
import { SALES_KNOWLEDGE_TYPES as KNOWLEDGE } from "@/types/inquiry";
import { RESOURCE_QUANTITY_RULES } from "@/types/resource-schedule";
import { planSelectionConfirmationDraft } from "@/server/domain-events/emit";

function item(overrides: {
  id: string;
  name: string;
  type?: string;
  details?: string;
  maxGuests?: number | null;
  durationMinutes?: number | null;
}) {
  return {
    id: overrides.id,
    type: overrides.type ?? KNOWLEDGE.ATTRACTION,
    name: overrides.name,
    shortDescription: overrides.name,
    details: overrides.details ?? overrides.name,
    priceText: "$10/person",
    durationMinutes: overrides.durationMinutes ?? 60,
    minGuests: 1,
    maxGuests: overrides.maxGuests ?? null,
    customerFacingNotes: null,
    salesNotes: null,
  };
}

describe("finite resource inference", () => {
  it("uses published per-lane guest capacity for bowling and does not invent a lane count", () => {
    const bowling = inferResourceTypeFromKnowledge(
      item({
        id: "bowl",
        name: "Bowling",
        details: "Up to 6 bowlers per lane.",
        maxGuests: 6,
      }),
    );
    expect(bowling).toMatchObject({
      slug: "bowling-lane",
      quantityRule: RESOURCE_QUANTITY_RULES.PER_GUESTS,
      guestsPerUnit: 6,
      requiresStaffConfiguration: false,
    });
    expect(bowling?.notes).toContain("Lane count is not published");
  });

  it("treats in-venue axe throwing as finite inventory that still needs admin configuration", () => {
    const axe = inferResourceTypeFromKnowledge(item({ id: "axe", name: "Axe Throwing", maxGuests: 8 }));
    expect(axe).toMatchObject({
      slug: "axe-throwing-lane",
      quantityRule: RESOURCE_QUANTITY_RULES.UNKNOWN,
      guestsPerUnit: null,
      requiresStaffConfiguration: true,
    });
  });

  it("does not put mobile axe throwing on the venue schedule", () => {
    expect(
      inferResourceTypeFromKnowledge(
        item({
          id: "mobile",
          name: "Mobile Axe Throwing",
          details: "Two-lane mobile axe throwing rental for off-site events.",
        }),
      ),
    ).toBeNull();
  });

  it("maps a private event room as one unspecified room until admin configures inventory", () => {
    const room = inferResourceTypeFromKnowledge(
      item({
        id: "room",
        type: KNOWLEDGE.ADD_ON,
        name: "Private Event Room",
        details: "Private event room for groups.",
      }),
    );
    expect(room?.slug).toBe("private-event-room");
    expect(room?.quantityRule).toBe(RESOURCE_QUANTITY_RULES.FIXED);
    expect(room?.requiresStaffConfiguration).toBe(true);
  });

  it("derives bowling lane quantity from guest count without claiming inventory is configured", () => {
    const requirements = derivePlanResourceRequirements({
      guestCount: 24,
      durationMinutes: 180,
      knowledge: [
        item({ id: "bowl", name: "Bowling", details: "Up to 6 bowlers per lane.", maxGuests: 6 }),
      ],
      activities: [{ knowledgeItemId: "bowl", name: "Bowling", quantity: 4, priceCents: 12000 }],
      spaces: [],
    });
    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.quantity).toBe(4);
    expect(requirements[0]?.inventoryConfigured).toBe(false);
  });

  it("prefers stored knowledge-to-resource links over name heuristics", () => {
    const requirements = derivePlanResourceRequirements({
      guestCount: 10,
      durationMinutes: 60,
      knowledge: [item({ id: "bowl", name: "Bowling", maxGuests: 6 })],
      activities: [{ knowledgeItemId: "bowl", name: "Bowling", quantity: 1, priceCents: 1000 }],
      spaces: [],
      storedRequirements: [
        {
          salesKnowledgeItemId: "bowl",
          resourceTypeId: "type_1",
          resourceTypeSlug: "bowling-lane",
          resourceTypeName: "Bowling Lane",
          inventoryConfigured: false,
          quantityRule: RESOURCE_QUANTITY_RULES.PER_GUESTS,
          quantity: null,
          guestsPerUnit: 6,
          durationMinutes: 90,
          requiresStaffConfiguration: false,
        },
      ],
    });
    expect(requirements[0]).toMatchObject({
      resourceTypeId: "type_1",
      quantity: 2,
      durationMinutes: 90,
      inventoryConfigured: false,
    });
  });
});

describe("resource time windows", () => {
  it("detects overlapping local slots", () => {
    const window = localEventWindow({ date: "2026-10-15", startTime: "18:00", durationMinutes: 120 });
    expect(window).toEqual({ slotDate: "2026-10-15", startMinute: 18 * 60, endMinute: 20 * 60 });
    expect(rangesOverlap({ startMinute: 1080, endMinute: 1200 }, { startMinute: 1140, endMinute: 1260 })).toBe(true);
    expect(rangesOverlap({ startMinute: 1080, endMinute: 1200 }, { startMinute: 1200, endMinute: 1320 })).toBe(false);
  });
});

describe("plan selection confirmation draft", () => {
  it("uses tenant branding and does not claim the event is reserved", () => {
    const draft = planSelectionConfirmationDraft({
      organizationName: "Riverside Fun Center",
      customerFirstName: "Ada",
      customerLastName: "Lovelace",
      customerGroupName: "Engineering",
      eventDate: "2026-10-15",
      guestCount: 24,
      planTitle: "Best Fit",
      activities: ["Bowling"],
      dining: "Pizza",
      spaces: ["Private Event Room"],
      estimatedTotalCents: 400000,
      currency: "USD",
    });
    expect(draft.subject).toBe("We received your Riverside Fun Center event plan");
    expect(draft.body).toContain("Riverside Fun Center event specialist");
    expect(draft.body).toContain("not a confirmed reservation");
    expect(draft.reserved).toBe(false);
    expect(draft.body).not.toContain("Generations");
  });
});
