/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";

import {
  INTAKE_DRAFT_VERSION,
  clearIntakeDraft,
  intakeDraftStorageKey,
  mergeDraftAnswers,
  readIntakeDraft,
  toNonSensitiveAnswers,
  writeIntakeDraft,
} from "@/lib/event-planner/intake-draft";
import { emptyPlannerAnswers } from "@/lib/event-planner/intake-contract";

afterEach(() => {
  window.localStorage.clear();
});

describe("intake draft persistence", () => {
  it("excludes contact PII from stored drafts", () => {
    const answers = {
      ...emptyPlannerAnswers(),
      eventType: "Birthday Party",
      guestCount: "12",
      guestMix: "mixed_ages" as const,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "(555) 010-1234",
      notes: "private note",
      customerGroupName: "Secret Club",
    };
    const stored = toNonSensitiveAnswers(answers);
    expect(stored).not.toHaveProperty("firstName");
    expect(stored).not.toHaveProperty("lastName");
    expect(stored).not.toHaveProperty("email");
    expect(stored).not.toHaveProperty("phone");
    expect(stored).not.toHaveProperty("notes");
    expect(stored).not.toHaveProperty("customerGroupName");
    expect(stored.eventType).toBe("Birthday Party");
  });

  it("scopes keys by tenant and drops foreign or version-mismatched drafts", () => {
    const answers = {
      ...emptyPlannerAnswers(),
      eventType: "Private Group",
      guestCount: "10",
      guestMix: "mostly_adults" as const,
    };
    writeIntakeDraft("alpha", answers);
    expect(readIntakeDraft("beta", new Set()) ).toBeNull();

    window.localStorage.setItem(
      intakeDraftStorageKey("alpha"),
      JSON.stringify({
        v: INTAKE_DRAFT_VERSION + 1,
        organizationSlug: "alpha",
        savedAt: Date.now(),
        answers: toNonSensitiveAnswers(answers),
      }),
    );
    expect(readIntakeDraft("alpha", new Set())).toBeNull();
  });

  it("expires old drafts and filters stale attraction ids", () => {
    const answers = {
      ...emptyPlannerAnswers(),
      eventType: "Sports Team",
      guestCount: "16",
      guestMix: "mixed_ages" as const,
      attractionInterestIds: ["bowl", "gone"],
      foodPreference: "WANTS_FOOD" as const,
      privateSpacePreference: "NO_PREFERENCE" as const,
      budgetPreference: "FLEXIBLE" as const,
      desiredDurationMinutes: "120" as const,
      eventDate: "2026-12-01",
      startHour: "6",
      startMinute: "00",
      startPeriod: "PM" as const,
    };
    writeIntakeDraft("alpha", answers);
    const raw = JSON.parse(window.localStorage.getItem(intakeDraftStorageKey("alpha"))!);
    raw.savedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(intakeDraftStorageKey("alpha"), JSON.stringify(raw));
    expect(readIntakeDraft("alpha", new Set(["bowl"]))).toBeNull();

    writeIntakeDraft("alpha", answers);
    const restored = readIntakeDraft("alpha", new Set(["bowl"]));
    expect(restored?.answers.attractionInterestIds).toEqual(["bowl"]);
    expect(restored?.answers.firstName).toBe("");
  });

  it("clears drafts and merges only valid enum values", () => {
    writeIntakeDraft("alpha", {
      ...emptyPlannerAnswers(),
      eventType: "Other",
      guestCount: "4",
    });
    clearIntakeDraft("alpha");
    expect(window.localStorage.getItem(intakeDraftStorageKey("alpha"))).toBeNull();

    const merged = mergeDraftAnswers(
      {
        eventType: "Birthday Party",
        guestCount: "abc",
        guestMix: "not-a-mix" as never,
        attractionInterestIds: ["x"],
        foodPreference: "MAYBE" as never,
        beveragePreference: "",
        privateSpacePreference: "YES",
        budgetBand: "1500_3000",
        budgetPreference: "",
        desiredDurationMinutes: "999" as never,
        eventDate: "bad",
        startHour: "3",
        startMinute: "30",
        startPeriod: "PM",
      },
      new Set(["x"]),
    );
    expect(merged.guestCount).toBe("");
    expect(merged.guestMix).toBe("");
    expect(merged.foodPreference).toBe("");
    expect(merged.desiredDurationMinutes).toBe("");
    expect(merged.eventDate).toBe("");
    expect(merged.privateSpacePreference).toBe("YES");
  });
});
