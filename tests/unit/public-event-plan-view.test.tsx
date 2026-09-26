/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import path from "node:path";
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
  reservePublicEventPlanAction: vi.fn(),
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
              itinerary: [
                { startTime: "17:30", endTime: "18:30", label: "Fajita Bar" },
                { startTime: "18:30", endTime: "19:00", label: "Axe Throwing" },
              ],
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
    expect(html).toContain("Book Now");
    expect(html).toContain("Submit inquiry");
    expect(html).toContain("Attractions");
    expect(html).toContain("Dining");
    expect(html).toContain("Event Length");
    expect(html).toContain("Final availability will be confirmed by our event team.");
    expect(html).toContain("Booking is finalized after the required payment");
    expect(html).not.toContain("Event Assistant");
    expect(html).not.toContain("AI Sales");
    expect(html).not.toContain("LLM");
    expect(html).not.toContain("chat");
    expect(html).not.toContain("recommendation engine");
    expect(html).not.toContain("model confidence");
    expect(html).toContain("5:30 PM–6:30 PM Fajita Bar");
    expect(html).toContain("6:30 PM–7:00 PM Axe Throwing");
    expect(html).not.toContain("17:30–18:30");
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

    expect(html).toContain("Thanks — your inquiry has been submitted.");
    expect(html).toContain("events team will follow up");
    expect(html).toContain("Inventory is not reserved");
    expect(html).not.toContain("Book Now");
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

    expect(html).toContain("We’ve saved the package you’re interested in.");
    expect(html).toContain("confirm the final details and availability");
    expect(html).toContain("The time is not reserved");
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
    expect(html).not.toContain("Book Now");
    expect(html).not.toContain("not reserved yet");
  });

  it("shows a pending booking summary without claiming inventory is reserved", () => {
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
          salesStage: "DEPOSIT_PENDING",
        }}
        pendingBooking={{
          bookingNumber: "RIV-2026-00002",
          eventDate: "2026-10-15",
          startTime: "18:00",
          endTime: "21:00",
          guestCount: 24,
          totalCents: 500000,
          depositRequiredCents: 150000,
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

    expect(html).toContain("Booking request received");
    expect(html).toContain("Best Fit");
    expect(html).toContain("Estimated deposit");
    expect(html).toContain("inventory is not reserved");
    expect(html).toContain("Online payment is not enabled");
    expect(html).not.toContain("Book Now");
    expect(html).not.toContain("24-hour hold");
    expect(html).not.toContain("Held until");
  });

  it("captures form data before yielding so React does not drop currentTarget", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/public-event-plan-view.tsx"),
      "utf8",
    );
    const formDataAt = source.indexOf("new FormData(event.currentTarget)");
    const yieldAt = source.indexOf("await yieldToPaint()");
    expect(formDataAt).toBeGreaterThan(-1);
    expect(yieldAt).toBeGreaterThan(-1);
    expect(formDataAt).toBeLessThan(yieldAt);
    expect(source).toContain('pendingLabel="Booking…"');
    expect(source).toContain('pendingLabel="Submitting…"');
    expect(source).toContain("onSafeSubmitAttempt");
  });

  it("hides Book Now on unavailable options and shows a persistent adjustment notice", () => {
    const html = renderToStaticMarkup(
      <PublicEventPlanView
        organizationName="Riverside Fun Center"
        currency="USD"
        token="opaque-token"
        inquiry={{
          customerFirstName: "Ada",
          guestCount: 20,
          eventGoal: "Celebration",
          selectedEventPlanId: null,
        }}
        plans={[
          {
            id: "p1",
            tier: EVENT_PLAN_TIERS.BUDGET,
            title: "Good",
            estimatedTotalCents: 200000,
            currency: "USD",
            durationMinutes: 180,
            customerFacingReason: "Core attractions.",
            availabilityStatus: "UNAVAILABLE",
            payload: {
              guestCount: 20,
              eventDate: "2026-10-15",
              startTime: "18:00",
              durationMinutes: 180,
              activities: [{ knowledgeItemId: "bowl", name: "Bowling", quantity: 1, priceCents: 0 }],
              dining: { label: "Pizza", priceCents: 0 },
              spaces: [],
              schedule: [],
              itinerary: [{ startTime: "19:00", endTime: "20:00", label: "Bowling" }],
              pricingComplete: true,
            },
          },
          {
            id: "p2",
            tier: EVENT_PLAN_TIERS.BEST_FIT,
            title: "Recommended",
            estimatedTotalCents: 300000,
            currency: "USD",
            durationMinutes: 180,
            customerFacingReason: "Adjusted mix.",
            availabilityStatus: "AVAILABLE",
            payload: {
              guestCount: 20,
              eventDate: "2026-10-15",
              startTime: "18:30",
              durationMinutes: 180,
              activities: [{ knowledgeItemId: "axe", name: "Axe Throwing", quantity: 1, priceCents: 0 }],
              dining: { label: "Pizza", priceCents: 0 },
              spaces: [],
              schedule: [],
              itinerary: [{ startTime: "18:30", endTime: "19:00", label: "Axe Throwing" }],
              pricingComplete: true,
              itineraryAdjusted: true,
              adjustmentNote:
                "Axe Throwing is not available at the requested time, but we can accommodate the full event starting at 18:30.",
            },
          },
        ]}
      />,
    );

    expect(html).toContain("Axe Throwing is not available at the requested time");
    expect(html).toContain("6:30 PM");
    expect(html).not.toContain("18:30");
    expect(html).toContain("Adjusted from your requested time");
    expect(html).toContain("This option is not available at the requested time.");
    expect(html).toContain("Book Now");
    expect(html.split("Book Now").length - 1).toBe(1);
  });

  it("formats proposal copy once and keeps each tenant deposit percent", () => {
    function renderPercent(percent: number, depositCents: number) {
      return renderToStaticMarkup(
        <PublicEventPlanView
          organizationName="Riverside Fun Center"
          currency="USD"
          token="opaque-token"
          inquiry={{
            customerFirstName: "Ada",
            guestCount: 20,
            eventGoal: "Celebration",
            selectedEventPlanId: null,
          }}
          plans={[
            {
              id: `plan-${percent}`,
              tier: EVENT_PLAN_TIERS.BEST_FIT,
              title: "Recommended",
              estimatedTotalCents: 123000,
              currency: "USD",
              durationMinutes: 180,
              customerFacingReason:
                "Adds Unlimited Arcade Play for a broader experience. This option is 3 hours because it adds an hour of Unlimited Arcade Play.",
              availabilityStatus: "AVAILABLE",
              payload: {
                guestCount: 20,
                eventDate: "2026-10-15",
                startTime: "16:00",
                durationMinutes: 180,
                activities: [
                  { knowledgeItemId: "arcade", name: "1 Hour Unlimited Arcade Play", quantity: 1, priceCents: 0 },
                ],
                dining: { label: "Fajita Bar", priceCents: 0 },
                spaces: [],
                schedule: ["16:00–17:00 Fajita Bar"],
                itinerary: [{ startTime: "16:00", endTime: "17:00", label: "Fajita Bar" }],
                pricingComplete: true,
                depositPreviewCents: depositCents,
                depositPreviewPercent: percent,
                itineraryAdjusted: true,
                adjustmentNote:
                  "Your requested time overlaps existing Bowling reservations, so this option has been adjusted to start at 16:00.",
                customerAvailabilityNote:
                  "we can accommodate the full event starting at 16:00.",
                suggestedStartTimes: ["17:00", "04:00"],
                durationNote: "This option is 3 hours because it adds an hour of Unlimited Arcade Play.",
              },
            },
          ]}
        />,
      );
    }

    const tenantA = renderPercent(25, 30750);
    const tenantB = renderPercent(30, 36900);
    for (const html of [tenantA, tenantB]) {
      expect(html).toContain("Adds Unlimited Arcade Play for a broader experience.");
      expect(html).toContain("This option is 3 hours because it adds an hour of Unlimited Arcade Play.");
      expect(html).toContain("adjusted to start at 4:00 PM");
      expect(html).toContain("4:00 AM");
      expect(html).toContain("5:00 PM");
      expect(html).toContain("Adjusted to:");
      expect(html).not.toMatch(/AM PM|PM AM|\b16:00\b|\b17:00\b/);
    }
    expect(tenantA).toContain("Estimated deposit: $307.50 (25%). Payment is not collected yet.");
    expect(tenantA).not.toContain("30%");
    expect(tenantB).toContain("(30%)");
    expect(tenantB).not.toContain("(25%)");
    expect(tenantA).not.toContain("deposit preview");
  });
});
