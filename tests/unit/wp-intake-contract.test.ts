import { describe, expect, it } from "vitest";

import {
  attractionModeFromWpAnswers,
  beveragePreferenceFromWp,
  buildWpIntakeMessageMetadata,
  diningPreferenceFromWp,
  durationMinutesFromWp,
  guestMixFromAdultsChildren,
  parseWpIntakeMessageMetadata,
  spacePreferenceFromWp,
  yesAttractionKeys,
} from "@/lib/event-planner/wp-intake-contract";
import { formatReadyForHumanReason, READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";

describe("wp intake contract mapping", () => {
  it("maps guests, duration, prefs, and attraction mode", () => {
    expect(guestMixFromAdultsChildren(10, 0)).toBe("mostly_adults");
    expect(guestMixFromAdultsChildren(0, 8)).toBe("mostly_children");
    expect(guestMixFromAdultsChildren(5, 5)).toBe("mixed_ages");
    expect(durationMinutesFromWp("2 hours", null)).toBe(120);
    expect(durationMinutesFromWp("Other", 2.5)).toBe(150);
    expect(diningPreferenceFromWp("yes")).toBe("WANTS_FOOD");
    expect(spacePreferenceFromWp("no")).toBe("no_preference");
    expect(beveragePreferenceFromWp("yes")).toBe("YES");
    expect(
      attractionModeFromWpAnswers({
        bowling: "open",
        axe: "no",
        laser: "open",
        golf: "no",
        climbing: "no",
        arcade: "no",
      }),
    ).toBe("RECOMMEND");
    expect(
      yesAttractionKeys({
        bowling: "yes",
        axe: "no",
        laser: "open",
        golf: "no",
        climbing: "no",
        arcade: "yes",
      }),
    ).toEqual(["bowling", "arcade"]);
  });

  it("round-trips intake message metadata", () => {
    const metadata = buildWpIntakeMessageMetadata(
      {
        firstName: "Ada",
        lastName: "Lovelace",
        company: "Analytical Engines",
        phone: "5745550100",
        email: "ada@example.com",
        eventType: "Birthday",
        dates: ["2026-12-15"],
        time: "17:00",
        adults: 10,
        children: 2,
        duration: "3 hours",
        otherHours: null,
        minutes: 180,
        attractions: {
          bowling: "yes",
          axe: "no",
          laser: "open",
          golf: "no",
          climbing: "no",
          arcade: "open",
        },
        food: "yes",
        privateRoom: "no",
        craft: "no",
        hasBudget: "no",
        budgetCents: null,
        description: "Birthday",
        comments: null,
        referral: "Friend",
      },
      {
        status: "ready",
        rulesVersion: "2026-11-02",
        pricingRevision: "abc123",
        pricingSource: "plugin_defaults",
        summary: "ok",
        snapshot: { valid: true },
        errorMessage: null,
      },
    );
    expect(parseWpIntakeMessageMetadata(metadata)?.answers.referral).toBe("Friend");
    expect(parseWpIntakeMessageMetadata(metadata)?.privateCalculation.status).toBe("ready");
    expect(parseWpIntakeMessageMetadata({ intakeKind: "other" })).toBeNull();
  });

  it("labels the public event request handoff reason", () => {
    expect(formatReadyForHumanReason(READY_FOR_HUMAN_REASONS.PUBLIC_EVENT_REQUEST)).toContain(
      "staff review",
    );
  });
});
