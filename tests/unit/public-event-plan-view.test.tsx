/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicEventPlanView } from "@/components/layout/public-event-plan-view";
import { PRODUCT_KINDS } from "@/types/catalog";
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
          eventType: "Birthday Party",
          desiredDate: "2026-10-15",
          desiredStartTime: "18:00",
          guestMix: "mixed_ages",
          diningPreference: "pizza_light",
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
                { startTime: "17:30", endTime: "18:30", label: "Fajita Bar", role: "DINING" },
                { startTime: "18:30", endTime: "19:00", label: "Axe Throwing", role: "ACTIVITY" },
              ],
              pricingComplete: true,
              depositPreviewCents: 114000,
              depositPreviewPercent: 30,
              budgetExplanationCode: "ABOVE_BUDGET",
              budgetDifferenceCents: 230000,
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
          {
            id: "p3",
            tier: EVENT_PLAN_TIERS.PREMIUM,
            title: "Premium Celebration",
            estimatedTotalCents: 720000,
            currency: "USD",
            durationMinutes: 180,
            customerFacingReason: "The fullest option.",
            payload: {
              guestCount: 24,
              eventDate: "2026-10-15",
              startTime: "18:00",
              durationMinutes: 180,
              activities: [{ knowledgeItemId: "c", name: "Laser Tag - 90 Minutes", quantity: 1, priceCents: 0 }],
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
    expect(html).toContain("data-event-summary");
    expect(html).toContain("Birthday Party");
    expect(html).toContain("Oct 15, 2026 at 6:00 PM");
    expect(html).toContain("24 guests");
    expect(html).toContain("Mix of Kids &amp; Adults");
    expect(html).toContain("Pizza &amp; Light Fare");
    expect(html).toContain("Recommended");
    expect(html).toContain("What&#x27;s included");
    expect(html).toContain("Great Value");
    expect(html).toContain("Best Balance");
    expect(html).toContain("Elevated Experience");
    expect(html).toContain("Good");
    expect(html).toContain("Recommended");
    expect(html).toContain("Premium");
    expect(html).toContain("$3,800");
    expect(html).not.toContain("below your preferred range");
    expect(html).not.toContain("above your preferred range");
    expect(html).not.toContain("text-destructive");
    expect(html).toContain("Estimated deposit");
    expect(html).toContain("(30%)");
    expect(html).toContain("Laser Tag — 90 minutes");
    expect(html).toContain("Request this package");
    expect(html).toContain("Request a follow-up");
    expect(html).not.toContain("Book Now");
    expect(html).not.toContain("Most Popular");
    const detailsAt = html.indexOf("data-plan-details");
    const actionsAt = html.indexOf("data-plan-actions");
    expect(detailsAt).toBeGreaterThan(-1);
    expect(actionsAt).toBeGreaterThan(detailsAt);
    expect(html.indexOf("Request this package")).toBeGreaterThan(actionsAt);
    expect(html.indexOf("Request a follow-up")).toBeGreaterThan(actionsAt);
    expect(html.slice(detailsAt, actionsAt)).toContain("What&#x27;s included");
    expect(html.slice(detailsAt, actionsAt)).not.toContain("Request this package");
    expect(html).toContain("What&#x27;s included");
    expect(html).not.toContain("Activities &amp; Experiences");
    expect(html).not.toContain("Food &amp; Drinks");
    expect(html).not.toContain("About this package");
    expect(html).toContain("3 hours");
    expect(html).toContain("Packages are estimates");
    expect(html).toContain("Requesting a package saves a booking request");
    expect(html).not.toContain("This saves a booking request. It does not confirm the date");
    expect(html).not.toContain("This saves this package as your preference");
    expect(html).not.toContain("Event Assistant");
    expect(html).not.toContain("AI Sales");
    expect(html).not.toContain("LLM");
    expect(html).not.toContain("chat");
    expect(html).not.toContain("recommendation engine");
    expect(html).not.toContain("model confidence");
    expect(html).toContain("Sample itinerary");
    expect(html).not.toContain("Sample timeline");
    expect(html).toContain("5:30–6:30 PM");
    expect(html).toContain("Dining · Fajita Bar");
    expect(html).toContain("6:30–7:00 PM");
    expect(html).toContain("Axe Throwing");
    expect(html).not.toContain("Dining: Fajita Bar");
    expect(html).not.toContain("17:30–18:30");
    expect(html).not.toMatch(/overflow-y-auto/);
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
    expect(html).toContain("The time is not held");
    expect(html).not.toContain("Request this package");
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
    expect(html).not.toContain("Request this package");
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
    expect(html).not.toContain("Request this package");
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
    expect(source).toContain('pendingLabel="Saving…"');
    expect(source).toContain('pendingLabel="Submitting…"');
    expect(source).toContain("onSafeSubmitAttempt");
    expect(source).toContain("reservePublicEventPlanAction");
    expect(source).toContain("selectPublicEventPlanAction");
    expect(source.indexOf("reservePublicEventPlanAction")).toBeLessThan(source.lastIndexOf("selectPublicEventPlanAction"));
  });

  it("does not claim current availability when status is NOT_VALIDATED, while still allowing a booking request", () => {
    const html = renderToStaticMarkup(
      <PublicEventPlanView
        organizationName="Riverside Fun Center"
        currency="USD"
        token="opaque-token"
        inquiry={{
          customerFirstName: "Ada",
          guestCount: 12,
          eventGoal: "Celebration",
          selectedEventPlanId: null,
        }}
        plans={[
          {
            id: "nv1",
            tier: EVENT_PLAN_TIERS.BEST_FIT,
            title: "Best Fit",
            estimatedTotalCents: 12000,
            currency: "USD",
            durationMinutes: 120,
            customerFacingReason: "Bowling plan.",
            availabilityStatus: "NOT_VALIDATED",
            payload: {
              guestCount: 12,
              eventDate: "2026-10-14",
              startTime: "18:00",
              durationMinutes: 120,
              activities: [{ knowledgeItemId: "b", name: "Bowling", quantity: 2, priceCents: 6000 }],
              dining: { label: "No food included", priceCents: 0 },
              spaces: [],
              schedule: [],
              pricingComplete: true,
              coverageFeasibility: "FEASIBLE",
              customerAvailabilityNote: "Known published limits were applied. Live inventory still needs confirmation before booking.",
            },
          },
        ]}
      />,
    );
    expect(html).toContain("Request this package");
    expect(html).toContain("Live inventory still needs confirmation before booking.");
    expect(html).not.toContain("Currently available");
    expect(html).not.toContain("Your date is confirmed");
    expect(html).not.toContain("This time is guaranteed available");
  });

  it("hides the continue action on unavailable options and shows a persistent adjustment notice", () => {
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
    expect(html).toContain("Request this package");
    expect(html).not.toContain("Currently available");
    const mobile = html.slice(html.indexOf('data-proposal-mobile'), html.indexOf('data-proposal-desktop'));
    const desktop = html.slice(html.indexOf('data-proposal-desktop'));
    expect(mobile.split(">Request this package<").length - 1).toBe(1);
    expect(desktop.split(">Request this package<").length - 1).toBe(1);
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
      expect(html).toContain("Unlimited Arcade Play and Fajita Bar dining");
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

function comparisonPlan(tier: string, id: string, totalCents: number) {
  return {
    id,
    tier,
    title: tier,
    estimatedTotalCents: totalCents,
    currency: "USD",
    durationMinutes: 120,
    customerFacingReason: `${id} reason`,
    availabilityStatus: "AVAILABLE",
    payload: {
      guestCount: 10,
      eventDate: "2026-10-15",
      startTime: "14:00",
      durationMinutes: 120,
      activities: [],
      dining: { label: "Pizza", priceCents: 0 },
      spaces: [],
      schedule: [],
      itinerary: [],
      pricingComplete: true,
    },
  };
}

describe("mobile proposal comparison", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows every card on the desktop grid and one selected card on the mobile selector", async () => {
    const user = userEvent.setup();
    render(
      <PublicEventPlanView
        organizationName="Riverside Fun Center"
        currency="USD"
        token="opaque-token"
        inquiry={{
          customerFirstName: "Ada",
          guestCount: 10,
          eventGoal: "Celebration",
          selectedEventPlanId: null,
        }}
        plans={[
          comparisonPlan(EVENT_PLAN_TIERS.BUDGET, "good-plan", 80000),
          comparisonPlan(EVENT_PLAN_TIERS.BEST_FIT, "recommended-plan", 120000),
          comparisonPlan(EVENT_PLAN_TIERS.PREMIUM, "premium-plan", 180000),
        ]}
      />,
    );

    const desktop = document.querySelector("[data-proposal-desktop]");
    const mobile = document.querySelector("[data-proposal-mobile]");
    expect(desktop?.className).toContain("hidden");
    expect(desktop?.className).toContain("lg:grid-cols-3");
    const articles = [...(desktop?.querySelectorAll("article") ?? [])];
    expect(articles).toHaveLength(3);
    for (const article of articles) {
      expect(article.className).toContain("box-border");
      expect(article.className).toContain("w-full");
      expect(article.className).toContain("outline-2");
      expect(article.className).not.toMatch(/\bring-/);
      expect(article.className).not.toMatch(/\bborder-[248]\b/);
    }
    expect(articles.filter((article) => article.className.includes("outline-primary/40"))).toHaveLength(1);
    expect(mobile?.className).toContain("lg:hidden");
    expect(mobile?.querySelectorAll("article")).toHaveLength(1);

    const selector = screen.getByRole("tablist", { name: "Proposal options" });
    const recommended = within(selector).getByRole("tab", { name: /Recommended/ });
    const good = within(selector).getByRole("tab", { name: /^Good/ });
    const premium = within(selector).getByRole("tab", { name: /Premium/ });
    expect(recommended.getAttribute("aria-selected")).toBe("true");
    expect(good.getAttribute("aria-selected")).toBe("false");
    expect(mobile?.getAttribute("role")).toBe("tabpanel");

    const mobileRegion = within(mobile as HTMLElement);
    expect(mobileRegion.getAllByRole("button", { name: /Request this package/ })).toHaveLength(1);
    expect(mobileRegion.getAllByRole("button", { name: /Request a follow-up/ })).toHaveLength(1);
    expect(mobileRegion.getAllByDisplayValue("recommended-plan")).toHaveLength(2);

    await user.click(good);
    expect(good.getAttribute("aria-selected")).toBe("true");
    expect(mobileRegion.getAllByDisplayValue("good-plan")).toHaveLength(2);
    expect(mobileRegion.queryByDisplayValue("recommended-plan")).toBeNull();
    expect(mobileRegion.getAllByRole("button", { name: /Request this package/ })).toHaveLength(1);

    await user.click(premium);
    expect(premium.getAttribute("aria-selected")).toBe("true");
    expect(mobileRegion.getAllByDisplayValue("premium-plan")).toHaveLength(2);
    expect(mobileRegion.queryByDisplayValue("good-plan")).toBeNull();
    expect(mobile?.querySelectorAll("article")).toHaveLength(1);
    expect(desktop?.querySelectorAll("article")).toHaveLength(3);
    expect(mobile?.querySelector("[data-plan-details]")?.className).not.toMatch(/overflow-y-auto/);
    expect(desktop?.querySelector("[data-plan-details]")?.className).not.toMatch(/overflow-y-auto/);
    expect(mobile?.className).toContain("overflow-x-hidden");
    expect(desktop?.className).toContain("overflow-x-hidden");
    expect(articles.every((article) => article.className.includes("min-w-0"))).toBe(true);
  });
});

function catalogLine(
  productId: string,
  slug: string,
  name: string,
  kind: string,
  quantity: number,
  unitPriceCents: number,
  unitLabel?: string,
) {
  return {
    productId,
    slug,
    name,
    kind,
    quantity,
    unitLabel,
    unitPriceCents,
    totalCents: quantity * unitPriceCents,
  };
}

function generationsCatalogPlan(
  id: string,
  tier: string,
  diningName: string,
  diningSlug: string,
  diningQuantity: number,
  diningUnitCents: number,
  extras: Record<string, unknown> = {},
) {
  const diningTotal = diningQuantity * diningUnitCents;
  return {
    id,
    tier,
    title: tier,
    estimatedTotalCents: 18000 + diningTotal,
    currency: "USD",
    durationMinutes: 180,
    customerFacingReason: `${diningName} package.`,
    availabilityStatus: "AVAILABLE",
    payload: {
      catalogBacked: true,
      guestCount: 20,
      eventDate: "2026-10-24",
      startTime: "16:00",
      durationMinutes: 180,
      activities: [
        { knowledgeItemId: "bowl", productId: "bowling-1h", name: "1 Hour Bowling", quantity: 1, priceCents: 18000 },
      ],
      dining: { label: diningName, quantity: diningQuantity, priceCents: diningTotal },
      spaces: [],
      schedule: [],
      itinerary: [],
      pricingComplete: true,
      lineItems: [
        catalogLine("bowling-1h", "bowling-1h", "1 Hour Bowling", PRODUCT_KINDS.ATTRACTION, 1, 18000),
        catalogLine("food", diningSlug, diningName, PRODUCT_KINDS.FOOD, diningQuantity, diningUnitCents, diningQuantity === 5 ? "combo" : "person"),
      ],
      ...extras,
    },
  };
}

describe("catalog-backed and fallback proposals", () => {
  it("renders Generations catalog dining labels, quantities, and proven upgrades", () => {
    const html = renderToStaticMarkup(
      <PublicEventPlanView
        organizationName="Generations Adventureplex"
        currency="USD"
        token="generations-token"
        inquiry={{
          customerFirstName: "Sam",
          guestCount: 20,
          eventGoal: "Family Fun",
          eventType: "Birthday Party",
          desiredDate: "2026-10-24",
          desiredStartTime: "16:00",
          guestMix: "mostly_children",
          diningPreference: "not_sure",
          selectedEventPlanId: null,
        }}
        plans={[
          generationsCatalogPlan(
            "gen-good",
            EVENT_PLAN_TIERS.BUDGET,
            "Pizza & Pitcher Combination",
            "pizza-pitcher-combo",
            5,
            2000,
          ),
          generationsCatalogPlan(
            "gen-rec",
            EVENT_PLAN_TIERS.BEST_FIT,
            "Slider Bar",
            "slider-bar",
            20,
            3000,
            {
              compositionDelta: {
                comparedWithTier: EVENT_PLAN_TIERS.BUDGET,
                addedProductNames: [],
                foodFrom: "Pizza & Pitcher Combination",
                foodTo: "Slider Bar",
                spaceAdded: null,
                fulfillmentChanges: [],
              },
            },
          ),
          generationsCatalogPlan(
            "gen-prem",
            EVENT_PLAN_TIERS.PREMIUM,
            "Smokehouse BBQ",
            "smokehouse-bbq",
            20,
            3500,
            {
              compositionDelta: {
                comparedWithTier: EVENT_PLAN_TIERS.BEST_FIT,
                addedProductNames: [],
                foodFrom: "Slider Bar",
                foodTo: "Smokehouse BBQ",
                spaceAdded: null,
                fulfillmentChanges: [],
              },
            },
          ),
        ]}
      />,
    );

    expect(html).toContain("Birthday Party");
    expect(html).toContain("20 guests");
    expect(html).toContain("Mostly Kids / Youth");
    expect(html).toContain("Pizza &amp; Pitcher Combination — 5 combos");
    expect(html).toContain("Slider Bar — 20 guests");
    expect(html).toContain("Smokehouse BBQ — 20 guests");
    expect(html).toContain("Bowling and Pizza &amp; Pitcher Combination dining");
    expect(html).toContain("Bowling with upgraded Slider Bar dining");
    expect(html).toContain("Bowling with upgraded Smokehouse BBQ dining");
    expect(html).not.toContain("Adds 1 Hour Bowling");
    expect(html).not.toContain("Includes private event space");
    expect(html).not.toContain("Most Popular");
    expect(html).toContain('value="gen-good"');
    expect(html).toContain('value="gen-rec"');
    expect(html).toContain('value="gen-prem"');
    expect(html).toContain("Packages are estimates");
    expect(html).not.toContain("Inventory occupancy looks open");
    expect(html).not.toContain("Your date is confirmed");
    expect(html).not.toContain("Book Now");
  });

  it("renders a non-Generations fallback proposal without inventing catalog prices", () => {
    const html = renderToStaticMarkup(
      <PublicEventPlanView
        organizationName="Riverside Fun Center"
        currency="USD"
        token="riverside-token"
        inquiry={{
          customerFirstName: "Ada",
          guestCount: 12,
          eventGoal: "Team Building",
          eventType: "Corporate Event",
          selectedEventPlanId: null,
        }}
        plans={[
          {
            id: "riv-good",
            tier: EVENT_PLAN_TIERS.BUDGET,
            title: "Good",
            estimatedTotalCents: 90000,
            currency: "USD",
            durationMinutes: 120,
            customerFacingReason: "A focused bowling plan.",
            availabilityStatus: "NOT_VALIDATED",
            payload: {
              catalogBacked: false,
              guestCount: 12,
              eventDate: null,
              startTime: null,
              durationMinutes: 120,
              activities: [{ knowledgeItemId: "bowl", name: "Bowling", quantity: 2, unitLabel: "lane", priceCents: 0 }],
              dining: { label: "Pizza & Light Fare", priceCents: 0 },
              spaces: [],
              schedule: [],
              itinerary: [],
              pricingComplete: true,
            },
          },
          {
            id: "riv-rec",
            tier: EVENT_PLAN_TIERS.BEST_FIT,
            title: "Recommended",
            estimatedTotalCents: 120000,
            currency: "USD",
            durationMinutes: 120,
            customerFacingReason: "Adds go-karts.",
            availabilityStatus: "NOT_VALIDATED",
            payload: {
              catalogBacked: false,
              guestCount: 12,
              eventDate: null,
              startTime: null,
              durationMinutes: 120,
              activities: [
                { knowledgeItemId: "bowl", name: "Bowling", quantity: 2, unitLabel: "lane", priceCents: 0 },
                { knowledgeItemId: "kart", name: "Go-Karts", quantity: 1, priceCents: 0 },
              ],
              dining: { label: "Pizza & Light Fare", priceCents: 0 },
              spaces: [],
              schedule: [],
              itinerary: [],
              pricingComplete: true,
            },
          },
        ]}
      />,
    );

    expect(html).toContain("Corporate Event");
    expect(html).toContain("Not specified");
    expect(html).toContain("Pizza &amp; Light Fare");
    expect(html).toContain("A component breakdown is not available for this estimate.");
    expect(html).toContain("Bowling and Go-Karts");
    expect(html).not.toContain("5 × Pizza");
    expect(html).not.toContain("Pizza &amp; Pitcher Combination");
    expect(html).not.toContain("Slider Bar");
    expect(html).not.toContain("Smokehouse BBQ");
    expect(html).not.toContain("Generations Adventureplex");
    expect(html).toContain("Riverside Fun Center");
    expect(html).toContain('value="riv-good"');
    expect(html).toContain('value="riv-rec"');
  });

  it("does not present an unresolved dining preference as a purchased food item", () => {
    const html = renderToStaticMarkup(
      <PublicEventPlanView
        organizationName="Riverside Fun Center"
        currency="USD"
        token="riverside-token"
        inquiry={{
          customerFirstName: "Ada",
          guestCount: 12,
          eventGoal: "Team Building",
          selectedEventPlanId: null,
        }}
        plans={[
          {
            id: "riv-open",
            tier: EVENT_PLAN_TIERS.BUDGET,
            title: "Good",
            estimatedTotalCents: 90000,
            currency: "USD",
            durationMinutes: 120,
            customerFacingReason: "A focused bowling plan.",
            payload: {
              catalogBacked: false,
              guestCount: 12,
              eventDate: null,
              startTime: null,
              durationMinutes: 120,
              activities: [{ knowledgeItemId: "bowl", name: "Bowling", quantity: 1, priceCents: 0 }],
              dining: { label: "Not Sure — Recommend Something", priceCents: 0 },
              spaces: [],
              schedule: [],
              pricingComplete: false,
            },
          },
        ]}
      />,
    );

    expect(html).toContain("Dining to be confirmed");
    expect(html).not.toContain("Not Sure — Recommend Something");
  });

  it("does not claim a private room or upgrade when the payload does not prove one", () => {
    const html = renderToStaticMarkup(
      <PublicEventPlanView
        organizationName="Riverside Fun Center"
        currency="USD"
        token="opaque-token"
        inquiry={{
          customerFirstName: "Ada",
          guestCount: 10,
          eventGoal: "Celebration",
          selectedEventPlanId: null,
        }}
        plans={[
          comparisonPlan(EVENT_PLAN_TIERS.BUDGET, "good-plan", 80000),
          comparisonPlan(EVENT_PLAN_TIERS.BEST_FIT, "recommended-plan", 80000),
        ]}
      />,
    );

    expect(html).not.toContain("Upgraded from");
    expect(html).not.toContain("Includes private event space");
    expect(html).not.toContain("Private Space / Room");
    expect(html).not.toContain("Most Popular");
  });

  it("does not promise three choices when only one package is available", () => {
    const html = renderToStaticMarkup(
      <PublicEventPlanView
        organizationName="Riverside Fun Center"
        currency="USD"
        token="one-token"
        inquiry={{
          customerFirstName: "Ada",
          guestCount: 12,
          eventGoal: "Team Building",
          selectedEventPlanId: null,
        }}
        plans={[
          {
            id: "only-good",
            tier: EVENT_PLAN_TIERS.BEST_FIT,
            title: "Recommended",
            estimatedTotalCents: 90000,
            currency: "USD",
            durationMinutes: 120,
            customerFacingReason: "A complete bowling plan.",
            payload: {
              guestCount: 12,
              eventDate: "2026-10-17",
              startTime: "14:00",
              durationMinutes: 120,
              activities: [{ knowledgeItemId: "bowl", name: "Bowling", quantity: 1, priceCents: 0 }],
              dining: { label: "Dining to be confirmed", priceCents: 0 },
              spaces: [],
              schedule: [],
              pricingComplete: true,
            },
          },
        ]}
      />,
    );
    expect(html).toContain("prepared a package for Ada");
    expect(html).toContain("Review what is included");
    expect(html).not.toContain("prepared packages for Ada");
    expect(html).not.toContain("Compare what is included");
    expect(html).toContain('value="only-good"');
    expect(html).toContain("Request this package");
  });

  it("shows an overflow as a sample list instead of invented clock times", () => {
    const html = renderToStaticMarkup(
      <PublicEventPlanView
        organizationName="Riverside Fun Center"
        currency="USD"
        token="overflow-token"
        inquiry={{
          customerFirstName: "Ada",
          guestCount: 20,
          eventGoal: "Birthday Party",
          selectedEventPlanId: null,
        }}
        plans={[
          {
            id: "youth-2h",
            tier: EVENT_PLAN_TIERS.BUDGET,
            title: "Good",
            estimatedTotalCents: 110000,
            currency: "USD",
            durationMinutes: 120,
            customerFacingReason: "Includes laser and arcade.",
            payload: {
              guestCount: 20,
              eventDate: "2026-10-17",
              startTime: "14:00",
              durationMinutes: 120,
              activities: [
                { knowledgeItemId: "laser", name: "Unlimited Laser Tag - 90 Minutes", quantity: 1, priceCents: 0 },
                { knowledgeItemId: "arcade", name: "1 Hour Unlimited Arcade Play", quantity: 1, priceCents: 0 },
              ],
              dining: { label: "Pizza & Pitcher Combination", priceCents: 10000 },
              spaces: [],
              schedule: ["Unlimited Laser Tag - 90 Minutes (90 minutes)", "1 Hour Unlimited Arcade Play (60 minutes)"],
              itinerary: [],
              itineraryPrecise: false,
              scheduleLimitation:
                "These activities need 2 hours 30 minutes, which is longer than the requested 2 hours. The timeline is a sample until our team confirms the flow.",
              pricingComplete: true,
            },
          },
        ]}
      />,
    );
    expect(html).toContain("Unlimited Laser Tag");
    expect(html).toContain("longer than the requested 2 hours");
    expect(html).not.toContain("2:00 PM–3:30 PM");
    expect(html).not.toContain("3:30 PM–4:30 PM");
    expect(html).not.toContain("Request this package");
    expect(html).toContain("Request a follow-up");
    expect(html).not.toContain("This option is not available at the requested time.");
  });

  it("still allows continue when clocks are a sample but no schedule conflict is proven", () => {
    const html = renderToStaticMarkup(
      <PublicEventPlanView
        organizationName="Riverside Fun Center"
        currency="USD"
        token="sample-token"
        inquiry={{
          customerFirstName: "Ada",
          guestCount: 12,
          eventGoal: "Birthday Party",
          selectedEventPlanId: null,
        }}
        plans={[
          {
            id: "sample-good",
            tier: EVENT_PLAN_TIERS.BUDGET,
            title: "Good",
            estimatedTotalCents: 70000,
            currency: "USD",
            durationMinutes: 120,
            customerFacingReason: "Bowling and pizza.",
            availabilityStatus: "NOT_VALIDATED",
            payload: {
              guestCount: 12,
              eventDate: "2026-10-17",
              startTime: "14:00",
              durationMinutes: 120,
              activities: [{ knowledgeItemId: "bowl", name: "Bowling", quantity: 1, priceCents: 0 }],
              dining: { label: "Pizza & Pitcher Combination", priceCents: 8000 },
              spaces: [],
              schedule: ["Bowling (60 minutes)", "Pizza & Pitcher Combination included during the event"],
              itinerary: [],
              itineraryPrecise: false,
              scheduleLimitation: null,
              customerAvailabilityNote:
                "Inventory occupancy looks open for this sample itinerary. Operating hours and a final check still need confirmation.",
              pricingComplete: true,
            },
          },
        ]}
      />,
    );
    expect(html).toContain("Request this package");
    expect(html).toContain("Pizza &amp; Pitcher Combination");
    expect(html).toContain("Packages are estimates");
    expect(html).not.toContain("longer than the requested");
  });

  it("lets a feasible package continue while blocking an infeasible sibling", () => {
    const html = renderToStaticMarkup(
      <PublicEventPlanView
        organizationName="Riverside Fun Center"
        currency="USD"
        token="mixed-token"
        inquiry={{
          customerFirstName: "Ada",
          guestCount: 20,
          eventGoal: "Birthday Party",
          selectedEventPlanId: null,
        }}
        plans={[
          {
            id: "feasible-good",
            tier: EVENT_PLAN_TIERS.BUDGET,
            title: "Good",
            estimatedTotalCents: 80000,
            currency: "USD",
            durationMinutes: 180,
            customerFacingReason: "Laser and pizza.",
            payload: {
              guestCount: 20,
              eventDate: "2026-10-17",
              startTime: "14:00",
              durationMinutes: 180,
              activities: [{ knowledgeItemId: "laser", name: "Unlimited Laser Tag - 90 Minutes", quantity: 1, priceCents: 0 }],
              dining: { label: "Pizza & Pitcher Combination", priceCents: 10000 },
              spaces: [],
              schedule: [],
              itineraryPrecise: true,
              pricingComplete: true,
            },
          },
          {
            id: "infeasible-premium",
            tier: EVENT_PLAN_TIERS.PREMIUM,
            title: "Premium",
            estimatedTotalCents: 140000,
            currency: "USD",
            durationMinutes: 120,
            customerFacingReason: "Laser and arcade.",
            payload: {
              guestCount: 20,
              eventDate: "2026-10-17",
              startTime: "14:00",
              durationMinutes: 120,
              activities: [
                { knowledgeItemId: "laser", name: "Unlimited Laser Tag - 90 Minutes", quantity: 1, priceCents: 0 },
                { knowledgeItemId: "arcade", name: "1 Hour Unlimited Arcade Play", quantity: 1, priceCents: 0 },
              ],
              dining: { label: "Smokehouse BBQ", priceCents: 20000 },
              spaces: [],
              schedule: ["Unlimited Laser Tag - 90 Minutes (90 minutes)", "1 Hour Unlimited Arcade Play (60 minutes)"],
              itineraryPrecise: false,
              scheduleLimitation:
                "These activities need 2 hours 30 minutes, which is longer than the requested 2 hours. The timeline is a sample until our team confirms the flow.",
              pricingComplete: true,
            },
          },
        ]}
      />,
    );
    expect(html).toContain('value="feasible-good"');
    expect(html).toContain('value="infeasible-premium"');
    expect(html.split(">Request this package<").length - 1).toBe(2);
    expect(html).toContain("Request a follow-up");
    expect(html).toContain("longer than the requested 2 hours");
    expect(html).not.toContain("Your date is confirmed");
  });

  it("keeps the plan page as a page-scrolling public shell", () => {
    const planPage = readFileSync(path.join(process.cwd(), "src/app/plan/[token]/page.tsx"), "utf8");
    expect(planPage).toContain("PublicCustomerShell");
    expect(planPage).not.toContain("contained");
  });
});

function bowlingOnlyPlan(
  id: string,
  tier: string,
  diningName: string,
  diningSlug: string,
  diningQuantity: number,
  diningUnitCents: number,
  diningUnit: string,
  extras: Record<string, unknown> = {},
) {
  const bowlingCents = 12000;
  const shoeCents = 7000;
  const diningTotal = diningQuantity * diningUnitCents;
  return {
    id,
    tier,
    title: tier,
    estimatedTotalCents: bowlingCents + shoeCents + diningTotal,
    currency: "USD",
    durationMinutes: 180,
    customerFacingReason: `${diningName} package.`,
    availabilityStatus: "AVAILABLE",
    payload: {
      catalogBacked: true,
      guestCount: 20,
      eventDate: "2026-10-24",
      startTime: "17:00",
      durationMinutes: 180,
      activities: [
        { knowledgeItemId: "bowl", productId: "bowling-1h", name: "Bowling - 1 Hour", quantity: 2, unitLabel: "lane", priceCents: bowlingCents },
      ],
      dining: { label: diningName, quantity: diningQuantity, priceCents: diningTotal },
      spaces: [],
      schedule: [],
      itinerary: [
        {
          startTime: "17:00",
          endTime: "18:00",
          label: `Dining: ${diningName}`,
          role: "DINING",
          durationMinutes: 60,
        },
        {
          startTime: "18:00",
          endTime: "19:00",
          label: "Bowling",
          role: "ACTIVITY",
          durationMinutes: 60,
        },
      ],
      itineraryPrecise: true,
      pricingComplete: true,
      lineItems: [
        catalogLine("bowling-1h", "bowling-1h", "Bowling - 1 Hour", PRODUCT_KINDS.ATTRACTION, 2, 6000, "lane"),
        catalogLine("bowling-1h", "bowling-1h", "Bowling - 1 Hour shoes", PRODUCT_KINDS.ATTRACTION, 20, 350, "pair"),
        catalogLine("food", diningSlug, diningName, PRODUCT_KINDS.FOOD, diningQuantity, diningUnitCents, diningUnit),
      ],
      ...extras,
    },
  };
}

describe("simplified bowling-only package cards", () => {
  afterEach(() => {
    cleanup();
  });

  const bowlingPlans = [
    bowlingOnlyPlan("bowl-good", EVENT_PLAN_TIERS.BUDGET, "Pizza & Pitcher Combination", "pizza-pitcher-combo", 5, 2000, "combo"),
    bowlingOnlyPlan(
      "bowl-rec",
      EVENT_PLAN_TIERS.BEST_FIT,
      "Slider Bar",
      "slider-bar",
      20,
      3000,
      "person",
      {
        compositionDelta: {
          comparedWithTier: EVENT_PLAN_TIERS.BUDGET,
          addedProductNames: [],
          foodFrom: "Pizza & Pitcher Combination",
          foodTo: "Slider Bar",
          spaceAdded: null,
          fulfillmentChanges: [],
        },
      },
    ),
    bowlingOnlyPlan(
      "bowl-prem",
      EVENT_PLAN_TIERS.PREMIUM,
      "Smokehouse BBQ",
      "smokehouse-bbq",
      20,
      3500,
      "person",
      {
        compositionDelta: {
          comparedWithTier: EVENT_PLAN_TIERS.BEST_FIT,
          addedProductNames: [],
          foodFrom: "Slider Bar",
          foodTo: "Smokehouse BBQ",
          spaceAdded: null,
          fulfillmentChanges: [],
        },
      },
    ),
  ];

  function renderBowlingCards() {
    return (
      <PublicEventPlanView
        organizationName="Generations Adventureplex"
        currency="USD"
        token="bowling-token"
        inquiry={{
          customerFirstName: "Sam",
          guestCount: 20,
          eventGoal: "Birthday Party",
          eventType: "Birthday Party",
          desiredDate: "2026-10-24",
          desiredStartTime: "17:00",
          guestMix: "mostly_adults",
          diningPreference: "yes",
          selectedEventPlanId: null,
        }}
        plans={bowlingPlans}
      />
    );
  }

  it("renders all three bowling-only tiers with accurate totals and inclusions", () => {
    const html = renderToStaticMarkup(renderBowlingCards());
    expect(html).toContain("Great Value");
    expect(html).toContain("Best Balance");
    expect(html).toContain("Elevated Experience");
    expect(html).toContain("$290");
    expect(html).toContain("$790");
    expect(html).toContain("$890");
    expect(html).toContain("$14.50 per guest · 20 guests");
    expect(html).toContain("$39.50 per guest · 20 guests");
    expect(html).toContain("$44.50 per guest · 20 guests");
    expect(html).toContain("Bowling — 1 hour");
    expect(html).toContain("Bowling shoes for 20 guests");
    expect(html).toContain("Pizza &amp; Pitcher Combination — 5 combos");
    expect(html).toContain("Slider Bar — 20 guests");
    expect(html).toContain("Smokehouse BBQ — 20 guests");
    expect(html).toContain("Bowling and Pizza &amp; Pitcher Combination dining");
    expect(html).toContain("Bowling with upgraded Slider Bar dining");
    expect(html).toContain("Bowling with upgraded Smokehouse BBQ dining");
    expect(html).not.toContain("Arcade");
    expect(html).not.toContain("Axe Throwing");
    expect(html).not.toContain("Laser Tag");
    expect(html).not.toContain("Activities &amp; Experiences");
    expect(html).not.toContain("About this package");
    expect(html).toContain("5:00–6:00 PM");
    expect(html).toContain("Dining · Pizza &amp; Pitcher Combination");
    expect(html).toContain("Dining · Slider Bar");
    expect(html).toContain("Dining · Smokehouse BBQ");
    expect(html).toContain("6:00–7:00 PM");
    expect(html).toContain("Bowling: $120");
    expect(html).toContain("Bowling shoes: $70");
    expect(html).toContain("Pizza &amp; Pitcher Combination: $100");
    expect(html).toContain("Slider Bar: $600");
    expect(html).toContain("Smokehouse BBQ: $700");
    expect(html).toContain("Estimated total: $290");
    expect(html).toContain("Estimated total: $790");
    expect(html).toContain("Estimated total: $890");
    expect(html).toContain("Packages are estimates");
    expect(html).toContain("Request this package");
    expect(html).toContain("Request a follow-up");
    expect(html).not.toContain("below your preferred range");
    expect(html).not.toContain("This saves a booking request. It does not confirm the date");
    expect(html).not.toContain("This saves this package as your preference");
    expect(html).toContain("outline-transparent");
    expect(html).toContain("border-border");
  });

  it("keeps the price breakdown collapsed until a customer opens it", async () => {
    const user = userEvent.setup();
    render(renderBowlingCards());
    const desktop = document.querySelector("[data-proposal-desktop]") as HTMLElement;
    const disclosures = desktop.querySelectorAll<HTMLDetailsElement>("[data-price-breakdown-disclosure]");
    expect(disclosures).toHaveLength(3);
    for (const disclosure of disclosures) {
      expect(disclosure.open).toBe(false);
      expect(disclosure.getAttribute("open")).toBeNull();
    }
    const good = disclosures[0];
    await user.click(within(good).getByText("View price breakdown"));
    expect(good.open).toBe(true);
    expect(good.textContent).toContain("Bowling: $120");
    expect(good.textContent).toContain("Bowling shoes: $70");
    expect(good.textContent).toContain("Pizza & Pitcher Combination: $100");
    expect(good.textContent).toContain("Estimated total: $290");
  });

  it("highlights Recommended and keeps both customer actions wired to existing handlers", () => {
    const html = renderToStaticMarkup(renderBowlingCards());
    const desktop = html.slice(html.indexOf("data-proposal-desktop"));
    expect(desktop).toContain("outline-primary/40");
    expect(desktop.split("outline-primary/40").length - 1).toBe(1);
    const source = readFileSync(path.join(process.cwd(), "src/components/layout/public-event-plan-view.tsx"), "utf8");
    expect(source).toContain("submit(event, reservePublicEventPlanAction");
    expect(source).toContain("submit(event, selectPublicEventPlanAction");
    expect(html).toContain('value="bowl-good"');
    expect(html).toContain('value="bowl-rec"');
    expect(html).toContain('value="bowl-prem"');
  });
});
