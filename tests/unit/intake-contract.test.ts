import { describe, expect, it } from "vitest";

import { audienceFromGuestMix } from "@/server/catalog/audience";
import {
  PLANNER_STEPS,
  budgetCentsForPreference,
  emptyPlannerAnswers,
  engineDiningPreference,
  format12HourClock,
  formatPreferredDateTime,
  initialPlannerState,
  plannerStepError,
  reducePlanner,
  to24HourTime,
} from "@/lib/event-planner/intake-contract";

describe("public intake planner contract", () => {
  it("walks the guided steps and keeps answers when moving back", () => {
    expect(PLANNER_STEPS).toEqual([
      "event",
      "guests",
      "mix",
      "attractions",
      "food",
      "space",
      "budget",
      "when",
      "review",
    ]);

    let state = reducePlanner(initialPlannerState(), { type: "edit", patch: { eventType: "Birthday Party" } });
    state = reducePlanner(state, { type: "next" });
    state = reducePlanner(state, { type: "edit", patch: { guestCount: "20" } });
    state = reducePlanner(state, { type: "next" });
    state = reducePlanner(state, { type: "edit", patch: { guestMix: "mostly_adults" } });
    state = reducePlanner(state, { type: "back" });

    expect(state.step).toBe("guests");
    expect(state.answers.guestCount).toBe("20");
    expect(state.answers.eventType).toBe("Birthday Party");
    expect(state.answers.guestMix).toBe("mostly_adults");
  });

  it("does not advance an invalid step and allows zero attractions", () => {
    const blocked = reducePlanner(initialPlannerState(), { type: "next" });
    expect(blocked.step).toBe("event");
    expect(plannerStepError("guests", emptyPlannerAnswers())).toMatch(/whole number/i);
    expect(plannerStepError("guests", { ...emptyPlannerAnswers(), guestCount: "0" })).toMatch(/greater than 0/i);
    expect(plannerStepError("guests", { ...emptyPlannerAnswers(), guestCount: "12.5" })).toMatch(/whole number/i);
    expect(plannerStepError("guests", { ...emptyPlannerAnswers(), guestCount: "1e2" })).toMatch(/whole number/i);
    expect(plannerStepError("guests", { ...emptyPlannerAnswers(), guestCount: "20" })).toBeNull();
    expect(plannerStepError("attractions", emptyPlannerAnswers())).toBeNull();
  });

  it("maps the three customer group choices onto the existing audience values", () => {
    expect(audienceFromGuestMix("mostly_children")).toBe("KIDS_YOUTH");
    expect(audienceFromGuestMix("mostly_adults")).toBe("ADULTS");
    expect(audienceFromGuestMix("mixed_ages")).toBe("MIXED");
  });

  it("normalizes budget, food, and 12-hour times without exposing a 24-hour clock", () => {
    expect(budgetCentsForPreference("PER_GUEST_45_55", 20)).toEqual({ min: 90_000, max: 110_000 });
    expect(budgetCentsForPreference("PER_GUEST_55_PLUS", 10)).toEqual({ min: 55_000, max: null });
    expect(budgetCentsForPreference("FLEXIBLE", 10)).toEqual({ min: null, max: null });
    expect(engineDiningPreference("WANTS_FOOD")).toBe("not_sure");
    expect(engineDiningPreference("NO_FOOD")).toBe("none");
    expect(engineDiningPreference("catered_fajita")).toBe("catered_fajita");
    expect(to24HourTime("5", "00", "PM")).toBe("17:00");
    expect(to24HourTime("12", "00", "AM")).toBe("00:00");
    expect(format12HourClock("17:00")).toBe("5:00 PM");
    expect(format12HourClock("16:00")).not.toContain("16:00");
    expect(
      formatPreferredDateTime({
        eventDate: "2026-09-26",
        startHour: "5",
        startMinute: "00",
        startPeriod: "PM",
      }),
    ).toBe("September 26, 2026 at 5:00 PM");
  });

  it("returns to a chosen step and clears every answer on start over", () => {
    let state = reducePlanner(initialPlannerState(), {
      type: "edit",
      patch: { eventType: "Birthday Party", guestCount: "20", foodPreference: "WANTS_FOOD" },
    });
    state = reducePlanner(state, { type: "go", step: "review" });
    expect(state.step).toBe("review");
    expect(state.answers.foodPreference).toBe("WANTS_FOOD");
    state = reducePlanner(state, { type: "startOver" });
    expect(state).toEqual(initialPlannerState());
  });
});
