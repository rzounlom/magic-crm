import { describe, expect, it } from "vitest";

import {
  customerFacingOrganizationName,
  publicInquiryFormPath,
  publicInquiryPathForActiveOrganization,
} from "@/lib/inquiries/organization-display-name";

describe("customer-facing organization name", () => {
  it("humanizes generated slugs and keeps real names", () => {
    expect(customerFacingOrganizationName("generations-crm-test-1788129640704833684")).toBe(
      "Generations CRM Test",
    );
    expect(customerFacingOrganizationName("Riverside Fun Center")).toBe("Riverside Fun Center");
  });

  it("builds a relative public inquiry path from the trusted slug", () => {
    expect(publicInquiryFormPath("generations-crm-test-1788129640704833684")).toBe(
      "/inquire/generations-crm-test-1788129640704833684",
    );
    expect(publicInquiryFormPath("fun-center-b")).toBe("/inquire/fun-center-b");
    expect(publicInquiryFormPath("fun-center-b")).not.toContain("generations");
  });

  it("only builds a public inquiry path for an active organization", () => {
    expect(
      publicInquiryPathForActiveOrganization({
        slug: "fun-center-a",
        onboardingStatus: "ACTIVE",
      }),
    ).toBe("/inquire/fun-center-a");
    expect(
      publicInquiryPathForActiveOrganization({
        slug: "fun-center-b",
        onboardingStatus: "ACTIVE",
      }),
    ).toBe("/inquire/fun-center-b");
    expect(
      publicInquiryPathForActiveOrganization({
        slug: "fun-center-a",
        onboardingStatus: "PROVISIONING",
      }),
    ).toBeNull();
    expect(publicInquiryPathForActiveOrganization(null)).toBeNull();
    expect(
      publicInquiryPathForActiveOrganization({
        slug: "fun-center-a",
        onboardingStatus: "ACTIVE",
      }),
    ).not.toContain("generations");
  });
});
