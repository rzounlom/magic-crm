/**
 * Phase 10I — Build + validate Generations Main Location DRAFT hours proposal (no writes).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import {
  DAY_OF_WEEK_LABELS,
  hhMmFromMinutes,
  validateWeeklyWindows,
  type WeeklyWindowInput,
} from "@/lib/operating-hours/admin-validation";

const OUT = path.join("playwright", ".fixtures", "phase-10i-hours-draft-proposal.json");

const WINDOWS: WeeklyWindowInput[] = [
  { dayOfWeek: 0, startMinute: 12 * 60, endMinute: 20 * 60 }, // Sun noon–8pm
  { dayOfWeek: 3, startMinute: 15 * 60, endMinute: 21 * 60 }, // Wed 3–9pm
  { dayOfWeek: 4, startMinute: 15 * 60, endMinute: 21 * 60 }, // Thu 3–9pm
  { dayOfWeek: 5, startMinute: 12 * 60, endMinute: 22 * 60 }, // Fri noon–10pm
  { dayOfWeek: 6, startMinute: 11 * 60, endMinute: 22 * 60 }, // Sat 11am–10pm
];

function display12h(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60);
  const min = totalMinutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${period}`;
}

function main() {
  const validationError = validateWeeklyWindows(WINDOWS);
  const preview = DAY_OF_WEEK_LABELS.map((day, dayOfWeek) => {
    const wins = WINDOWS.filter((w) => w.dayOfWeek === dayOfWeek);
    if (wins.length === 0) {
      const privateEventsDay = dayOfWeek === 1 || dayOfWeek === 2;
      return {
        day,
        dayOfWeek,
        status: "CLOSED" as const,
        publicOpening: null,
        publicClosing: null,
        uiWindows: [],
        notes: privateEventsDay
          ? "Website: Closed for Private Events. No weekly public window. Private events remain bookable via authorized OperatingHoursStaffException (OUTSIDE_HOURS) — not universally unavailable."
          : "Closed (no weekly window).",
      };
    }
    const w = wins[0]!;
    return {
      day,
      dayOfWeek,
      status: "OPEN" as const,
      publicOpening: display12h(w.startMinute),
      publicClosing: display12h(w.endMinute),
      uiWindows: wins.map((row) => ({
        dayOfWeek: row.dayOfWeek,
        startMinute: row.startMinute,
        endMinute: row.endMinute,
        startHhMm: hhMmFromMinutes(row.startMinute),
        endHhMm: hhMmFromMinutes(row.endMinute),
      })),
      notes: null,
    };
  });

  const before = {
    verificationStatus: "UNCONFIGURED",
    weeklyWindows: [] as WeeklyWindowInput[],
    exceptions: [] as unknown[],
  };

  const afterIfDraftSaved = {
    verificationStatus: "DRAFT",
    timezone: "America/Indiana/Indianapolis",
    weeklyWindows: WINDOWS,
    exceptions: [],
    holidaysInvented: false,
    verified: false,
  };

  const payload = {
    ok: validationError == null,
    validationError,
    target: {
      organizationId: "mdutc2nkvpafezukeem8942v",
      organizationSlug: "generations-crm-test-1788129640704833684",
      locationId: "rysftywo62ve9sao10dk71si",
      locationName: "Main Location",
      timezone: "America/Indiana/Indianapolis",
    },
    sourcePreference:
      "Primary baseline: homepage footer + /reservations/ footer (execution-time fetch). FAQ body differs and is documented as conflicting — not silently adopted.",
    before,
    afterIfDraftSaved,
    preview,
    adminUiFormat: {
      description:
        "OperatingHoursWeeklyForm posts windowsJson as JSON array of { dayOfWeek, startMinute, endMinute }. Days with zero windows render as Closed.",
      windowsJson: WINDOWS,
      exampleHhMmRows: WINDOWS.map((w) => ({
        day: DAY_OF_WEEK_LABELS[w.dayOfWeek],
        open: hhMmFromMinutes(w.startMinute),
        close: hhMmFromMinutes(w.endMinute),
      })),
    },
    privateEventHandling: {
      mondayTuesdayWeeklyWindows: "none (public closed)",
      staffExceptionModel: "OperatingHoursStaffException",
      purposes: ["CONFIRM_BOOKING", "PLACE_HOLD"],
      overridableStatuses: ["HOURS_UNCONFIGURED", "HOURS_UNVERIFIED", "OUTSIDE_HOURS"],
      note: "Saving DRAFT (unverified) means confirmation/HOLD remain blocked by HOURS_UNVERIFIED until Administrator verifies — private-event staff exceptions remain available for authorized overrides.",
    },
    approvalRequired:
      "Owner must explicitly authorize: save this proposed schedule as DRAFT for Generations Main Location rysftywo62ve9sao10dk71si only. Do not VERIFIED. Do not invent holidays.",
    productionWrites: false,
  };

  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(payload, null, 2));
}

main();
