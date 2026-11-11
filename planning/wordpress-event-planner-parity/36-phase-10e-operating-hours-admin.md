# Phase 10E — Operating hours administration and staff workflow validation

**Date:** 2026-11-11  
**Org (reference):** `mdutc2nkvpafezukeem8942v`  
**Main Location (reference):** `rysftywo62ve9sao10dk71si`  
**PR #16:** merged `71f14a82c254ed69ffb749b0166f6f612f5a1e6e` — Production Ready

## 1. Existing architecture (reused)

| Layer | Status |
| --- | --- |
| Prisma policy / weekly windows / date exceptions / staff exceptions | Present |
| Evaluation (`evaluateOperatingHours`) + write guards | Present |
| Staff one-time exceptions (`events.confirm`, 2h TTL, fingerprint, consume, audit) | Present on inquiry workspace |
| Admin UI to configure weekly hours | **Was missing** — added this phase |

## 2. New administration functionality

Routes (tenant-scoped, `locations.manage`):

- `/app/admin/operating-hours`
- `/app/admin/operating-hours/[locationId]`

Capabilities:

- Draft weekly windows Sun–Sat (multiple windows/day, closed days, overnight ends)
- Holiday / special-date CLOSED and CUSTOM exceptions
- Explicit VERIFIED with approval note; edits demote to DRAFT
- Audit events for draft save / verify / demote / exception save-delete
- Nav item **Hours** under Settings

**Does not** invent or write Generations Production hours. Owner must supply real venue times before any Production apply.

## 3. Staff exception handling (unchanged)

- Who: `events.confirm` (Administrators + Event Sales by default; not Front Desk)
- Scope: exact occupancy fingerprint (date + minutes + purpose CONFIRM_BOOKING / PLACE_HOLD)
- Expiry: default 2 hours; revoked or consumed after use
- Approver: `authorizedByUserProfileId` + audit `scheduling.hours_exception_*`
- Not auto-approved; inventory/hours validation not weakened

## 4. Staff quote workflow verification

| Step | Result | Evidence |
| --- | --- | --- |
| Create draft / review calc | Pass | Integration WP draft + delivery suites |
| Event Sales qty edit, no unit override | Pass | `allows Event Sales…` / Phase 9C financial E2E |
| Administrator unit override | Pass | Same |
| Event Sales approve, delivery blocked | Pass | `delivered: false` on `approved_plugin_baseline` |
| Availability / room mapping | Pass | Existing inventory/mapping tests remain green |
| Authenticated browser walkthrough | **Not run** | Requires headed Clerk TEST bootstrap; no Production writes. Service-level coverage only. |

## 5. Tests run

- Unit: operating-hours validation + evaluation + hours-exception + authorization
- Integration: new hours-admin, existing hours-guards, tenant-isolation, WP staff quote delivery, WP financial lifecycle E2E
- Typecheck / lint (0 errors) / production build (includes new hours routes)

## 6. Tax / payment boundaries

Hours admin writes only `location_operating_hours_*` (+ audit). No changes to WP pricing, quote taxes, booking totals, deposits, or payment attestation.

## 7. Remaining owner information needed

For Main Location (`America/Indiana/Indianapolis`):

1. Weekly open/closed + local open/close per day (multi-window if needed)
2. Holidays / special closed dates
3. Custom open dates that differ from weekly windows
4. Whether private events may extend outside standard hours (staff exception policy)
5. Who may mark VERIFIED and the approval note text

## 8. Remaining go-live blockers

- Production hours still unconfigured until owner data + authorized apply
- Final live price revalidation pending
- Customer quote delivery / Resend / card payments still disabled
- Tax activation still pending
- Controlled Production staff UI walkthrough still deferred
