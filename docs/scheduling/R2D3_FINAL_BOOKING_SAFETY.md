# R2D.3 — Final Booking Safety Gate & Overnight Occupancy

## Confirmation policy

| Operating status | Pending | Confirm / HOLD |
|---|---|---|
| WITHIN_HOURS | Allowed | Allowed |
| OUTSIDE_HOURS | Block | Block unless matching staff exception |
| HOURS_UNCONFIGURED | Allowed as unresolved | Block unless matching staff exception |
| HOURS_UNVERIFIED | Allowed as unresolved | Block unless matching staff exception |
| INVALID_LOCAL_TIME | Block | Block (never overridable) |

## Staff exception

Model: `OperatingHoursStaffException`

Requires `events.confirm`. Bound to exact org/location/slotDate/startMinute/endMinute/purpose.
One-time consume. Revocable. TTL default 2 hours.
Cannot override invalid local time, resource conflicts, tenant isolation, or capacity.

## Overnight occupancy

Confirmed defect (R2D.2 era): same-day `slotDate` + minute exclusion alone does not conflict Saturday `1380–1500` with Sunday `30–90`.

Fix:
- Application conflict checks also use `startsAt`/`endsAt` absolute overlap when a scheduling time zone is supplied.
- Additive DB exclusion `resource_reservations_no_overlap_instants` on `tstzrange(startsAt, endsAt)`.
- Same-day int4range exclusion retained.

## Closure semantics for overnight hours

Overnight containment is evaluated on the **start civil day** (including `endMinute > 1440`).
A CLOSED exception on the following civil date does **not** retroactively invalidate an overnight interval already contained in the prior day's approved open window.
Events that **start** on a closed day remain blocked.

## Generations

No operating-hours policy seeded. Tax remains disabled. Historical bookings/reservations unchanged.
