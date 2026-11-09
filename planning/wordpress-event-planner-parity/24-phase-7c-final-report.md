# Phase 7C — Role-based quote approval and operational readiness

**Branch:** `phase-7-staff-quote-draft` (PR #9)  
**Status:** Implementation complete for Phase 7C scope; customer live email and Production bookings remain intentionally disabled.

## 1. Actual MagicCRM role and permission model

MagicCRM does **not** invent parallel Clerk role names for quote actions. Authorization is:

| Layer | Behavior |
| --- | --- |
| Clerk | Organization membership; org admin bootstraps MagiCRM Administrators group |
| MagiCRM security groups | System groups with explicit `permissionKeys` |
| Server policies | `requirePermission` / `requirePermissions` / `hasPermission` |

Default system groups (`src/server/authorization/default-security-groups.ts`):

- **Administrators** — all permission keys (including new quote permissions)
- **Event Sales** — inquiries manage/view, **`crm.quotes.approve`**, customers, events confirm/create/edit/cancel, calendar, inventory view, communications view/send, AI view
- **Front Desk** — POS / limited customers / events view / payments collect (no inquiry manage, no quote approve)
- **Operations** — events/calendar/waivers/inventory view
- **Accounting / Managers** — payments view/refund, reports

New permissions (smallest compatible extension):

- `crm.quotes.approve` (`CRM_QUOTES_APPROVE`) — approve / authorize customer quote send path
- `crm.quotes.price_override` (`CRM_QUOTES_PRICE_OVERRIDE`) — change unit cents on staff drafts (Administrators only by default)

## 2. Who can create, edit, approve, and send quotes

| Action | Permission(s) | Typical group |
| --- | --- | --- |
| View inquiries | `crm.inquiries.view` | Event Sales, Admin |
| Create / refresh WP staff draft | `crm.inquiries.manage` | Event Sales, Admin |
| Edit draft (qty, schedule, notes) | `crm.inquiries.manage` | Event Sales, Admin |
| Change unit price cents | `crm.inquiries.manage` **and** `crm.quotes.price_override` | Admin |
| Check availability | `crm.inquiries.manage` | Event Sales, Admin |
| Approve quote (internal) | `crm.inquiries.manage` **and** `crm.quotes.approve` | Event Sales, Admin |
| Deliver customer quote (publish + email attempt) | same as approve, **plus** `communications.send` when policy allows delivery | Event Sales, Admin |
| Confirm booking | existing `events.confirm` | Event Sales, Admin |
| Collect payment | existing `payments.collect` / POS keys | Front Desk / Accounting as before |

UI gating mirrors server checks (`canApproveQuotes`, `canOverrideQuotePricing`); hidden buttons are not the security boundary.

## 3. Whether new permissions were necessary

Yes — two keys only. Existing `crm.inquiries.manage` covered draft create/edit/availability but did not distinguish **standard approval** from **pricing exceptions**. No parallel role system was added.

## 4. Email delivery implementation status

- Prior behavior was a stub / skip path.
- Phase 7C adds `src/server/communications/email-provider.ts`:
  - `EMAIL_PROVIDER=none` (default) → `NullEmailProvider` → SKIPPED / `NO_EMAIL_PROVIDER`
  - `EMAIL_PROVIDER=console` → local log only, marks SENT with `console:` message id
  - Unknown modes (including any live SMTP/API names) resolve to **none**
- Delivery still requires explicit approve action + pricing policy `canDeliver` (`tenant_live` only).
- Idempotency key: `employee_approved_quote:{inquiryId}:{planId}:{totalCents}` — retries do not duplicate sends.
- Audit: delivery, skip, and failure events recorded.
- **Live customer email is not enabled in this PR.**

## 5. WP inventory mapping coverage

`src/server/event-planner/wp-parity/inventory-mapping.ts`:

| Class | Items |
| --- | --- |
| Reservable (hold required for booking) | bowling, axe, laser, golf |
| Capacity | climbing (hold required), arcade (validate when mapped; hold optional) |
| Pricing-only | e.g. bowling shoes |
| Food / catering | `food.*` keys |
| Rooms | `rooms.*`, `mezzanine.*` |
| Optional add-ons | `facility.*` |

Draft create/edit attaches soft `resourceRequirements` when org resource types match (no holds).  
Booking confirmation / pending booking creation blocks when employee-approved WP quotes still lack mapped requirements for reservable attractions.

## 6. Quote → booking → payment consistency

Guards:

- `planPayloadTotal` prefers snapshotted `lineItems`
- `assertApprovedQuoteAmountsConsistent` on pending booking create + confirm for employee-approved quotes
- `lineItemsFromPayload` prefers quote `lineItems` (no catalog reprice)
- Deposit uses `depositRequiredCents(totalCents, tenantPercent)` from the approved total
- Existing pending-booking path reuses PENDING_PAYMENT booking rather than duplicating on re-accept
- Pricing verification gate unchanged: `approved_plugin_baseline` may approve internally but **cannot deliver** customer quotes

## 7. Remaining blockers (pre Production merge)

1. Generations pricing still `approved_plugin_baseline` — customer delivery blocked until `tenant_live` or explicitly approved policy change
2. No live email provider configured — Production customer notification not ready
3. Tenant resource types must exist for reservable attractions or booking confirm is blocked
4. End-to-end Production booking/payment smoke remains out of scope for this PR (intentionally)

## 8. Test results

See PR update / CI after push. Local suite targets:

- Unit: email provider, inventory mapping, approved amounts, quote→booking amounts, existing WP delivery/draft units
- Integration: WP staff draft + delivery (roles, tenant isolation, baseline gate, Event Sales approve, price override denial)
- Lint, typecheck, production build

## 9. PR #9 readiness assessment

Phase 7A–7C are on the same branch. Safe to review for merge **after** CI green, with the understanding that:

- Customer quote **delivery** remains gated by pricing verification
- Email remains non-live
- No Scenario Lab / catalog overwrite / Preview deploy / Production bookings in this work

**Recommended merge posture:** merge when CI passes; enable live delivery only after operational verification (`tenant_live` + real email provider) in a follow-up.
