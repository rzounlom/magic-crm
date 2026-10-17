import { randomBytes } from "node:crypto";

import { answersFromStartTime24 } from "@/lib/event-planner/intake-journey";
import { EVENT_TYPE_OPTIONS } from "@/types/event-planner";

function futureEventDate(daysAhead = 28): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

/**
 * Synthetic fixture for Scenario Lab inquiry staging.
 * Uses reserved example domains and non-routable phone examples only.
 */
export type ScenarioLabInquiryFixture = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  customerGroupName: string;
  eventType: string;
  guestCount: number;
  guestMix: "mostly_children" | "mostly_adults" | "mixed_ages";
  foodPreference: "WANTS_FOOD" | "NO_FOOD";
  privateSpacePreference: "YES" | "NO_PREFERENCE";
  budgetBand: "under_1500" | "1500_3000" | "3000_5000";
  desiredDurationMinutes: 90 | 120 | 150 | 180;
  eventDate: string;
  startHour: string;
  startMinute: string;
  startPeriod: "AM" | "PM";
  attractionInterestIds: string[];
  notes: string;
  locationId: string;
  locationName: string;
};

const FIRST_NAMES = ["Avery", "Jordan", "Riley", "Casey", "Morgan", "Quinn"] as const;
const LAST_NAMES = ["Example", "Testperson", "Sampleton", "Demo", "Fixture"] as const;

export function generateScenarioLabInquiryFixture(input: {
  locationId: string;
  locationName: string;
  attractionInterestIds: string[];
  eventDate?: string;
}): ScenarioLabInquiryFixture {
  const suffix = randomBytes(3).toString("hex");
  const firstName = FIRST_NAMES[Number.parseInt(suffix.slice(0, 2), 16) % FIRST_NAMES.length]!;
  const lastName = LAST_NAMES[Number.parseInt(suffix.slice(2, 4), 16) % LAST_NAMES.length]!;
  const start = answersFromStartTime24("14:00");

  return {
    firstName,
    lastName,
    email: `scenario.lab.${suffix}@example.com`,
    phone: "5550101234",
    customerGroupName: `Scenario Lab Party ${suffix.toUpperCase()}`,
    eventType: EVENT_TYPE_OPTIONS[2] ?? "Birthday Party",
    guestCount: 12,
    guestMix: "mixed_ages",
    foodPreference: "WANTS_FOOD",
    privateSpacePreference: "NO_PREFERENCE",
    budgetBand: "1500_3000",
    desiredDurationMinutes: 120,
    eventDate: input.eventDate ?? futureEventDate(28),
    startHour: start.startHour || "2",
    startMinute: start.startMinute || "00",
    startPeriod: start.startPeriod || "PM",
    attractionInterestIds: input.attractionInterestIds.slice(0, 2),
    notes: "Scenario Lab synthetic inquiry — do not contact as a real customer.",
    locationId: input.locationId,
    locationName: input.locationName,
  };
}
