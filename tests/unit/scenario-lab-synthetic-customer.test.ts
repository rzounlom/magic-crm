import { describe, expect, it } from "vitest";

import { generateScenarioLabInquiryFixture } from "@/server/scenario-lab/synthetic-customer";

describe("generateScenarioLabInquiryFixture", () => {
  it("uses reserved example.com emails and non-routable 555 phone numbers", () => {
    const fixture = generateScenarioLabInquiryFixture({
      locationId: "loc_1",
      locationName: "Main",
      attractionInterestIds: ["attr_1"],
      eventDate: "2026-12-01",
    });

    expect(fixture.email).toMatch(/@example\.com$/);
    expect(fixture.phone).toMatch(/^555/);
    expect(fixture.notes.toLowerCase()).toContain("scenario lab");
    expect(fixture.eventDate).toBe("2026-12-01");
    expect(fixture.attractionInterestIds).toEqual(["attr_1"]);
  });
});
