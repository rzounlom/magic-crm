export const DOMAIN_EVENT_TYPES = {
  EVENT_PLAN_SELECTED: "event_plan.selected",
  BOOKING_CONFIRMED: "booking.confirmed",
} as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[keyof typeof DOMAIN_EVENT_TYPES];

export type EventPlanSelectedPayload = {
  organizationId: string;
  inquiryId: string;
  selectedPlanId: string;
  organizationName: string;
  customerEmail: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerGroupName: string | null;
  eventDate: string | null;
  guestCount: number | null;
  planTitle: string;
  activities: string[];
  dining: string;
  spaces: string[];
  estimatedTotalCents: number | null;
  currency: string;
};

export type BookingConfirmedPayload = {
  organizationId: string;
  bookingId: string;
  inquiryId?: string | null;
};

export type DomainEvent =
  | { type: typeof DOMAIN_EVENT_TYPES.EVENT_PLAN_SELECTED; payload: EventPlanSelectedPayload }
  | { type: typeof DOMAIN_EVENT_TYPES.BOOKING_CONFIRMED; payload: BookingConfirmedPayload };
