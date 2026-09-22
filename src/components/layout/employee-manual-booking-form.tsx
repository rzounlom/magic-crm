import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
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

export function EmployeeManualBookingForm({
  locations,
  attractions,
  defaultLocationId,
}: {
  locations: Array<{ id: string; name: string }>;
  attractions: Array<{ id: string; name: string }>;
  defaultLocationId: string | null;
}) {
  return (
    <SecurityActionForm
      action={createEmployeeManualBookingAction}
      className="mt-8 max-w-3xl space-y-4"
      notice={{ successTitle: "Booking started", errorTitle: "Unable to create booking" }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-foreground/70">Group / customer name</span>
          <input
            name="customerGroupName"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Contact first name</span>
          <input
            name="firstName"
            required
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Contact last name</span>
          <input
            name="lastName"
            required
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Email</span>
          <input
            type="email"
            name="email"
            required
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Phone</span>
          <input name="phone" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Event type</span>
          <select
            name="eventType"
            required
            defaultValue="Private Group"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
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
          <select name="eventGoal" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2">
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
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Audience</span>
          <select name="guestMix" defaultValue="mixed_ages" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2">
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
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Start time</span>
          <input
            type="time"
            name="startTime"
            required
            defaultValue="17:30"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Duration</span>
          <select
            name="desiredDurationMinutes"
            defaultValue="180"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
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
            defaultValue={defaultLocationId ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
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
          <select name="diningPreference" defaultValue="not_sure" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2">
            {DINING_PREFERENCE_VALUES.map((value) => (
              <option key={value} value={value}>
                {DINING_PREFERENCE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Room / space</span>
          <select name="spacePreference" defaultValue="no_preference" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2">
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
        <textarea name="notes" rows={3} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <PendingSubmitButton
        pendingLabel="Generating…"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Generate plan
      </PendingSubmitButton>
    </SecurityActionForm>
  );
}
