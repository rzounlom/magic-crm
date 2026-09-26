import { describe, expect, it } from "vitest";

import { composeEventItinerary, itinerarySpanMinutes } from "@/server/catalog/itinerary";
import { customerActivityName, eventDurationExplanation, resolveSchedulingBehavior } from "@/server/catalog/scheduling-behavior";
import { formatDesiredDuration, formatDurationMinutes, formatEventDuration } from "@/lib/event-planner/labels";
import { formatAdjustedEventWindow, formatCustomerFacingClocks } from "@/lib/inquiries/tenant-datetime";
import { searchViableStructuredItinerary } from "@/server/resources/itinerary-search";
import { customerAdjustmentNote, stampPlanResourceWindows } from "@/server/resources/segment-windows";
import { rangesOverlap, parseClockToMinutes } from "@/server/resources/time-window";
import { RESOURCE_QUANTITY_RULES, type PlanResourceRequirement } from "@/types/resource-schedule";

function requirement(name: string, productId: string, slug: string, quantity = 1): PlanResourceRequirement {
  return {
    knowledgeItemId: productId,
    knowledgeItemName: name,
    productId,
    resourceTypeId: slug,
    resourceTypeSlug: slug,
    resourceTypeName: name,
    quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
    quantity,
    guestsPerUnit: null,
    durationMinutes: 60,
    inventoryConfigured: true,
    requiresStaffConfiguration: false,
  };
}

function minutes(value: string): number {
  return parseClockToMinutes(value) ?? 0;
}

describe("proposal itinerary coherence", () => {
  it("derives event length from the scheduled span", () => {
    const twoHours = composeEventItinerary({
      startTime: "16:00",
      foodFirst: true,
      products: [
        { id: "food", name: "Fajita Bar", kind: "FOOD", durationMinutes: 60 },
        { id: "bowl", name: "Bowling - 1 Hour", kind: "ATTRACTION", durationMinutes: 60, hasResourceRequirements: true },
      ],
    });
    expect(twoHours.eventLengthMinutes).toBe(120);
    expect(formatDurationMinutes(twoHours.eventLengthMinutes)).toBe("2 hours");

    const threeHours = composeEventItinerary({
      startTime: "17:00",
      foodFirst: true,
      products: [
        { id: "food", name: "Fajita Bar", kind: "FOOD", durationMinutes: 60 },
        { id: "arcade", name: "Unlimited Arcade - 1 Hour", kind: "ATTRACTION", durationMinutes: 60, hasResourceRequirements: true },
        { id: "bowl", name: "Bowling - 1 Hour", kind: "ATTRACTION", durationMinutes: 60, hasResourceRequirements: true },
      ],
    });
    expect(threeHours.eventLengthMinutes).toBe(180);
    expect(itinerarySpanMinutes(threeHours.itinerary)).toBe(180);
    expect(formatEventDuration(90)).toBe("1 hour 30 minutes");
    expect(formatDurationMinutes(396)).toBe("6 hours 36 minutes");
    expect(formatEventDuration(300)).toBe("5 hours");
    expect(formatDesiredDuration(300)).toBe("5+ hours");
  });

  it("keeps a shifted 2-hour good proposal at 2 hours", async () => {
    const products = [
      { id: "food", name: "Fajita Bar", kind: "FOOD", durationMinutes: 60 },
      { id: "bowl", name: "Bowling - 1 Hour", kind: "ATTRACTION", durationMinutes: 60, hasResourceRequirements: true },
    ];
    const result = await searchViableStructuredItinerary({
      requestedStartTime: "17:00",
      durationMinutes: 120,
      foodFirst: true,
      products,
      baseRequirements: [requirement("Bowling - 1 Hour", "bowl", "bowling-lane", 4)],
      check: async ({ startTime, requirements, eventLengthMinutes }) => {
        const bowling = requirements.find((row) => row.productId === "bowl");
        const overlaps = bowling?.windowStartTime
          ? rangesOverlap(
              { startMinute: minutes(bowling.windowStartTime), endMinute: minutes(bowling.windowEndTime ?? bowling.windowStartTime) },
              { startMinute: minutes("18:00"), endMinute: minutes("19:00") },
            )
          : true;
        return {
          validated: true,
          available: !overlaps && eventLengthMinutes === 120 && startTime !== "17:00",
          note: "",
          types: overlaps
            ? [{ resourceTypeSlug: "bowling-lane", resourceTypeName: "Bowling", requestedQuantity: 4, availableQuantity: 0, inventoryConfigured: true, conflict: true, requiresStaffConfiguration: false }]
            : [],
        };
      },
    });
    expect(result?.startTime).toBe("16:00");
    expect(result?.eventLengthMinutes).toBe(120);
    expect(result?.itinerary.filter((row) => row.role !== "SPACE").map((row) => `${row.startTime}–${row.endTime} ${row.label}`)).toEqual([
      "16:00–17:00 Fajita Bar",
      "17:00–18:00 Bowling - 1 Hour",
    ]);
    const bowling = result?.requirements.find((row) => row.productId === "bowl");
    expect(bowling?.windowStartTime).toBe("17:00");
    expect(bowling?.windowEndTime).toBe("18:00");
    expect(result?.adjustmentNote).toContain("16:00");
    expect(result?.adjustmentNote).toContain("overlaps existing Bowling reservations");
    const rendered = formatCustomerFacingClocks(result?.adjustmentNote);
    expect(rendered).toContain("4:00 PM");
    expect(rendered).not.toMatch(/AM PM|PM AM|\b16:00\b/);
  });

  it("names scheduled time added beyond the base option", () => {
    const baseline = ["Fajita Bar", "Bowling - 1 Hour"];
    const arcade = { name: "1 Hour Unlimited Arcade Play", durationMinutes: 60 };
    const bowling = { name: "Bowling - 1 Hour", durationMinutes: 60 };
    const food = { name: "Fajita Bar", durationMinutes: 60 };
    expect(customerActivityName("1 Hour Unlimited Arcade Play")).toBe("Unlimited Arcade Play");
    expect(
      eventDurationExplanation({
        requestedMinutes: 120,
        eventLengthMinutes: 180,
        sequenced: [food, arcade, bowling],
        roomMinutes: 180,
        baselineNames: baseline,
      }),
    ).toBe("This option is 3 hours because it adds an hour of Unlimited Arcade Play.");
    expect(
      eventDurationExplanation({
        requestedMinutes: 120,
        eventLengthMinutes: 180,
        sequenced: [food, bowling, { name: "Axe Throwing - 1 Hour", durationMinutes: 60 }],
        roomMinutes: 0,
        baselineNames: baseline,
      }),
    ).toBe("This option is 3 hours because it adds an hour of Axe Throwing.");
    expect(
      eventDurationExplanation({
        requestedMinutes: 120,
        eventLengthMinutes: 240,
        sequenced: [food, bowling, { name: "Axe Throwing", durationMinutes: 60 }, { name: "Arcade Play", durationMinutes: 60 }],
        roomMinutes: 0,
        baselineNames: baseline,
      }),
    ).toBe("This option is 4 hours because it adds Axe Throwing and Arcade Play.");
    expect(
      eventDurationExplanation({
        requestedMinutes: 120,
        eventLengthMinutes: 180,
        sequenced: [food, bowling, arcade],
        roomMinutes: 0,
      }),
    ).toBe("This option is 3 hours because it includes additional scheduled activities.");
  });

  it("overlaps a room entitlement and does not schedule a non-timed card", () => {
    expect(resolveSchedulingBehavior({ kind: "ATTRACTION", durationMinutes: null, hasResourceRequirements: false })).toBe(
      "NON_SCHEDULED",
    );
    expect(resolveSchedulingBehavior({ kind: "RENTAL", durationMinutes: 180 })).toBe("SPACE_WINDOW");
    expect(
      resolveSchedulingBehavior({
        kind: "ATTRACTION",
        durationMinutes: null,
        schedulingBehavior: "NON_SCHEDULED",
      }),
    ).toBe("NON_SCHEDULED");

    const composed = composeEventItinerary({
      startTime: "17:00",
      foodFirst: true,
      fallbackMinutes: 180,
      products: [
        { id: "food", name: "Fajita Bar", kind: "FOOD", durationMinutes: 60 },
        { id: "bowl", name: "Bowling - 1 Hour", kind: "ATTRACTION", durationMinutes: 60, hasResourceRequirements: true },
        { id: "arcade", name: "Unlimited Arcade - 1 Hour", kind: "ATTRACTION", durationMinutes: 60, hasResourceRequirements: true },
        { id: "sky", name: "Skybox Private Event Room", kind: "RENTAL", durationMinutes: 180, hasResourceRequirements: true },
        { id: "card", name: "Laser Plex Card", kind: "ATTRACTION", durationMinutes: null, schedulingBehavior: "NON_SCHEDULED" },
      ],
    });
    expect(composed.eventLengthMinutes).toBe(180);
    expect(composed.includedItems.map((row) => row.name)).toEqual(["Laser Plex Card"]);
    const sample = composed.itinerary.filter((row) => row.role !== "SPACE");
    expect(sample.map((row) => `${row.startTime}–${row.endTime}`)).toEqual(["17:00–18:00", "18:00–19:00", "19:00–20:00"]);
    expect(sample.some((row) => row.label === "Laser Plex Card")).toBe(false);
    expect(sample.some((row) => row.durationMinutes === 36)).toBe(false);
    const sky = composed.itinerary.find((row) => row.role === "SPACE");
    expect(sky?.startTime).toBe("17:00");
    expect(sky?.endTime).toBe("20:00");
    expect(itinerarySpanMinutes(sample)).toBe(180);

    const stamped = stampPlanResourceWindows({
      startTime: "17:00",
      itinerary: composed.itinerary,
      resourceRequirements: [
        requirement("Bowling - 1 Hour", "bowl", "bowling-lane"),
        requirement("Unlimited Arcade - 1 Hour", "arcade", "arcade"),
        requirement("Skybox Private Event Room", "sky", "skybox"),
      ],
    });
    expect(stamped.find((row) => row.productId === "bowl")).toMatchObject({
      windowStartTime: "18:00",
      windowEndTime: "19:00",
    });
    expect(stamped.find((row) => row.productId === "sky")).toMatchObject({
      windowStartTime: "17:00",
      windowEndTime: "20:00",
    });
    expect(stamped.some((row) => row.productId === "card")).toBe(false);
  });

  it("formats public clocks once from raw event-local times", () => {
    expect(formatCustomerFacingClocks("starting at 16:00")).toBe("starting at 4:00 PM");
    expect(formatCustomerFacingClocks("starting at 04:00")).toBe("starting at 4:00 AM");
    expect(formatCustomerFacingClocks("starting at 17:00")).toBe("starting at 5:00 PM");
    expect(formatCustomerFacingClocks("We adjusted this option to start at 4:00 PM.")).toBe(
      "We adjusted this option to start at 4:00 PM.",
    );
    expect(formatCustomerFacingClocks("Nearby times currently open: 16:00, 17:00.")).toBe(
      "Nearby times currently open: 4:00 PM, 5:00 PM.",
    );
    expect(formatAdjustedEventWindow("16:00", 120)).toBe("4:00 PM–6:00 PM");
    const note = customerAdjustmentNote({
      conflictLabels: ["Bowling - 1 Hour"],
      requestedStartTime: "17:00",
      viableStartTime: "16:00",
      orderChanged: false,
    });
    expect(note).toBe(
      "Your requested time overlaps existing Bowling reservations, so this option has been adjusted to start at 16:00.",
    );
    const rendered = formatCustomerFacingClocks(note);
    expect(rendered).toBe(
      "Your requested time overlaps existing Bowling reservations, so this option has been adjusted to start at 4:00 PM.",
    );
    expect(rendered).not.toMatch(/AM PM|PM AM|\b16:00\b|\b17:00\b/);
  });
});
