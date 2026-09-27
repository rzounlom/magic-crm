import { describe, expect, it } from "vitest";

import {
  formatCustomerDurationMinutes,
  formatCustomerDurationText,
} from "@/lib/event-planner/labels";

describe("customer duration formatting", () => {
  it("normalizes minute counts without rewriting catalog math", () => {
    expect(formatCustomerDurationMinutes(30)).toBe("30 minutes");
    expect(formatCustomerDurationMinutes(60)).toBe("1 hour");
    expect(formatCustomerDurationMinutes(90)).toBe("90 minutes");
    expect(formatCustomerDurationMinutes(120)).toBe("2 hours");
  });

  it("normalizes duration phrases inside a product name", () => {
    expect(formatCustomerDurationText("Axe Throwing - 30 Minutes")).toBe("Axe Throwing - 30 minutes");
    expect(formatCustomerDurationText("Axe Throwing - 60 Minutes")).toBe("Axe Throwing - 1 hour");
    expect(formatCustomerDurationText("Unlimited Laser Tag - 90 Minutes")).toBe(
      "Unlimited Laser Tag - 90 minutes",
    );
    expect(formatCustomerDurationText("Bowling - 1 Hour")).toBe("Bowling - 1 hour");
    expect(formatCustomerDurationText("Party - 2 Hours")).toBe("Party - 2 hours");
  });
});
