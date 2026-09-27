import { describe, expect, it } from "vitest";

import { attractionModeFromIntake } from "@/server/catalog/audience";
import {
  attractionSelectionLabels,
  customerAttractionChoices,
  expandAttractionSelections,
} from "@/server/catalog/attraction-interests";
import { ATTRACTION_MODES } from "@/types/catalog";

const ORG_A = "org-a";
const ORG_B = "org-b";

describe("customer attraction interests", () => {
  const interests = [
    {
      id: "axe",
      organizationId: ORG_A,
      label: "Axe Throwing",
      description: "Lanes",
      active: true,
      displayOrder: 0,
    },
    {
      id: "bowl",
      organizationId: ORG_A,
      label: "Bowling",
      description: null,
      active: true,
      displayOrder: 1,
    },
    {
      id: "laser",
      organizationId: ORG_A,
      label: "Laser Tag",
      description: null,
      active: true,
      displayOrder: 2,
    },
    {
      id: "arcade",
      organizationId: ORG_A,
      label: "Arcade",
      description: null,
      active: true,
      displayOrder: 3,
    },
    {
      id: "golf",
      organizationId: ORG_A,
      label: "Mini Golf",
      description: null,
      active: true,
      displayOrder: 4,
    },
    {
      id: "closed",
      organizationId: ORG_A,
      label: "Closed activity",
      description: null,
      active: false,
      displayOrder: 5,
    },
    {
      id: "tramp",
      organizationId: ORG_B,
      label: "Trampoline",
      description: null,
      active: true,
      displayOrder: 0,
    },
  ];
  const skuFallback = [
    { id: "axe-30", name: "Axe Throwing - 30 Minutes", description: null },
    { id: "axe-60", name: "Axe Throwing - 60 Minutes", description: null },
    { id: "bowl-sku", name: "Bowling - 1 Hour", description: null },
    { id: "card", name: "Laser Plex Card", description: null },
  ];

  it("collapses duration SKUs into one conceptual card and hides inactive or foreign interests", () => {
    const choices = customerAttractionChoices({
      interests,
      organizationId: ORG_A,
      fallback: skuFallback,
    });
    expect(choices.map((choice) => choice.name)).toEqual([
      "Axe Throwing",
      "Bowling",
      "Laser Tag",
      "Arcade",
      "Mini Golf",
    ]);
    expect(choices.map((choice) => choice.name).join(" ")).not.toMatch(/30 Minutes|1 Hour|Laser Plex Card/);
    expect(choices.find((choice) => choice.name === "Axe Throwing")?.description).toBe("Lanes");
  });

  it("shows another tenant only its own interests", () => {
    expect(
      customerAttractionChoices({
        interests,
        organizationId: ORG_B,
        fallback: skuFallback,
      }).map((choice) => choice.name),
    ).toEqual(["Trampoline"]);
  });

  it("falls back to sellable rows only when the tenant has no active interests", () => {
    expect(
      customerAttractionChoices({
        interests: interests.filter((row) => row.organizationId === ORG_B),
        organizationId: ORG_A,
        fallback: skuFallback,
      }).map((choice) => choice.id),
    ).toEqual(["axe-30", "axe-60", "bowl-sku", "card"]);
  });

  it("expands a selected interest to ordered product candidates and leaves legacy ids alone", () => {
    expect(
      expandAttractionSelections({
        storedIds: ["axe"],
        interests: [{ id: "axe", productIds: ["axe-60", "axe-30"] }],
      }),
    ).toEqual(["axe-60", "axe-30"]);
    expect(
      expandAttractionSelections({
        storedIds: ["legacy-product"],
        interests: [{ id: "axe", productIds: ["axe-60", "axe-30"] }],
      }),
    ).toEqual(["legacy-product"]);
    expect(expandAttractionSelections({ storedIds: [], interests: [] })).toEqual([]);
  });

  it("keeps an empty selection in recommendation mode", () => {
    expect(attractionModeFromIntake({ attractionInterestIds: [] })).toBe(ATTRACTION_MODES.RECOMMEND);
    expect(attractionModeFromIntake({ attractionInterestIds: ["axe"] })).toBe(ATTRACTION_MODES.KNOWN);
  });

  it("still labels older product ids and new interest ids", () => {
    expect(
      attractionSelectionLabels({
        storedIds: ["axe-30", "axe"],
        interests: [{ id: "axe", label: "Axe Throwing" }],
        products: [{ id: "axe-30", name: "Axe Throwing - 30 Minutes" }],
        knowledge: [],
      }),
    ).toEqual(["Axe Throwing - 30 Minutes", "Axe Throwing"]);
  });
});
