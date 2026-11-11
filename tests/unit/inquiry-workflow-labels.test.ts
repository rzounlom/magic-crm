import { describe, expect, it } from "vitest";

import {
  formatEmployeeInquiryQueueLabel,
  employeeInquiryStatusBanner,
} from "@/lib/inquiries/inquiry-workflow-labels";

describe("formatEmployeeInquiryQueueLabel", () => {
  it("does not show READY TO BOOK for WP intake even when selectedEventPlanId is set", () => {
    const label = formatEmployeeInquiryQueueLabel({
      isWpIntake: true,
      status: "READY_FOR_HUMAN",
      aiHandlingEnabled: true,
      selectedEventPlanId: "plan_working_draft",
      humanHandoffReason: "PUBLIC_EVENT_REQUEST",
    });
    expect(label).toBe("Event inquiry — staff review required");
    expect(label).not.toMatch(/READY TO BOOK/i);
  });

  it("keeps legacy READY TO BOOK for non-WP selected plans", () => {
    const label = formatEmployeeInquiryQueueLabel({
      isWpIntake: false,
      status: "READY_FOR_HUMAN",
      aiHandlingEnabled: true,
      selectedEventPlanId: "plan_customer_selected",
      humanHandoffReason: "CUSTOMER_SELECTED_PLAN",
    });
    expect(label).toMatch(/READY TO BOOK/i);
  });
});

describe("employeeInquiryStatusBanner", () => {
  it("uses staff-review banner for WP intake", () => {
    const banner = employeeInquiryStatusBanner({
      isWpIntake: true,
      selectedEventPlanId: "plan_working_draft",
    });
    expect(banner?.title).toBe("Event inquiry — staff review required");
  });
});
