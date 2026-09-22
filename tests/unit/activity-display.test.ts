import { describe, expect, it } from "vitest";

import { formatActivityDetails, formatActivityLine } from "@/lib/event-planner/activity-display";
import { formatDurationMinutes, formatEventDuration } from "@/lib/event-planner/labels";

describe("activity display", () => {
  it("shows duration and guest-facing quantity without inventing a 1", () => {
    expect(
      formatActivityDetails(
        { knowledgeItemId: "axe", name: "Axe Throwing - 60 Minutes", quantity: 1, priceCents: 0 },
        {
          guestCount: 20,
          itinerary: [
            {
              startTime: "18:30",
              endTime: "19:30",
              label: "Axe Throwing - 60 Minutes",
              durationMinutes: 60,
            },
          ],
        },
      ),
    ).toBe("1 hour · 20 guests");
    expect(
      formatActivityLine(
        { knowledgeItemId: "bowl", name: "Bowling - 1 Hour", quantity: 4, unitLabel: "lane", priceCents: 0 },
        { guestCount: 20, durationMinutes: 60 },
      ),
    ).toBe("Bowling - 1 Hour · 1 hour · 4 lanes");
    expect(
      formatActivityDetails(
        { knowledgeItemId: "arcade", name: "1 Hour Unlimited Arcade Play", quantity: 20, priceCents: 0 },
        { guestCount: 20, durationMinutes: 60 },
      ),
    ).toBe("1 hour · 20 guests");
  });

  it("formats 60 minutes as 1 hour", () => {
    expect(formatDurationMinutes(60)).toBe("1 hour");
    expect(formatEventDuration(60)).toBe("1 hour");
  });
});
