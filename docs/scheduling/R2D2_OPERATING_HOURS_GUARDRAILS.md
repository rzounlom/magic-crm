# R2D.2 — Local-Time Validation & Operating-Hours Guardrails

## Strict local-time contract

Statuses: `VALID` | `NONEXISTENT_LOCAL_TIME` | `AMBIGUOUS_LOCAL_TIME` | `INVALID_TIMEZONE` | `INVALID_DATE` | `INVALID_TIME` | `DST_INTERVAL_UNSAFE`

- Nonexistent spring-forward times are **rejected** (no fold to 1:30 / 3:30).
- Ambiguous fall-back times are **rejected** until an explicit occurrence is chosen.
- Duration semantics: purchased length is **wall-clock minutes**. If UTC elapsed ≠ wall duration (DST cross), reject.
- Permissive `eventLocalToUtc` remains for historical compatibility only. New occupancy writes use the strict resolver.

## Operating hours

Models: `LocationOperatingHoursPolicy`, `LocationOperatingHoursWindow`, `LocationOperatingHoursException`.

Verification: `UNCONFIGURED` | `DRAFT` | `VERIFIED`. Missing/unconfigured/unverified ≠ open.

Evaluation: `WITHIN_HOURS` | `OUTSIDE_HOURS` | `HOURS_UNCONFIGURED` | `HOURS_UNVERIFIED` | `INVALID_LOCAL_TIME`.

Aggregate: `AVAILABLE` | `UNAVAILABLE` | `REQUIRES_CONFIRMATION` | `UNRESOLVED`.

## Legacy compatibility

| Flow | Invalid local time | Verified closed | Unconfigured / unverified hours |
|---|---|---|---|
| Public / employee pending | Block | Block | Allow pending; status `UNRESOLVED`; explicit legacy log; not labeled confirmed |
| Confirm booking / HOLD / manual HOLD | Block | Block | Allow occupancy with explicit `legacy_hours_compatibility_allow` log |

## Generations evidence (not seeded)

| Topic | Evidence | Status |
|---|---|---|
| Regular Tue–Thu | Public site / sales knowledge: 3:00 PM–9:00 PM | Publicly advertised; **not tenant-approved for engine** |
| Friday | 12:00 PM–10:00 PM | Publicly advertised; unverified for booking engine |
| Saturday | 11:00 AM–10:00 PM | Publicly advertised; unverified for booking engine |
| Sunday | 12:00 PM–8:00 PM | Publicly advertised; unverified for booking engine |
| Monday | Closed for private events | Publicly advertised; private-event exceptions unknown |
| Holidays | Site holidays page exists | Unknown / requires confirmation |
| Raceway | SPECIAL HOURS TBA | Unknown — do not invent |
| Attraction-specific hours | Not reliably documented as engine config | Unknown |

**Generations DEV configuration status:** operating-hours policy **not written**. Remains unresolved / unconfigured for the scheduling engine.

## Historical safety

R2D.1 historical bookings/reservations are not revalidated or rewritten by the strict resolver.
