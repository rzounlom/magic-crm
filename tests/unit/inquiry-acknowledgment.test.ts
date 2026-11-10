import { describe, expect, it } from "vitest";

import {
  buildInquiryAcknowledgmentEmail,
  inquiryAcknowledgmentContainsForbiddenContent,
} from "@/lib/event-planner/inquiry-acknowledgment";

describe("inquiry acknowledgment copy", () => {
  it("thanks the customer and names the venue without pricing or booking claims", () => {
    const email = buildInquiryAcknowledgmentEmail({
      organizationName: "Riverbend Events",
      customerFirstName: "Ada",
      customerLastName: "Lovelace",
    });
    expect(email.subject).toBe("We received your event request");
    expect(email.textBody).toContain("Hi Ada,");
    expect(email.textBody).toContain("Riverbend Events");
    expect(email.textBody.toLowerCase()).toContain("received your inquiry");
    expect(email.textBody.toLowerCase()).toContain("follow up");
    expect(email.textBody.toLowerCase()).toContain("does not reserve a date");
    expect(inquiryAcknowledgmentContainsForbiddenContent(email.textBody)).toBe(false);
    expect(inquiryAcknowledgmentContainsForbiddenContent(email.htmlBody)).toBe(false);
    expect(email.htmlBody).toContain("<strong>Riverbend Events</strong>");
  });

  it("falls back to a generic greeting when first name is missing", () => {
    const email = buildInquiryAcknowledgmentEmail({
      organizationName: "Venue Co",
      customerFirstName: null,
    });
    expect(email.textBody.startsWith("Hello,")).toBe(true);
  });
});
