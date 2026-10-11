# SBF3 — End-to-End Staff Booking Journey & Operational Workflow Completion

**Status:** Complete for staff journey continuity (labels, sticky guide, HOLD↔confirm handoff, focused E2E tests).  
**FULL INTEGRATION NOT RUN — run separately before milestone/merge/deployment.**  
**Browser E2E harness:** none in repo — manual smoke steps documented below.  
**STOP after SBF3.** Do not begin the UI/UX redesign from this phase.

Design north star remains deferred. This phase reuses existing routes/components only.

---

## 1. Real route / action / service workflow map

| Stage | Route / UI | Action | Service | Authoritative records | Usable |
|---|---|---|---|---|---|
| Inquiry received | Public intake / staff create | `createPublicInquiry` / `createEmployeeManualBookingAction` | inquiry-service | `Inquiry` | Yes |
| Open / assign | `/app/inquiries/[id]` sticky bar | `startWorkingInquiryAction` | `startWorkingInquiry` | assignment + `AGENT_WORKING` | Yes |
| Requirements review | Workspace aside + intake fields | (read) | inquiry detail | Inquiry columns | Yes |
| Date/time/location/plan edit | `AgentWorkingPlanForm` | `saveAgentWorkingPlanAction` | `saveAgentWorkingPlan` | `EventPlanRecommendation` AGENT_WORKING | Yes (no occupancy) |
| Availability | Rooms and lanes | `checkInquiryAvailabilityAction` | `checkResourceAvailability` | plan `availability*` | Advisory |
| Proposal select | Public plan / adopt | `selectPublicEventPlan` / `adoptRecommendationAction` | event-plan / live-agent | `selectedEventPlanId` | Yes |
| HOLD | HOLD readiness + rooms/lanes | `placeInquiryHoldAction` (+ PLACE_HOLD exception) | `placeInquiryPlanHold` → `placeProposalHold` | `ResourceReservation` HOLD (24h) | Yes (SBF2) |
| Confirm readiness | Confirmation readiness panel | authorize/revoke CONFIRM_BOOKING | `getConfirmationReadiness` | exception row | Yes (SBF1) |
| Confirm | Sticky **Confirm booking** | `confirmBookingAction` | `confirmInquiryBooking` → `confirmPendingBooking` | `Booking` CONFIRMED + BOOKED rows | Yes |
| Visibility | Inquiry, `/app/bookings/[id]`, `/app/schedule` | redirect after confirm | list/detail/schedule loaders | BOOKED reservations | Yes |

**Supported confirm path:** HOLD is **optional**. Matching HOLDs convert to BOOKED; mismatched/stale HOLDs are released and fresh BOOKED rows are inserted. `PLACE_HOLD` exceptions never authorize confirmation.

---

## 2. Status transition map

| Layer | Values (DB) | Staff-facing label (SBF3) |
|---|---|---|
| Inquiry | NEW → … → READY_FOR_HUMAN → BOOKED | Existing inquiry labels; BOOKED = converted |
| Sales stage | DEPOSIT_PENDING (legacy) | **Pending confirmation** |
| HOLD | ResourceReservation HOLD + expiresAt | Active HOLD / expired / released |
| Booking | PENDING_PAYMENT (legacy enum) | **Pending confirmation** |
| Booking | CONFIRMED | Confirmed |
| Payment | No processor status | External attestation field may be set on confirm; **not** “paid in MagicCRM” |

No database enum rename in this phase.

---

## 3. P0 / P1 / P2 findings

### P0 (fixed)
1. Staff CTAs framed confirmation as payment collection (`Confirm Payment & Book`, “Pending payment”).
2. Sticky guide ignored HOLD state (voided props; Availability → Confirm only).

### P1 (fixed, small)
3. Stale HOLD coverage hard-blocked confirm in UI while server could confirm safely.
4. Mismatched HOLDs could leave orphan active HOLD occupancy beside fresh BOOKED rows.
5. No navigation after successful confirm from inquiry.
6. Stale `NOT_READY_TO_FINALIZE` error copy implied Ready-to-Finalize gate that confirm no longer uses.

### P1 / P2 (documented for redesign)
7. Dual HOLD + Confirmation readiness panels; dual exception purposes (correct, but dense).
8. `markReadyToFinalize` still HOLD-gated with no primary UI (dead branch for sticky flow).
9. Confirmed inquiries remain in Active queue until event end (by design).
10. Exception rows not auto-revoked on plan edit (fingerprint fail-closed; TTL hygiene).
11. Visual redesign / MagicCRM design system (out of scope).

---

## 4. P0 defects corrected

- Payment-neutral labels: `BOOKING_STATUS_LABELS`, sales stage label, queue section, booking list filter, pending panel, sticky confirm CTA/dialog, conflict banner.
- Sticky steps: Review → Check Availability → **HOLD (optional)** → **Confirm booking**.
- Guide uses `needsHold` / `hasHold` / `canPlaceHold` and links to `#hold-readiness`.

## 5. Small P1 fixes completed

- Confirm success returns `redirectTo: /app/bookings/{id}`.
- HOLD coverage mismatches are advisory warnings; confirm remains available when readiness allows.
- `confirmPendingBooking` releases unmatched HOLDs before allocating fresh BOOKED rows.
- Confirmed sticky links to booking + Master Schedule.
- Actionable booking error copy for unfinished details.

---

## 6. Inquiry-to-plan findings

- Contact/event fields preserved; working plan edits do not overwrite selected recommendation snapshot.
- Plan save does not create occupancy.
- Unauthorized cross-tenant inquiry modification fails closed (org-scoped queries).
- Availability / exception fingerprints recompute from trusted plan data after edits.

## 7. Plan-to-proposal findings

- Selected recommendation remains identifiable; AGENT_WORKING is staff draft.
- Pricing remains engine-derived; SBF3 did not change package grants, promotions, or tax.
- Advisory availability is not presented as a guarantee in sticky copy.

## 8. HOLD-to-confirmation findings

| Scenario | Result |
|---|---|
| Valid HOLD → confirm | Matching HOLDs convert to BOOKED |
| Expired / released HOLD → confirm | Fresh BOOKED allocation under hours guard |
| Changed time after HOLD | Stale HOLD released; new BOOKED for new window |
| PLACE_HOLD exception for confirm | Rejected (`HOURS_EXCEPTION_INVALID`) |
| CONFIRM_BOOKING exception only | Consumed on successful confirm |
| Repeated confirm | Idempotent already-confirmed |
| Resource conflict | Confirm fails; exception unconsumed when applicable |

## 9. Permission and tenant-isolation findings

- Confirm: `events.confirm` + `crm.inquiries.manage`.
- HOLD place: `events.create` + `crm.inquiries.manage`.
- Hours exceptions: `events.confirm`.
- Cross-org inquiry IDs resolve as not found / resource invalid — no cross-tenant write.
- Customer routes cannot authorize staff exceptions.

## 10. Confirmed-event visibility

- Inquiry detail shows confirmed state + booking link.
- Successful confirm redirects to booking detail.
- Master Schedule shows BOOKED occupancy.
- Dedicated customer CRM module not required for this phase.

## 11. Payment-neutral behavior

- MagicCRM does not process payment, fees, deposits, refunds, or processor schemas.
- `PENDING_PAYMENT` DB value retained; staff label = Pending confirmation.
- Confirm may set external payment attestation (`paymentConfirmedExternallyAt`) — operational attestation outside MagicCRM, not processor capture.
- Tests assert confirmation succeeds without inventing processor payment success.

## 12. Files changed

- `src/types/booking.ts`, `src/types/inquiry.ts`
- `src/lib/inquiries/inquiry-status-display.ts`, `live-agent-next-step.ts`
- `src/lib` / UI: booking actions, inquiry queue, booking list, pending panel, bookings page, schedule create dialog, employee selected plan, live-agent workspace
- `src/server/actions/bookings.ts`, `live-agent.ts`
- `src/server/services/pending-booking-service.ts`
- `src/server/errors.ts`
- `tests/unit/*` (guide, booking actions, labels, queue, pending panel)
- `tests/integration/staff-booking-journey.test.ts`
- `docs/staff-booking/SBF3_END_TO_END_STAFF_BOOKING_JOURNEY.md`

## 13. Tests added

`tests/integration/staff-booking-journey.test.ts`:

1. Inquiry → pending → HOLD → confirm (verified hours)
2. Pending without HOLD → confirm
3. Expired HOLD / released HOLD → confirm
4. Resource conflict + PLACE_HOLD purpose isolation
5. Stale CONFIRM_BOOKING exception after time change
6. Cross-tenant denial
7. Mismatched HOLD release on confirm
8. Duplicate confirm idempotency + payment-neutral status label

## 14–15. FAST validation / focused integration

Recorded in the implementation run:

- `corepack pnpm lint` — pass
- `corepack pnpm typecheck` — pass
- `corepack pnpm test:unit` — 540 passed
- Focused: `tests/integration/staff-booking-journey.test.ts` — 7 passed
- `corepack pnpm build` — pass

Full integration suite **not** run.

## 16. Browser smoke-test status

**No browser E2E harness** (Playwright/Cypress) in this repository.

Manual smoke (synthetic TEST tenant with verified hours fixture):

1. Open inquiry → Start Working  
2. Edit working plan → Save → Check Availability  
3. Place optional HOLD (or skip)  
4. Confirm booking when readiness allows  
5. Land on booking detail; see event on Master Schedule  
6. Confirm labels say Pending confirmation / Confirm booking (not Pending payment)

## 17. Generations DEV preservation

- No Generations hours policy seeded.
- No tax activation.
- No catalog/pricing/promotion changes.
- No real Generations bookings.
- Synthetic TEST orgs only for journey tests.

## 18. Remaining workflow gaps

- Revive or retire `markReadyToFinalize` UI consistently.
- Auto-revoke unused exceptions on plan fingerprint change (TTL already bounds risk).
- Confirmed-events bucket in inquiry queue.
- Processor-agnostic payment status model (future).

## 19. UI/UX redesign handoff

- Unify HOLD + confirmation readiness into one progressive staff coach.
- Replace dual exception forms with purpose-aware single panel.
- Apply MagicCRM design system; do not ship Airbnb/PayPal assets.
- Mobile sticky-bar density and next-step clarity.
- Payment processor selection UX remains future work — keep confirmation payment-neutral until then.
