import { describe, expect, it } from "vitest";

import { readEventPlanPayload } from "@/lib/event-planner/payload";
import { lineItemsFromPayload } from "@/server/services/pending-booking-service";
import { BOOKING_LINE_ITEM_KINDS } from "@/types/booking";

describe("lineItemsFromPayload", () => {
  it("prefers snapshotted payload.lineItems over activity/dining/space aggregates", () => {
    const payload = readEventPlanPayload({
      guestCount: 12,
      eventDate: "2026-10-16",
      startTime: "18:00",
      durationMinutes: 60,
      activities: [{ knowledgeItemId: "bowl", name: "Bowling", quantity: 1, priceCents: 9999 }],
      dining: { label: "Pizza", priceCents: 6000 },
      spaces: [],
      schedule: [],
      pricingComplete: true,
      lineItems: [
        {
          productId: "bowl",
          slug: "bowling-1h",
          name: "Bowling - 1 Hour",
          kind: "ATTRACTION",
          quantity: 2,
          unitLabel: "lane",
          unitPriceCents: 4000,
          totalCents: 8000,
          discountCents: 0,
        },
      ],
    });
    const items = lineItemsFromPayload(payload);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe(BOOKING_LINE_ITEM_KINDS.ACTIVITY);
    expect(items[0]?.totalCents).toBe(8000);
    expect(items[0]?.unitPriceCents).toBe(4000);
  });
});
