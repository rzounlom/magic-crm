import { describe, expect, it } from "vitest";

import { emptyPlannerAnswers } from "@/lib/event-planner/intake-contract";
import {
  JOURNEY_STEPS,
  answersFromStartTime24,
  journeyStepError,
  publicStartTimeOptions,
  startTimeFromAnswers,
} from "@/lib/event-planner/intake-journey";

describe("intake journey helpers", () => {
  it("exposes four customer journey steps", () => {
    expect(JOURNEY_STEPS.map((step) => step.id)).toEqual(["event", "fun", "when", "details"]);
  });

  it("round-trips venue-local start times through planner answers", () => {
    const options = publicStartTimeOptions();
    expect(options[0]).toEqual({ value: "09:00", label: "9:00 AM" });
    expect(options.some((row) => row.value === "18:00" && row.label === "6:00 PM")).toBe(true);

    const patch = answersFromStartTime24("18:00");
    expect(patch).toEqual({ startHour: "6", startMinute: "00", startPeriod: "PM" });
    expect(startTimeFromAnswers({ startHour: "6", startMinute: "00", startPeriod: "PM" })).toBe("18:00");
    expect(answersFromStartTime24("25:00")).toEqual({ startHour: "", startMinute: "", startPeriod: "" });
  });

  it("validates journey steps without weakening required fields", () => {
    const empty = emptyPlannerAnswers();
    expect(journeyStepError("event", empty)).toMatch(/event type|guests|who's coming/i);

    const eventReady = {
      ...empty,
      eventType: "Birthday Party",
      guestCount: "10",
      guestMix: "mixed_ages" as const,
    };
    expect(journeyStepError("event", eventReady)).toBeNull();
    expect(journeyStepError("fun", eventReady, { attractionRequired: true })).toMatch(/activity/i);
    expect(journeyStepError("fun", eventReady, { attractionRequired: false })).toMatch(/food|space|budget|length/i);

    const funReady = {
      ...eventReady,
      attractionInterestIds: ["bowl"],
      foodPreference: "NO_FOOD" as const,
      privateSpacePreference: "NO_PREFERENCE" as const,
      budgetPreference: "FLEXIBLE" as const,
      desiredDurationMinutes: "120" as const,
    };
    expect(journeyStepError("fun", funReady, { attractionRequired: true })).toBeNull();
    expect(journeyStepError("when", funReady)).toMatch(/date|time/i);

    const whenReady = {
      ...funReady,
      eventDate: "2026-10-15",
      startHour: "6",
      startMinute: "00",
      startPeriod: "PM" as const,
    };
    expect(journeyStepError("when", whenReady)).toBeNull();
    expect(journeyStepError("details", whenReady)).toMatch(/first name|email/i);
  });
});
