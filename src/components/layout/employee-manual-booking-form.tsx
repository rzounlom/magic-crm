import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { scheduleStartHint } from "@/lib/resources/schedule-board";
import { createEmployeeManualBookingAction } from "@/server/actions/bookings";
import {
  DINING_PREFERENCE_LABELS,
  DINING_PREFERENCE_VALUES,
  EVENT_DURATION_LABELS,
  EVENT_DURATION_MINUTES,
  EVENT_GOAL_OPTIONS,
  EVENT_TYPE_OPTIONS,
  GUEST_MIX_LABELS,
  GUEST_MIX_VALUES,
  SPACE_PREFERENCE_LABELS,
  SPACE_PREFERENCE_VALUES,
} from "@/types/event-planner";

const FIELD =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export type EmployeeBookingScheduleHint = {
  date?: string;
  startTime?: string;
  locationId?: string;
  resourceName?: string;
  /** Header launch: do not invent a start time. Slot launch passes startTime instead. */
  chooseStartTime?: boolean;
};

export function EmployeeBookingBuilder({
  locations,
  attractions,
  defaultLocationId,
  scheduleHint,
  layout = "page",
  onCreated,
}: {
  locations: Array<{ id: string; name: string }>;
  attractions: Array<{ id: string; name: string }>;
  defaultLocationId: string | null;
  scheduleHint?: EmployeeBookingScheduleHint | null;
  layout?: "page" | "schedule";
  onCreated?: (href: string) => "stay" | void;
}) {
  const startValue = scheduleHint?.startTime
    ? scheduleHint.startTime
    : scheduleHint?.chooseStartTime
      ? ""
      : "17:00";
  const locationValue =
    scheduleHint?.locationId && locations.some((location) => location.id === scheduleHint.locationId)
      ? scheduleHint.locationId
      : (defaultLocationId ?? "");

  return (
    <SecurityActionForm
      action={createEmployeeManualBookingAction}
      className={layout === "schedule" ? "max-w-none space-y-4" : "mt-8 max-w-3xl space-y-4"}
      notice={{ successTitle: "Booking started", errorTitle: "Unable to create booking" }}
      blocking
      blockingLabel="Generating event options…"
      onRedirect={onCreated}
    >
      <div data-employee-booking-builder={layout} className="space-y-4">
      {scheduleHint?.resourceName ? (
        <p data-schedule-hint className="rounded-md bg-muted px-3 py-2 text-sm text-foreground/80">
          {scheduleStartHint(scheduleHint.resourceName, scheduleHint.startTime)}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-foreground/70">Group / customer name</span>
          <input
            name="customerGroupName"
            className={FIELD}
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Contact first name</span>
          <input
            name="firstName"
            required
            className={FIELD}
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Contact last name</span>
          <input
            name="lastName"
            required
            className={FIELD}
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Email</span>
          <input
            type="email"
            name="email"
            required
            className={FIELD}
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Phone</span>
          <input name="phone" className={FIELD} />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Event type</span>
          <select
            name="eventType"
            required
            defaultValue="Private Group"
            className={FIELD}
          >
            {EVENT_TYPE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Event goal</span>
          <select name="eventGoal" className={FIELD}>
            <option value="">Select</option>
            {EVENT_GOAL_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Guest count</span>
          <input
            type="number"
            name="guestCount"
            min={1}
            max={500}
            required
            defaultValue={20}
            className={FIELD}
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Audience</span>
          <select name="guestMix" defaultValue="mixed_ages" className={FIELD}>
            {GUEST_MIX_VALUES.map((value) => (
              <option key={value} value={value}>
                {GUEST_MIX_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Date</span>
          <input
            type="date"
            name="preferredDate"
            required
            defaultValue={scheduleHint?.date ?? ""}
            className={FIELD}
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Start time</span>
          <input
            type="time"
            name="startTime"
            required
            defaultValue={startValue}
            className={FIELD}
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Duration</span>
          <select
            name="desiredDurationMinutes"
            defaultValue="120"
            className={FIELD}
          >
            {EVENT_DURATION_MINUTES.map((value) => (
              <option key={value} value={value}>
                {EVENT_DURATION_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Location</span>
          <select
            name="locationId"
            defaultValue={locationValue}
            className={FIELD}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Food / dining</span>
          <select name="diningPreference" defaultValue="not_sure" className={FIELD}>
            {DINING_PREFERENCE_VALUES.map((value) => (
              <option key={value} value={value}>
                {DINING_PREFERENCE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Room / space</span>
          <select name="spacePreference" defaultValue="no_preference" className={FIELD}>
            {SPACE_PREFERENCE_VALUES.map((value) => (
              <option key={value} value={value}>
                {SPACE_PREFERENCE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {attractions.length > 0 ? (
        <fieldset className="rounded-md border border-border px-4 py-3">
          <legend className="text-sm font-medium">Attractions / package (optional)</legend>
          <p className="mt-1 text-xs text-foreground/60">Leave unchecked to let the catalog recommend a mix.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {attractions.map((item) => (
              <li key={item.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="attractionInterestIds" value={item.id} />
                  {item.name}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}
      <label className="block text-sm">
        <span className="text-foreground/70">Notes</span>
        <textarea name="notes" rows={3} className={FIELD} />
      </label>
      <div className="border-t border-border bg-background py-3">
        <PendingSubmitButton
          pendingLabel="Generating event options…"
          className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
        >
          Generate plan
        </PendingSubmitButton>
      </div>
      </div>
    </SecurityActionForm>
  );
}

export const EmployeeManualBookingForm = EmployeeBookingBuilder;
