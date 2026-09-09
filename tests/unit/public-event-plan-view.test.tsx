/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PublicEventPlanView } from "@/components/layout/public-event-plan-view";
import { EVENT_PLAN_TIERS } from "@/types/event-planner";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

vi.mock("@/server/actions/public-inquiry", () => ({
  selectPublicEventPlanAction: vi.fn(),
}));

describe("public event plan view", () => {
  it("shows personalized plans without chat or AI terminology", () => {
    const html = renderToStaticMarkup(
      <PublicEventPlanView
        organizationName="Riverside Fun Center"
        currency="USD"
        token="opaque-token"
        inquiry={{
          customerFirstName: "Ada",
          guestCount: 24,
          eventGoal: "Celebration",
          selectedEventPlanId: null,
        }}
        plans={[
          {
            id: "p1",
            tier: EVENT_PLAN_TIERS.BUDGET,
            title: "Budget Friendly",
            estimatedTotalCents: 380000,
            currency: "USD",
            durationMinutes: 180,
            customerFacingReason: "A focused celebration plan.",
            payload: {
              guestCount: 24,
              eventDate: "2026-10-15",
              startTime: "18:00",
              durationMinutes: 180,
              activities: [{ knowledgeItemId: "a", name: "Bowling", quantity: 4, priceCents: 0 }],
              dining: { label: "Pizza & Light Fare", priceCents: 0 },
              spaces: [],
              schedule: ["Bowling first."],
              pricingComplete: true,
            },
          },
          {
            id: "p2",
            tier: EVENT_PLAN_TIERS.BEST_FIT,
            title: "Best Fit",
            estimatedTotalCents: 500000,
            currency: "USD",
            durationMinutes: 180,
            customerFacingReason: "Best match for 24 guests.",
            payload: {
              guestCount: 24,
              eventDate: "2026-10-15",
              startTime: "18:00",
              durationMinutes: 180,
              activities: [{ knowledgeItemId: "b", name: "Go-Karts", quantity: 1, priceCents: 0 }],
              dining: { label: "Catered meal", priceCents: 0 },
              spaces: [],
              schedule: [],
              pricingComplete: true,
            },
          },
        ]}
      />,
    );

    expect(html).toContain("Your Personal Event Plan");
    expect(html).toContain("Riverside Fun Center Personal Event Planner");
    expect(html).toContain("RECOMMENDED");
    expect(html).toContain("Why We Recommend This");
    expect(html).toContain("Choose This Event Plan");
    expect(html).toContain("Activities");
    expect(html).toContain("Dining");
    expect(html).toContain("Event Length");
    expect(html).toContain("Final availability will be confirmed by our event team.");
    expect(html).not.toContain("Event Assistant");
    expect(html).not.toContain("AI Sales");
    expect(html).not.toContain("LLM");
    expect(html).not.toContain("chat");
    expect(html).not.toContain("recommendation engine");
    expect(html).not.toContain("model confidence");
    expect(html).toContain("does not reserve the date");
  });

  it("shows a confirmation screen after a plan is saved", () => {
    const html = renderToStaticMarkup(
      <PublicEventPlanView
        organizationName="Riverside Fun Center"
        currency="USD"
        token="opaque-token"
        inquiry={{
          customerFirstName: "Ada",
          guestCount: 24,
          eventGoal: "Celebration",
          selectedEventPlanId: "p2",
        }}
        plans={[
          {
            id: "p2",
            tier: EVENT_PLAN_TIERS.BEST_FIT,
            title: "Best Fit",
            estimatedTotalCents: 500000,
            currency: "USD",
            durationMinutes: 180,
            customerFacingReason: "Best match for 24 guests.",
            payload: {
              guestCount: 24,
              eventDate: "2026-10-15",
              startTime: "18:00",
              durationMinutes: 180,
              activities: [{ knowledgeItemId: "b", name: "Go-Karts", quantity: 1, priceCents: 0 }],
              dining: { label: "Catered meal", priceCents: 0 },
              spaces: [],
              schedule: [],
              pricingComplete: true,
            },
          },
        ]}
      />,
    );

    expect(html).toContain("Great choice — we saved your event plan.");
    expect(html).toContain("Riverside Fun Center event specialist");
    expect(html).toContain("not reserved yet");
    expect(html).not.toContain("Choose This Event Plan");
  });

  it("keeps a reassuring confirmation when availability changed after selection", () => {
    const html = renderToStaticMarkup(
      <PublicEventPlanView
        organizationName="Riverside Fun Center"
        currency="USD"
        token="opaque-token"
        inquiry={{
          customerFirstName: "Ada",
          guestCount: 24,
          eventGoal: "Celebration",
          selectedEventPlanId: "p2",
        }}
        plans={[
          {
            id: "p2",
            tier: EVENT_PLAN_TIERS.BEST_FIT,
            title: "Best Fit",
            estimatedTotalCents: 500000,
            currency: "USD",
            durationMinutes: 180,
            customerFacingReason: "Best match for 24 guests.",
            availabilityStatus: "AVAILABILITY_CHANGED",
            payload: {
              guestCount: 24,
              eventDate: "2026-10-15",
              startTime: "18:00",
              durationMinutes: 180,
              activities: [{ knowledgeItemId: "b", name: "Go-Karts", quantity: 1, priceCents: 0 }],
              dining: { label: "Catered meal", priceCents: 0 },
              spaces: [],
              schedule: [],
              pricingComplete: true,
            },
          },
        ]}
      />,
    );

    expect(html).toContain("We’ve saved your preferred event plan.");
    expect(html).toContain("confirm the final schedule and availability");
    expect(html).not.toContain("no longer available");
  });

  it("shows a confirmed event summary and blocks further selection", () => {
    const html = renderToStaticMarkup(
      <PublicEventPlanView
        organizationName="Riverside Fun Center"
        currency="USD"
        token="opaque-token"
        inquiry={{
          customerFirstName: "Ada",
          guestCount: 24,
          eventGoal: "Celebration",
          selectedEventPlanId: "p2",
          status: "BOOKED",
        }}
        booking={{
          bookingNumber: "RIV-2026-00001",
          eventDate: "2026-10-15",
          startTime: "18:00",
          endTime: "21:00",
          guestCount: 24,
        }}
        plans={[
          {
            id: "p2",
            tier: EVENT_PLAN_TIERS.BEST_FIT,
            title: "Best Fit",
            estimatedTotalCents: 500000,
            currency: "USD",
            durationMinutes: 180,
            customerFacingReason: "Best match for 24 guests.",
            payload: {
              guestCount: 24,
              eventDate: "2026-10-15",
              startTime: "18:00",
              durationMinutes: 180,
              activities: [{ knowledgeItemId: "b", name: "Go-Karts", quantity: 1, priceCents: 0 }],
              dining: { label: "Catered meal", priceCents: 0 },
              spaces: [],
              schedule: [],
              pricingComplete: true,
            },
          },
        ]}
      />,
    );

    expect(html).toContain("Your Event Is Confirmed");
    expect(html).toContain("RIV-2026-00001");
    expect(html).toContain("24 guests");
    expect(html).not.toContain("Choose This Event Plan");
    expect(html).not.toContain("not reserved yet");
  });
});
