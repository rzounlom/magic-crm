import {
  eventGroupComplete,
  plannerStepError,
  preferenceGroupComplete,
  to24HourTime,
  type PlannerAnswers,
} from "@/lib/event-planner/intake-contract";

/** UX8 customer journey — maps onto existing planner validation units. */
export const JOURNEY_STEPS = [
  { id: "event", label: "Your event", shortLabel: "Event" },
  { id: "fun", label: "The fun stuff", shortLabel: "Fun" },
  { id: "when", label: "When", shortLabel: "When" },
  { id: "details", label: "Your details", shortLabel: "Details" },
] as const;

export type JourneyStepId = (typeof JOURNEY_STEPS)[number]["id"];

export function journeyIndex(step: JourneyStepId): number {
  return JOURNEY_STEPS.findIndex((row) => row.id === step);
}

export function journeyStepError(
  step: JourneyStepId,
  answers: PlannerAnswers,
  options?: { attractionRequired?: boolean },
): string | null {
  switch (step) {
    case "event":
      return eventGroupComplete(answers)
        ? null
        : plannerStepError("event", answers) ??
            plannerStepError("guests", answers) ??
            plannerStepError("mix", answers);
    case "fun": {
      if (options?.attractionRequired && answers.attractionInterestIds.length === 0) {
        return "Choose at least one activity.";
      }
      return preferenceGroupComplete(answers)
        ? null
        : plannerStepError("food", answers) ??
            plannerStepError("space", answers) ??
            plannerStepError("budget", answers) ??
            plannerStepError("length", answers);
    }
    case "when":
      return plannerStepError("when", answers);
    case "details":
      return plannerStepError("contact", answers);
    default:
      return null;
  }
}

/** Human-readable start times every 30 minutes, 9:00–21:00 venue-local wall clock. */
export function publicStartTimeOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  for (let minutes = 9 * 60; minutes <= 21 * 60; minutes += 30) {
    const hour24 = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const value = `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const period = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 || 12;
    const label = `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
    options.push({ value, label });
  }
  return options;
}

export function startTimeFromAnswers(
  answers: Pick<PlannerAnswers, "startHour" | "startMinute" | "startPeriod">,
): string {
  return to24HourTime(answers.startHour, answers.startMinute, answers.startPeriod) ?? "";
}

export function answersFromStartTime24(value: string): Partial<PlannerAnswers> {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    return { startHour: "", startMinute: "", startPeriod: "" };
  }
  const hour24 = Number(match[1]);
  const minute = match[2];
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return {
    startHour: String(hour12),
    startMinute: minute,
    startPeriod: period,
  };
}

export const EVENT_TYPE_HELP: Record<string, string> = {
  "Birthday Party": "Celebrate with attractions, food, and space that fit your guest list.",
  "Corporate Event": "Team outings, appreciation, and offsites with clear options.",
  "School / Church": "Group visits for youth, classes, and community gatherings.",
  "Nonprofit / Community": "Fundraisers and community groups with flexible packages.",
  "Private Group": "Friends, families, and private celebrations.",
  "Sports Team": "Team parties and end-of-season celebrations.",
  Other: "Tell us what you have in mind — we'll recommend options.",
};
