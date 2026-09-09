/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LiveAgentInquiryQueue } from "@/components/layout/live-agent-inquiry-queue";
import { CUSTOMER_SELECTED_PLAN_BANNER } from "@/lib/inquiries/ready-for-human-reason";
import { EVENT_PLAN_KINDS, INQUIRY_STATUSES } from "@/types/inquiry";
import { PLAN_AVAILABILITY_STATUSES } from "@/types/resource-schedule";

describe("live agent inquiry queue", () => {
  it("surfaces customer-selected plans in Ready for Live Agent with booking copy", () => {
    const html = renderToStaticMarkup(
      <LiveAgentInquiryQueue
        timeZone="UTC"
        inquiries={[
          {
            id: "inq_selected",
            status: INQUIRY_STATUSES.READY_FOR_HUMAN,
            selectedEventPlanId: "plan_best",
            humanHandoffReason: "CUSTOMER_SELECTED_PLAN",
            assignedUserProfileId: null,
            customerSelectedAt: new Date("2026-09-09T12:00:00.000Z"),
            createdAt: new Date("2026-09-09T11:00:00.000Z"),
            humanHandoffRequestedAt: new Date("2026-09-09T12:00:00.000Z"),
            workflowStage: "READY_FOR_LIVE_AGENT",
            aiHandlingEnabled: false,
            customerGroupName: "Apex Robotics",
            customerFirstName: "Ada",
            customerLastName: "Lovelace",
            customerEmail: "ada@example.com",
            eventType: "Corporate Event",
            desiredDate: new Date("2026-10-15T00:00:00.000Z"),
            guestCount: 75,
            assignedUser: null,
            eventPlanRecommendations: [
              {
                id: "plan_best",
                kind: EVENT_PLAN_KINDS.RECOMMENDATION,
                title: "Best Fit",
                estimatedTotalCents: 485000,
                currency: "USD",
                availabilityStatus: PLAN_AVAILABILITY_STATUSES.AVAILABLE,
              },
            ],
            resourceReservations: [],
          },
          {
            id: "inq_other",
            status: INQUIRY_STATUSES.READY_FOR_HUMAN,
            selectedEventPlanId: null,
            humanHandoffReason: "MANUAL_ESCALATION",
            assignedUserProfileId: "agent_b",
            customerSelectedAt: null,
            createdAt: new Date("2026-09-08T11:00:00.000Z"),
            humanHandoffRequestedAt: new Date("2026-09-08T11:30:00.000Z"),
            workflowStage: null,
            aiHandlingEnabled: false,
            customerGroupName: null,
            customerFirstName: "Grace",
            customerLastName: "Hopper",
            customerEmail: "grace@example.com",
            eventType: "Birthday Party",
            desiredDate: new Date("2026-10-20T00:00:00.000Z"),
            guestCount: 12,
            assignedUser: {
              firstName: "Jane",
              lastName: "Smith",
              displayName: "Jane Smith",
              email: "jane@example.com",
            },
            eventPlanRecommendations: [],
            resourceReservations: [],
          },
        ]}
      />,
    );

    expect(html).toContain("Ready for Live Agent");
    expect(html).toContain(CUSTOMER_SELECTED_PLAN_BANNER);
    expect(html.indexOf("Apex Robotics")).toBeLessThan(html.indexOf("Grace Hopper"));
    expect(html).toContain("Best Fit");
    expect(html).toContain("75 guests");
    expect(html).toContain("Unassigned");
    expect(html).toContain("Assigned to Jane Smith");
    expect(html).not.toContain("BOOKED");
  });

  it("keeps converted inquiries out of Ready for Live Agent", () => {
    const html = renderToStaticMarkup(
      <LiveAgentInquiryQueue
        timeZone="UTC"
        inquiries={[
          {
            id: "inq_booked",
            status: INQUIRY_STATUSES.BOOKED,
            selectedEventPlanId: "plan_best",
            humanHandoffReason: "CUSTOMER_SELECTED_PLAN",
            assignedUserProfileId: "agent_a",
            customerSelectedAt: new Date("2026-09-09T12:00:00.000Z"),
            createdAt: new Date("2026-09-09T11:00:00.000Z"),
            humanHandoffRequestedAt: new Date("2026-09-09T12:00:00.000Z"),
            workflowStage: null,
            aiHandlingEnabled: false,
            customerGroupName: "Apex Robotics",
            customerFirstName: "Ada",
            customerLastName: "Lovelace",
            customerEmail: "ada@example.com",
            eventType: "Corporate Event",
            desiredDate: new Date("2026-10-15T00:00:00.000Z"),
            guestCount: 75,
            assignedUser: null,
            eventPlanRecommendations: [
              {
                id: "plan_best",
                kind: EVENT_PLAN_KINDS.RECOMMENDATION,
                title: "Best Fit",
                estimatedTotalCents: 485000,
                currency: "USD",
                availabilityStatus: PLAN_AVAILABILITY_STATUSES.AVAILABLE,
              },
            ],
            resourceReservations: [],
            bookings: [{ id: "bk_1", bookingNumber: "FUN-2026-00421", status: "CONFIRMED" }],
          },
        ]}
      />,
    );

    expect(html).not.toContain("Ready for Live Agent");
    expect(html).toContain("Converted to Booking FUN-2026-00421");
    expect(html).toContain("Apex Robotics");
  });
});
