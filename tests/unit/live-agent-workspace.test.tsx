/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AgentWorkingPlanForm } from "@/components/layout/agent-working-plan-form";
import { LiveAgentWorkspace } from "@/components/layout/live-agent-workspace";
import { EVENT_PLAN_TIERS } from "@/types/event-planner";
import { BOOKING_STATUSES } from "@/types/booking";
import { RESOURCE_QUANTITY_RULES, RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
import { SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

vi.mock("@/server/actions/bookings", () => ({
  confirmBookingAction: vi.fn(),
  cancelBookingAction: vi.fn(),
}));

vi.mock("@/server/actions/live-agent", () => ({
  startWorkingInquiryAction: vi.fn(),
  savePendingBookingAction: vi.fn(),
  saveAgentWorkingPlanAction: vi.fn(),
  suggestAlternativesAction: vi.fn(),
  checkInquiryAvailabilityAction: vi.fn(),
  applyWorkingPlanStartTimeAction: vi.fn(),
  markCustomerContactedAction: vi.fn(),
  saveInternalNotesAction: vi.fn(),
}));

vi.mock("@/server/actions/inquiries", () => ({
  sendEmployeeInquiryMessageAction: vi.fn(),
  archiveInquiryAction: vi.fn(),
  unarchiveInquiryAction: vi.fn(),
}));

vi.mock("@/server/actions/resource-schedule", () => ({
  expireInquiryHoldNowAction: vi.fn(),
  extendInquiryHoldAction: vi.fn(),
  releaseInquiryHoldsAction: vi.fn(),
  updateInquiryHoldAction: vi.fn(),
}));

const recommendedPayload = {
  guestCount: 20,
  eventDate: "2026-10-15",
  startTime: "17:30",
  durationMinutes: 240,
  activities: [
    { knowledgeItemId: "axe", name: "Axe Throwing - 60 Minutes", quantity: 1, priceCents: 0 },
    { knowledgeItemId: "bowl", name: "Bowling - 1 Hour", quantity: 4, unitLabel: "lane", priceCents: 0 },
    { knowledgeItemId: "arcade", name: "1 Hour Unlimited Arcade Play", quantity: 20, priceCents: 0 },
  ],
  dining: { label: "Fajita Bar", priceCents: 0 },
  spaces: [],
  schedule: [
    "17:30–18:30 Fajita Bar",
    "18:30–19:30 Axe Throwing - 60 Minutes",
    "19:30–20:30 Bowling - 1 Hour",
    "20:30–21:30 1 Hour Unlimited Arcade Play",
  ],
  itinerary: [
    { startTime: "17:30", endTime: "18:30", label: "Fajita Bar", durationMinutes: 60 },
    { startTime: "18:30", endTime: "19:30", label: "Axe Throwing - 60 Minutes", durationMinutes: 60 },
    { startTime: "19:30", endTime: "20:30", label: "Bowling - 1 Hour", durationMinutes: 60 },
    { startTime: "20:30", endTime: "21:30", label: "1 Hour Unlimited Arcade Play", durationMinutes: 60 },
  ],
  pricingComplete: true,
  resourceRequirements: [
    {
      knowledgeItemId: "axe",
      knowledgeItemName: "Axe Throwing",
      resourceTypeId: "type_axe",
      resourceTypeSlug: "axe-throwing-lane",
      resourceTypeName: "Axe Throwing Lane",
      quantityRule: RESOURCE_QUANTITY_RULES.PER_GUESTS,
      quantity: 3,
      guestsPerUnit: 8,
      durationMinutes: 60,
      inventoryConfigured: true,
      requiresStaffConfiguration: false,
      windowStartTime: "18:30",
      windowEndTime: "19:30",
    },
  ],
};

const selectedPlan = {
  id: "plan_rec",
  tier: EVENT_PLAN_TIERS.BEST_FIT,
  title: "Recommended",
  estimatedTotalCents: 179000,
  currency: "USD",
  durationMinutes: 240,
  customerFacingReason: "Recommended for this group.",
  availabilityValidated: true,
  availabilityNote: null,
  availabilityStatus: "AVAILABLE",
  payload: recommendedPayload,
};

const resourceCheck = {
  requirements: recommendedPayload.resourceRequirements,
  result: {
    validated: true,
    available: true,
    note: "Available",
    types: [
      {
        resourceTypeSlug: "axe-throwing-lane",
        resourceTypeName: "Axe Throwing Lane",
        requestedQuantity: 3,
        availableQuantity: 7,
        inventoryConfigured: true,
        conflict: false,
        requiresStaffConfiguration: false,
      },
    ],
  },
};

const knowledge = [
  { id: "axe", name: "Axe Throwing - 60 Minutes", type: SALES_KNOWLEDGE_TYPES.ATTRACTION, maxGuests: 8, durationMinutes: 60 },
  { id: "bowl", name: "Bowling - 1 Hour", type: SALES_KNOWLEDGE_TYPES.ATTRACTION, maxGuests: 5, durationMinutes: 60 },
  { id: "arcade", name: "1 Hour Unlimited Arcade Play", type: SALES_KNOWLEDGE_TYPES.ATTRACTION, maxGuests: null, durationMinutes: 60 },
  { id: "kart", name: "Go-Karts", type: SALES_KNOWLEDGE_TYPES.ATTRACTION, maxGuests: null, durationMinutes: 30 },
];

function inquiry(overrides: Partial<Parameters<typeof LiveAgentWorkspace>[0]["inquiry"]> = {}) {
  return {
    id: "inq_1",
    updatedAt: new Date("2026-09-22T12:00:00.000Z"),
    status: "READY_FOR_HUMAN",
    workflowStage: "AGENT_WORKING",
    assignedUserProfileId: "user_1",
    assignedAt: new Date("2026-09-22T12:00:00.000Z"),
    customerContactedAt: null,
    readyToFinalizeAt: null,
    employeeInternalNotes: null,
    archivedAt: null,
    customerGroupName: "Acme Manufacturing",
    customerFirstName: "Ada",
    customerLastName: "Lovelace",
    customerEmail: "ada@example.com",
    customerPhone: "5556543333",
    eventType: "Corporate Event",
    desiredDate: new Date("2026-10-15T00:00:00.000Z"),
    desiredStartTime: "17:30",
    guestCount: 20,
    guestMix: "mixed_ages",
    desiredDurationMinutes: 240,
    budgetMin: 150000,
    budgetMax: 300000,
    eventGoal: "Celebration",
    occasion: null,
    diningPreference: "fajita",
    spacePreference: "no_preference",
    customerNotes: null,
    selectedEventPlanId: "plan_rec",
    customerSelectedAt: new Date("2026-09-22T11:00:00.000Z"),
    salesStage: "DEPOSIT_PENDING",
    createdAt: new Date("2026-09-22T10:00:00.000Z"),
    recommendationsGeneratedAt: null,
    recommendationsViewedAt: null,
    humanHandoffRequestedAt: null,
    aiHandlingEnabled: false,
    humanHandoffReason: "CUSTOMER_SELECTED_PLAN",
    attractionInterestNames: [],
    assignedUser: { firstName: "Pat", lastName: "Agent", displayName: "Pat", email: "pat@example.com" },
    conversations: [],
    resourceReservations: [],
    bookings: [
      {
        id: "bk_1",
        bookingNumber: "GEN-2026-00021",
        status: BOOKING_STATUSES.PENDING_PAYMENT,
        confirmedAt: null,
        totalCents: 179000,
      },
    ],
    ...overrides,
  };
}

const shared = {
  selectedPlan,
  workingPlan: { ...selectedPlan, id: "plan_work", title: "Recommended (working)" },
  resourceCheck,
  knowledge,
  activity: [],
  currentUserId: "user_1",
  canManage: true,
  canHold: true,
  canRelease: true,
  canConfirm: true,
  canCancel: true,
  timeZone: "America/Indiana/Indianapolis",
  recommendations: [
    { id: "plan_good", kind: "RECOMMENDATION", title: "Good", tier: EVENT_PLAN_TIERS.BUDGET },
    { id: "plan_rec", kind: "RECOMMENDATION", title: "Recommended", tier: EVENT_PLAN_TIERS.BEST_FIT },
    { id: "plan_prem", kind: "RECOMMENDATION", title: "Premium", tier: EVENT_PLAN_TIERS.PREMIUM },
  ],
};

describe("employee booking workspace", () => {
  it("hides Switch Package and fake activity quantities on a customer-selected pending booking", () => {
    const html = renderToStaticMarkup(
      <LiveAgentWorkspace inquiry={inquiry()} {...shared} />,
    );
    expect(html).toContain("Working booking plan");
    expect(html).toContain("Original customer selection");
    expect(html).toContain("1 hour · 20 guests");
    expect(html).toContain("1 hour · 4 lanes");
    expect(html).toContain("Go-Karts");
    expect(html).not.toContain("Switch package");
    expect(html).not.toContain("Use this package");
    expect(html).not.toContain('name="quantity_kart"');
    expect(html).not.toContain("Plan you");
    expect(html).not.toContain("Legacy hold");
  });

  it("shows allocated resources and hides pending controls after confirmation", () => {
    const html = renderToStaticMarkup(
      <LiveAgentWorkspace
        {...shared}
        inquiry={inquiry({
          salesStage: "BOOKED",
          bookings: [
            {
              id: "bk_1",
              bookingNumber: "GEN-2026-00021",
              status: BOOKING_STATUSES.CONFIRMED,
              confirmedAt: new Date("2026-09-22T13:00:00.000Z"),
              totalCents: 179000,
              payload: recommendedPayload,
            },
          ],
          resourceReservations: [
            {
              id: "r1",
              status: RESOURCE_RESERVATION_STATUSES.BOOKED,
              releasedAt: null,
              startMinute: 18 * 60 + 30,
              endMinute: 19 * 60 + 30,
              expiresAt: null,
              resource: {
                name: "Axe Throwing Lane 1",
                resourceType: { id: "type_axe", name: "Axe Throwing Lane", slug: "axe-throwing-lane" },
              },
            },
            {
              id: "r2",
              status: RESOURCE_RESERVATION_STATUSES.BOOKED,
              releasedAt: null,
              startMinute: 18 * 60 + 30,
              endMinute: 19 * 60 + 30,
              expiresAt: null,
              resource: {
                name: "Axe Throwing Lane 2",
                resourceType: { id: "type_axe", name: "Axe Throwing Lane", slug: "axe-throwing-lane" },
              },
            },
            {
              id: "r3",
              status: RESOURCE_RESERVATION_STATUSES.BOOKED,
              releasedAt: null,
              startMinute: 18 * 60 + 30,
              endMinute: 19 * 60 + 30,
              expiresAt: null,
              resource: {
                name: "Axe Throwing Lane 3",
                resourceType: { id: "type_axe", name: "Axe Throwing Lane", slug: "axe-throwing-lane" },
              },
            },
          ],
        })}
        inventoryCounts={[
          { resourceTypeName: "Axe Throwing Lane", resourceTypeSlug: "axe-throwing-lane", activeQuantity: 7 },
        ]}
      />,
    );
    expect(html).toContain("Booking confirmed");
    expect(html).toContain("Booked plan");
    expect(html).toContain("GEN-2026-00021");
    expect(html).toContain("Axe Throwing Lane 1");
    expect(html).toContain("3 allocated of 7 total");
    expect(html).toContain("Resources booked for this event.");
    expect(html).not.toContain("Save Pending Booking");
    expect(html).not.toContain(">Check Availability<");
    expect(html).not.toContain("Available. All required resources are currently free");
    expect(html).not.toContain("Switch package");
    expect(html).not.toContain("(working)");
    expect(html).not.toContain("view only");
    expect(html).not.toContain("Legacy hold");
    expect(html).not.toContain("Working booking plan");
  });

  it("shows cancelled state without booking workflow controls", () => {
    const html = renderToStaticMarkup(
      <LiveAgentWorkspace
        {...shared}
        inquiry={inquiry({
          bookings: [
            {
              id: "bk_1",
              bookingNumber: "GEN-2026-00021",
              status: BOOKING_STATUSES.CANCELLED,
              confirmedAt: new Date("2026-09-22T13:00:00.000Z"),
              totalCents: 179000,
              payload: recommendedPayload,
            },
          ],
          resourceReservations: [
            {
              id: "r1",
              status: RESOURCE_RESERVATION_STATUSES.BOOKED,
              releasedAt: new Date("2026-09-22T14:00:00.000Z"),
              startMinute: 18 * 60 + 30,
              endMinute: 19 * 60 + 30,
              expiresAt: null,
              resource: {
                name: "Axe Throwing Lane 1",
                resourceType: { id: "type_axe", name: "Axe Throwing Lane" },
              },
            },
          ],
        })}
      />,
    );
    expect(html).toContain("Booking cancelled");
    expect(html).toContain("Resources released");
    expect(html).not.toContain("Save Pending Booking");
    expect(html).not.toContain("Confirm Payment &amp; Book");
    expect(html).not.toContain("Switch package");
    expect(html).not.toContain("Working booking plan");
  });
});

describe("working booking plan activities", () => {
  it("shows selected activity details and no unexplained quantity 1 on unselected items", () => {
    const html = renderToStaticMarkup(
      <AgentWorkingPlanForm
        inquiryId="inq_1"
        expectedUpdatedAt="2026-09-22T12:00:00.000Z"
        selectedPayload={recommendedPayload}
        working={{
          estimatedTotalCents: 179000,
          currency: "USD",
          durationMinutes: 240,
          payload: recommendedPayload,
        }}
        knowledge={knowledge}
        currency="USD"
        guestMix="mixed_ages"
      />,
    );
    expect(html).toContain("Working booking plan");
    expect(html).toContain("Matches the customer");
    expect(html).toContain("1 hour · 20 guests");
    expect(html).toContain("1 hour · 4 lanes");
    expect(html).toContain("Go-Karts");
    expect(html).not.toContain('name="quantity_kart"');
    expect(html).not.toContain('name="quantity_axe"');
    expect(html).not.toContain("Switch package");
  });
});
