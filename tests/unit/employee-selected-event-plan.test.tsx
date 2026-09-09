/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmployeeSelectedEventPlan } from "@/components/layout/employee-selected-event-plan";
import { EVENT_PLAN_TIERS } from "@/types/event-planner";

describe("employee selected event plan", () => {
  it("shows the selected plan for staff without claiming inventory is reserved", () => {
    const html = renderToStaticMarkup(
      <EmployeeSelectedEventPlan
        desiredDate={new Date("2026-10-15T00:00:00.000Z")}
        desiredStartTime="18:00"
        selectedAt={new Date("2026-09-09T12:00:00.000Z")}
        timeZone="UTC"
        plan={{
          id: "plan_1",
          tier: EVENT_PLAN_TIERS.BEST_FIT,
          title: "Best Fit",
          estimatedTotalCents: 445000,
          currency: "USD",
          durationMinutes: 180,
          customerFacingReason: "Best match for the employee appreciation event.",
          availabilityValidated: false,
          availabilityNote: "Known published limits were applied. Live inventory still needs confirmation before booking.",
          payload: {
            guestCount: 75,
            eventDate: "2026-10-15",
            startTime: "18:00",
            durationMinutes: 180,
            activities: [
              { knowledgeItemId: "kart", name: "Go-Karts", quantity: 1, priceCents: 135000 },
              { knowledgeItemId: "axe", name: "Axe Throwing", quantity: 1, priceCents: 150000 },
            ],
            dining: { label: "Catered Slider Bar", priceCents: 120000 },
            spaces: [{ knowledgeItemId: "room", name: "Private Event Room", priceCents: 40000 }],
            schedule: ["Go-Karts first."],
            pricingComplete: true,
            resourceRequirements: [
              {
                knowledgeItemId: "axe",
                knowledgeItemName: "Axe Throwing",
                resourceTypeId: null,
                resourceTypeSlug: "axe-throwing-lane",
                resourceTypeName: "Axe Throwing Lane",
                quantityRule: "UNKNOWN",
                quantity: null,
                guestsPerUnit: null,
                durationMinutes: 180,
                inventoryConfigured: false,
                requiresStaffConfiguration: true,
              },
            ],
          },
        }}
      />,
    );

    expect(html).toContain("CUSTOMER SELECTED PLAN — READY TO BOOK");
    expect(html).toContain("Customer Selected Plan");
    expect(html).toContain("Go-Karts");
    expect(html).toContain("Catered Slider Bar");
    expect(html).toContain("Private Event Room");
    expect(html).toContain("No — confirm before booking");
    expect(html).toContain("Inventory is not reserved");
    expect(html).toContain("Finite resources needed");
    expect(html).toContain("inventory not configured");
    expect(html).not.toContain("ranking");
    expect(html).not.toContain("Reserve inventory");
  });
});
