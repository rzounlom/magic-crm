import { describe, expect, it } from "vitest";

import {
  alcoholProductEligible,
  containsAlcoholFromDeclarations,
  productContainsAlcohol,
  productEligibleForInquiry,
} from "@/server/catalog/alcohol-eligibility";
import { INQUIRY_AUDIENCES } from "@/types/catalog";

describe("alcohol eligibility", () => {
  it("treats only an explicit tenant declaration as alcohol", () => {
    expect(containsAlcoholFromDeclarations(null)).toBe(false);
    expect(containsAlcoholFromDeclarations({})).toBe(false);
    expect(containsAlcoholFromDeclarations({ containsAlcohol: false })).toBe(false);
    expect(containsAlcoholFromDeclarations({ containsAlcohol: true })).toBe(true);
    expect(productContainsAlcohol({})).toBe(false);
    expect(productContainsAlcohol({ containsAlcohol: true })).toBe(true);
  });

  it("never allows alcohol for youth or mixed audiences", () => {
    expect(
      alcoholProductEligible({
        audience: INQUIRY_AUDIENCES.KIDS_YOUTH,
        diningPreference: "tenant-ale",
        productSlug: "tenant-ale",
      }),
    ).toBe(false);
    expect(
      alcoholProductEligible({
        audience: INQUIRY_AUDIENCES.MIXED,
        diningPreference: "tenant-ale",
        productSlug: "tenant-ale",
      }),
    ).toBe(false);
  });

  it("allows alcohol for adults only when intake names that product slug", () => {
    expect(
      alcoholProductEligible({
        audience: INQUIRY_AUDIENCES.ADULTS,
        diningPreference: "WANTS_FOOD",
        productSlug: "tenant-ale",
      }),
    ).toBe(false);
    expect(
      alcoholProductEligible({
        audience: INQUIRY_AUDIENCES.ADULTS,
        diningPreference: "not_sure",
        productSlug: "tenant-ale",
      }),
    ).toBe(false);
    expect(
      alcoholProductEligible({
        audience: INQUIRY_AUDIENCES.ADULTS,
        diningPreference: "pizza_light",
        productSlug: "tenant-ale",
      }),
    ).toBe(false);
    expect(
      alcoholProductEligible({
        audience: INQUIRY_AUDIENCES.ADULTS,
        diningPreference: "tenant-ale",
        productSlug: "tenant-ale",
      }),
    ).toBe(true);
  });

  it("leaves unmarked products eligible for every audience", () => {
    const food = { slug: "pizza-pitcher-combo" };
    expect(
      productEligibleForInquiry(food, {
        audience: INQUIRY_AUDIENCES.KIDS_YOUTH,
        diningPreference: "WANTS_FOOD",
      }),
    ).toBe(true);
    expect(
      productEligibleForInquiry(food, {
        audience: INQUIRY_AUDIENCES.MIXED,
        diningPreference: "WANTS_FOOD",
      }),
    ).toBe(true);
    expect(
      productEligibleForInquiry({ slug: "other-tenant-ale", containsAlcohol: true }, {
        audience: INQUIRY_AUDIENCES.KIDS_YOUTH,
        diningPreference: "other-tenant-ale",
      }),
    ).toBe(false);
  });
});
