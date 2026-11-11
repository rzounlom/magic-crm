# Phase 10J — Generations Main Location operating-hours VERIFIED

**Date:** 2026-11-11  
**Mode:** Owner-authorized Production write (verification only)  
**Script:** `scripts/phase-10j-apply-hours-verified.ts`  
**Service path:** `verifyOperatingHoursPolicy` (no ad hoc SQL status update)

## Owner authorization

Explicit owner authorization received:

> Mark Generations Main Location operating-hours policy `s07kml2m6xfiwg8ood8vzc6r` VERIFIED, using an approval note acknowledging the homepage/reservations schedule and unresolved conflicting FAQ body. Do not change weekly windows, add holiday exceptions, enable emails, customer quote delivery, or card payments.

## Target

| Field | Value |
| --- | --- |
| Database host | `ep-bold-art-avjy5nt4` (customer Production) |
| Organization ID | `mdutc2nkvpafezukeem8942v` |
| Organization slug | `generations-crm-test-1788129640704833684` |
| Location ID | `rysftywo62ve9sao10dk71si` (Main Location) |
| Policy ID | `s07kml2m6xfiwg8ood8vzc6r` |
| Timezone | `America/Indiana/Indianapolis` |

## Before-state snapshot (preflight)

| Field | Value |
| --- | --- |
| Status | `DRAFT` |
| `approvedAt` | `null` |
| `approvedByNote` | `null` |
| `updatedAt` | `2026-11-11T22:06:07.423Z` |
| Holiday exceptions | `0` |
| Weekly windows | `5` (Mon/Tue closed) |
| Windows fingerprint | `0:720-1200\|3:900-1260\|4:900-1260\|5:720-1320\|6:660-1320` |
| Prior verify audits | `0` |

### Authorized weekly schedule (unchanged)

| Day | Window |
| --- | --- |
| Sunday | 12:00–20:00 |
| Monday | CLOSED |
| Tuesday | CLOSED |
| Wednesday | 15:00–21:00 |
| Thursday | 15:00–21:00 |
| Friday | 12:00–22:00 |
| Saturday | 11:00–22:00 |

## Exact approval note

> Administrator verification authorized by owner. Weekly hours follow the official Generations Adventureplex homepage and reservations-page schedule. The FAQ body publishes conflicting hours; discrepancy remains documented and unresolved. Monday and Tuesday are closed for public operations; private events require authorized booking-specific exceptions.

Length: 352 characters (within 8–500 validation).

## Verification result

| Field | Value |
| --- | --- |
| Result | **SUCCESS** |
| Transition | `DRAFT` → `VERIFIED` |
| `approvedAt` | `2026-11-11T22:14:29.854Z` |
| Actor user profile | `o5jk4pt0r2g3fi7u5a35edb1` (`rz***@gmail.com`) |
| Weekly windows changed | **No** |
| Holiday exceptions changed | **No** |
| Blanket private-event exception | **Not granted** |

## Independent after-state read-back

| Check | Result |
| --- | --- |
| Policy / org / location IDs | Match |
| Timezone | Unchanged |
| Status | `VERIFIED` |
| Approval note exact match | Yes |
| Seven-day schedule vs preflight | Identical fingerprint |
| Holiday exception count | `0` |
| Staff exception count | `0` (unchanged) |

## Audit record

| Field | Value |
| --- | --- |
| Audit ID | `s6esxyv1aa1z8tbwi15k1107` |
| Action | `scheduling.hours_policy_verified` |
| Resource | `location_operating_hours_policy` / `s07kml2m6xfiwg8ood8vzc6r` |
| Timestamp | `2026-11-11T22:14:29.910Z` |
| Actor | `o5jk4pt0r2g3fi7u5a35edb1` |

## Booking-hours evaluation (read-only; no Production bookings)

| Scenario | Date (venue TZ weekday) | Expected | Actual |
| --- | --- | --- | --- |
| Wednesday 4 PM–6 PM | 2026-11-18 | `WITHIN_HOURS` | `WITHIN_HOURS` |
| Monday 4 PM–6 PM | 2026-11-16 | `OUTSIDE_HOURS` | `OUTSIDE_HOURS` |
| Tuesday 4 PM–6 PM | 2026-11-17 | `OUTSIDE_HOURS` | `OUTSIDE_HOURS` |
| Friday 11 PM–11:30 PM | 2026-11-20 | `OUTSIDE_HOURS` | `OUTSIDE_HOURS` |
| Sunday 1 PM–3 PM | 2026-11-15 | `WITHIN_HOURS` | `WITHIN_HOURS` |

Private events outside standard hours still require per-booking `OperatingHoursStaffException`.

## FAQ discrepancy (preserved)

Saved/verified schedule follows homepage + reservations footer. FAQ body (`/faq/`) still publishes conflicting hours (e.g. Tue–Thu 4–10, Fri 4–12am). Discrepancy acknowledged in the approval note; **not** resolved in MagiCRM or website content by this phase.

## Tenant isolation

| Check | Result |
| --- | --- |
| Other Generations location policies | Unchanged (count `0`) |
| Synthetic tenant policies | Unchanged |
| Other customer tenant verified count | Unchanged |

## Unchanged operational configuration

| Item | Value |
| --- | --- |
| Customer-facing name | Generations Adventureplex |
| Pricing source | `approved_plugin_baseline` |
| Final live price revalidation | `pending` |
| Deposit | 25% |
| Admin quote perms | approve + price override; `locations.manage` |
| Event Sales quote perms | approve; no price override; no `locations.manage` |
| Customer quote delivery | blocked (`canDeliver: false`) |
| Live email / card payments | not activated by this phase |

## Remaining go-live blockers

1. FAQ website content still conflicts with verified MagiCRM hours (content cleanup outside MagiCRM).
2. Final live price revalidation remains `pending` (not `tenant_live`).
3. Customer quote delivery remains blocked by design until operational verification allows delivery.
4. Live email (Resend) and card payment collection remain intentionally disabled.
5. Editing verified hours in admin will demote the policy back to `DRAFT` (expected safeguard).

## Non-goals confirmed

No Scenario Lab use. No weekly-window edits. No holiday exceptions. No pricing/deposit/tax/inventory/permission/inquiry/booking/payment writes beyond the single hours verification transition.
