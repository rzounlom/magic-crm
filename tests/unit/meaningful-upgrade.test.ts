import { describe, expect, it } from "vitest";

import {
  autoAddAudienceAllowed,
  evaluateMeaningfulUpgrades,
  experienceIdentity,
  fitsRemainingMinutes,
  hasOverlappingExperience,
  remainingScheduledMinutes,
  scheduledDurationMinutes,
} from "@/server/catalog/meaningful-upgrade";
import { INQUIRY_AUDIENCES, PRODUCT_KINDS } from "@/types/catalog";

const bowlingHour = {
  id: "bowl-1",
  slug: "bowling-1h",
  name: "Bowling - 1 Hour",
  kind: PRODUCT_KINDS.ATTRACTION,
  durationMinutes: 60,
};
const bowlingR5 = {
  id: "bowl-r5",
  slug: "r5-bowling",
  name: "R5 Bowling",
  kind: PRODUCT_KINDS.ATTRACTION,
  durationMinutes: 60,
};
const axe30 = {
  id: "axe-30",
  slug: "axe-throwing-30",
  name: "Axe Throwing - 30 Minutes",
  kind: PRODUCT_KINDS.ATTRACTION,
  fulfillmentGroup: "axe-throwing",
  audience: INQUIRY_AUDIENCES.ADULTS,
  durationMinutes: 30,
};
const axe60 = {
  id: "axe-60",
  slug: "axe-throwing-60",
  name: "Axe Throwing - 60 Minutes",
  kind: PRODUCT_KINDS.ATTRACTION,
  fulfillmentGroup: "axe-throwing",
  audience: INQUIRY_AUDIENCES.ADULTS,
  durationMinutes: 60,
};
const pizza = {
  id: "pizza",
  slug: "pizza-pitcher-combo",
  name: "Pizza & Pitcher Combination",
  kind: PRODUCT_KINDS.FOOD,
  durationMinutes: 60,
};
const slider = {
  id: "slider",
  slug: "slider-bar",
  name: "Slider Bar",
  kind: PRODUCT_KINDS.FOOD,
  durationMinutes: 60,
};
const arcade = {
  id: "arcade",
  slug: "unlimited-arcade-1h",
  name: "1 Hour Unlimited Arcade Play",
  kind: PRODUCT_KINDS.ATTRACTION,
  audience: INQUIRY_AUDIENCES.KIDS_YOUTH,
  durationMinutes: 60,
};
const skybox = {
  id: "skybox",
  slug: "skybox",
  name: "Skybox",
  kind: PRODUCT_KINDS.RENTAL,
  durationMinutes: 180,
};

describe("meaningful upgrade evaluator", () => {
  it("treats R1 and R5 bowling labels as the same experience", () => {
    expect(experienceIdentity({ name: "R1 Bowling", slug: "r1-bowling" })).toBe(
      experienceIdentity({ name: "R5 Bowling", slug: "r5-bowling" }),
    );
    expect(hasOverlappingExperience([bowlingHour], bowlingR5)).toBe(true);
  });

  it("does not count a higher price alone as an upgrade", () => {
    expect(evaluateMeaningfulUpgrades([bowlingHour, pizza], [bowlingHour, pizza])).toEqual([]);
  });

  it("records dining, extra activity time, a new activity, and a room when those actually change", () => {
    expect(evaluateMeaningfulUpgrades([bowlingHour, pizza], [bowlingHour, slider])).toEqual([
      { kind: "dining", summary: "Upgraded from Pizza & Pitcher Combination to Slider Bar" },
    ]);
    expect(evaluateMeaningfulUpgrades([axe30, bowlingHour], [axe60, bowlingHour])).toEqual([
      { kind: "activity_time", summary: "More time in Axe Throwing - 60 Minutes" },
    ]);
    expect(evaluateMeaningfulUpgrades([bowlingHour], [bowlingHour, arcade])).toEqual([
      { kind: "added_activity", summary: "Adds 1 Hour Unlimited Arcade Play" },
    ]);
    expect(evaluateMeaningfulUpgrades([bowlingHour], [bowlingHour, skybox])).toEqual([
      { kind: "space", summary: "Includes private event space (Skybox)" },
    ]);
  });

  it("does not treat an overlapping bowling product as a meaningful add", () => {
    expect(evaluateMeaningfulUpgrades([bowlingHour], [bowlingHour, bowlingR5])).toEqual([]);
  });

  it("blocks adult-only auto-adds for youth and mixed audiences", () => {
    expect(autoAddAudienceAllowed(INQUIRY_AUDIENCES.ADULTS, INQUIRY_AUDIENCES.MIXED, false)).toBe(false);
    expect(autoAddAudienceAllowed(INQUIRY_AUDIENCES.ADULTS, INQUIRY_AUDIENCES.KIDS_YOUTH, false)).toBe(false);
    expect(autoAddAudienceAllowed(INQUIRY_AUDIENCES.ADULTS, INQUIRY_AUDIENCES.ADULTS, false)).toBe(true);
    expect(autoAddAudienceAllowed(INQUIRY_AUDIENCES.ADULTS, INQUIRY_AUDIENCES.MIXED, true)).toBe(true);
  });

  it("keeps activity time inside the requested window", () => {
    expect(scheduledDurationMinutes(skybox)).toBe(0);
    expect(scheduledDurationMinutes(pizza)).toBe(60);
    const remaining = remainingScheduledMinutes({
      requestedMinutes: 120,
      reservedMinutes: 0,
      chosen: [bowlingHour],
    });
    expect(remaining).toBe(60);
    expect(fitsRemainingMinutes(arcade, remaining)).toBe(true);
    expect(fitsRemainingMinutes(axe60, remainingScheduledMinutes({
      requestedMinutes: 120,
      reservedMinutes: 0,
      chosen: [bowlingHour, arcade],
    }))).toBe(false);
  });
});
