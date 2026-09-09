import { describe, expect, it } from "vitest";

import { generateRecommendations } from "@/server/event-planner/generate-recommendations";
import { parseInquiryNotes } from "@/server/event-planner/inquiry-notes";
import { personalEventPlanNotification } from "@/lib/event-planner/email-context";
import { inquiryFunnelStages } from "@/lib/inquiries/inquiry-funnel";
import {
  CUSTOMER_SELECTED_PLAN_BANNER,
  formatReadyForHumanReason,
  READY_FOR_HUMAN_REASONS,
} from "@/lib/inquiries/ready-for-human-reason";
import { EVENT_PLAN_TIERS } from "@/types/event-planner";
import { INQUIRY_STATUSES, SALES_KNOWLEDGE_TYPES as KNOWLEDGE } from "@/types/inquiry";

describe("inquiry notes", () => {
  it("extracts wanted and excluded attractions from free text", () => {
    const signals = parseInquiryNotes(
      "We do not want axe throwing. We really want go-karts and we need a private room.",
    );
    expect(signals.unwantedTerms.some((term) => term.includes("axe"))).toBe(true);
    expect(signals.wantedTerms.some((term) => term.includes("go") && term.includes("kart"))).toBe(
      true,
    );
    expect(signals.wantsPrivateRoom).toBe(true);
  });
});

describe("personal event plan notification", () => {
  it("builds future email context without sending mail", () => {
    const payload = personalEventPlanNotification({
      customerEmail: "ada@example.com",
      customerFirstName: "Ada",
      customerLastName: "Lovelace",
      organizationName: "Riverside Fun Center",
      planPath: "plan/opaque-token",
      appUrl: "https://crm.example.com",
      eventDate: "2026-10-15",
    });
    expect(payload).toEqual({
      to: "ada@example.com",
      customerName: "Ada Lovelace",
      organizationName: "Riverside Fun Center",
      planUrl: "https://crm.example.com/plan/opaque-token",
      eventDate: "2026-10-15",
    });
  });
});

describe("ready for human reasons", () => {
  it("formats stored reason codes without exposing them as staff copy", () => {
    expect(formatReadyForHumanReason(READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN)).toBe(
      "Customer selected plan — ready to book",
    );
    expect(formatReadyForHumanReason(READY_FOR_HUMAN_REASONS.AVAILABILITY_NEEDS_ADJUSTMENT)).toContain(
      "availability needs adjustment",
    );
    expect(formatReadyForHumanReason(READY_FOR_HUMAN_REASONS.NO_FEASIBLE_PLAN)).toContain(
      "No feasible event plan",
    );
    expect(CUSTOMER_SELECTED_PLAN_BANNER).toBe("CUSTOMER SELECTED PLAN — READY TO BOOK");
  });
});

describe("inquiry funnel", () => {
  it("uses persisted timestamps and names the selected tier", () => {
    const createdAt = new Date("2026-09-01T12:00:00Z");
    const generatedAt = new Date("2026-09-01T12:01:00Z");
    const viewedAt = new Date("2026-09-01T12:05:00Z");
    const selectedAt = new Date("2026-09-01T12:10:00Z");
    const stages = inquiryFunnelStages({
      createdAt,
      recommendationsGeneratedAt: generatedAt,
      recommendationsViewedAt: viewedAt,
      customerSelectedAt: selectedAt,
      humanHandoffRequestedAt: selectedAt,
      status: INQUIRY_STATUSES.READY_FOR_HUMAN,
      selectedPlanTier: EVENT_PLAN_TIERS.BEST_FIT,
      selectedPlanTitle: "Best Fit",
    });
    expect(stages.map((stage) => stage.label)).toEqual([
      "Inquiry submitted",
      "Recommendations generated",
      "Personal Event Plan viewed",
      "Best Fit selected",
      "Ready for Live Agent",
    ]);
    expect(stages.every((stage) => stage.complete)).toBe(true);
    expect(stages.find((stage) => stage.id === "selected")?.at).toEqual(selectedAt);
    expect(stages.some((stage) => stage.label === "Booked")).toBe(false);
  });
});

describe("generateRecommendations", () => {
  it("keeps availabilityValidated false when no provider is injected", async () => {
    const drafts = await generateRecommendations({
      inquiry: {
        eventType: "Birthday Party",
        eventGoal: "Celebration",
        guestCount: 12,
        guestMix: "mostly_children",
        desiredDurationMinutes: 120,
        desiredDate: "2026-10-15",
        desiredStartTime: "14:00",
        budgetMin: 150_000,
        budgetMax: 300_000,
        diningPreference: "none",
        spacePreference: "no_preference",
        attractionInterestIds: [],
        customerNotes: null,
      },
      currency: "USD",
      knowledge: [
        {
          id: "bowl",
          type: KNOWLEDGE.ATTRACTION,
          name: "Bowling",
          shortDescription: "Bowling",
          details: "Bowling",
          priceText: "$10/person",
          durationMinutes: 60,
          minGuests: 1,
          maxGuests: null,
          customerFacingNotes: null,
          salesNotes: null,
        },
        {
          id: "laser",
          type: KNOWLEDGE.ATTRACTION,
          name: "Laser Tag",
          shortDescription: "Laser Tag",
          details: "Laser Tag",
          priceText: "$8/person",
          durationMinutes: 60,
          minGuests: 1,
          maxGuests: null,
          customerFacingNotes: null,
          salesNotes: null,
        },
      ],
    });
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.every((row) => row.availabilityValidated === false)).toBe(true);
    const bowlingPlans = drafts.filter((row) =>
      row.payload.activities.some((activity) => activity.name === "Bowling"),
    );
    expect(bowlingPlans.length).toBeGreaterThan(0);
    expect(
      bowlingPlans.every((row) =>
        row.payload.resourceRequirements?.some((requirement) => requirement.resourceTypeSlug === "bowling-lane"),
      ),
    ).toBe(true);
  });

  it("sets availabilityValidated only when the injected provider confirms the window", async () => {
    const drafts = await generateRecommendations({
      inquiry: {
        eventType: "Birthday Party",
        eventGoal: "Celebration",
        guestCount: 12,
        guestMix: "mostly_adults",
        desiredDurationMinutes: 120,
        desiredDate: "2026-10-15",
        desiredStartTime: "14:00",
        budgetMin: 150_000,
        budgetMax: 300_000,
        diningPreference: "none",
        spacePreference: "no_preference",
        attractionInterestIds: [],
        customerNotes: null,
      },
      currency: "USD",
      knowledge: [
        {
          id: "laser",
          type: KNOWLEDGE.ATTRACTION,
          name: "Laser Tag",
          shortDescription: "Laser Tag",
          details: "Laser Tag",
          priceText: "$8/person",
          durationMinutes: 60,
          minGuests: 1,
          maxGuests: null,
          customerFacingNotes: null,
          salesNotes: null,
        },
      ],
      availabilityProvider: {
        check: () => ({ validated: true, note: "Finite resources were checked against the Resource Schedule." }),
      },
    });
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.every((row) => row.availabilityValidated === true)).toBe(true);
  });
});
