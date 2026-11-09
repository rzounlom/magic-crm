import type { AttractionKey } from "@/server/event-planner/wp-parity/types";

/** Shape of `Plugin::sample()` (fully mutable so callers/tests can tweak fields like the PHP array). */
export type WpSampleInquiry = {
  event_type: string;
  first_name: string;
  last_name: string;
  company: string;
  phone: string;
  email: string;
  dates: string[];
  time: string;
  adults: number | string;
  children: number | string;
  duration: string;
  other_hours: number | string;
  food: string;
  private_room: string;
  craft: string;
  has_budget: string;
  budget: number | string;
  description: string;
  comments: string;
  referral: string;
  attractions: Record<AttractionKey, unknown>;
};

/**
 * Port of `Plugin::sample()` from the WordPress plugin: a valid Friday (2026-11-06) corporate
 * inquiry with every attraction answered "no". Returns a fresh object on every call.
 */
export function sampleWpInquiry(): WpSampleInquiry {
  return {
    event_type: "Corporate or Team Event",
    first_name: "Sample",
    last_name: "Guest",
    company: "Sample Company",
    phone: "574-555-0100",
    email: "sample@example.com",
    dates: ["2026-11-06"],
    time: "13:00",
    adults: 10,
    children: 0,
    duration: "3 hours",
    other_hours: "",
    food: "no",
    private_room: "no",
    craft: "no",
    has_budget: "no",
    budget: "",
    description: "Corporate outing",
    comments: "",
    referral: "Website",
    attractions: {
      bowling: "no",
      axe: "no",
      laser: "no",
      golf: "no",
      climbing: "no",
      arcade: "no",
    },
  };
}
