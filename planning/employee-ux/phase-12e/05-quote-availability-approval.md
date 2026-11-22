# Phase 12E — Quote editor, availability & approval clarity

## Quote editor (WP Staff quote)

Observed controls: Guests, Duration, Event date, Start time, line Item/Qty/**Unit cents**, Adjustment note, **Reason for edit (required)**, Save staff edits, Check availability, Approve internal quote, Customer quote preview, Refresh draft from private calculation.

| Criterion | Result | Severity |
|---|---|---|
| Find editor | Tab “Staff quote” — discoverable after Overview | P2 (default tab not quote when draft exists) |
| Editable fields clear | Inputs obvious; unit cents read-only without override | P2 (read-only reason in `title` only) |
| Currency units | Header shows `$4,807.93`; editor uses **cents integers** (`4999`, `55000`) | **P1** |
| Qty / totals | Qty clear; line totals in summary use dollars | OK / mismatch with editor |
| Optional items | Not strongly marked as optional vs required | P2 |
| Pricing warnings | Catalog discrepancies + duration warnings readable | OK; technical WP keys (`food.salad`) P3 |
| Save obvious | “Save staff edits” | OK |
| Draft vs approve | Separate forms; approve labeled “Approve internal quote” when `canDeliver=false` | OK — **correct** |
| Unsaved changes | Tabs keep panels mounted to preserve edits; **no dirty-state warning** if navigating away from page | P2 |

**Local synthetic draft edit:** not executed — local Clerk staff session expired (`LIMITATIONS.md`). Production writes intentionally avoided.

## Availability mental model

Enums in use (`PLAN_AVAILABILITY_STATUS_LABELS`): Not validated · Available · Unavailable · Needs adjustment · Availability changed.

| Employee question | WP quote strip | LA workspace |
|---|---|---|
| Has availability been checked? | Status strip + draft Availability field (`NOT_VALIDATED` raw sometimes) | Rooms and lanes panel + Check Availability |
| Within operating hours? | Buried in readiness / warnings | Confirmation / HOLD readiness mentions hours |
| Resources available? | After Check availability | Clear resource list |
| Actual hold exist? | Not the same as Available | HOLD readiness / Place HOLD |
| Tentative? | Not validated ≈ unchecked | “Advisory checks are not a guarantee” |
| Before confirmation? | Policy: don’t hold/book until approved | Coach steps |

**Confusion:** status strip may show human label “Not validated” while draft `<dd>` still echoes `NOT_VALIDATED` in some paths — inconsistent polish (P3/P2).

Held vs Confirmed are **LA-first**; WP employees may not need HOLD yet — UI should keep them from hunting HOLD on WP detail.

## Approval & delivery (four stages)

| Stage | How UI presents | Correct? |
|---|---|---|
| 1. Draft preparation | Staff quote draft / Save staff edits | Yes |
| 2. Internal approval | Approve internal quote (+ note that delivery not sent) | Yes |
| 3. Customer delivery | Gated banners; `canDeliver:false`; tenant_live jargon | Gate correct; language P1 |
| 4. Booking confirmation | LA Confirm booking; WP discouraged until later | Yes |

**Intentionally blocked delivery is not a bug.**

“10 attention items before customer send” implies send is the near-term goal while policy blocks send indefinitely — **P1 framing** issue (reword to “before contacting the customer / before internal approval”).
