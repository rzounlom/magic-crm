# UX4 — Staff Booking Experience

**Status:** Complete for Booking Coach, readiness presentation, mobile action bar, and staff surface polish.  
**FULL INTEGRATION NOT RUN.**  
**STOP after UX4** — do not start UX5 from this document alone.

---

## 1. Previous vs new staff workflow layout

### Previous

```
[Readiness panels at top of page]
[Workspace header]
[Sticky coach top-20 / header-offset — competed with mobile bottom nav]
[Plan / availability / proposal / activity grid]
```

### New

```
[Workspace identity + archive]
[Booking Coach — desktop sticky / mobile in-flow]
[HOLD + confirmation readiness (shared card, separate purposes)]
[Working plan · Availability · Proposal · Customer · Activity]
[Mobile: fixed primary action bar above UX3 bottom nav]
```

Domain flow unchanged: Inquiry → plan → availability → optional HOLD → confirm → booking detail.

---

## 2. Booking Coach state model

Source: `liveAgentBookingGuide` + `liveAgentBookingStepStates` in `src/lib/inquiries/live-agent-next-step.ts`.

| Step | Meaning |
|---|---|
| Review | Start working / finish blockers |
| Check Availability | Inventory setup or availability check |
| HOLD (optional) | Optional temporary reservation |
| Confirm booking | Confirm / booked / cancelled |

Step statuses: `complete` | `current` | `upcoming` | `optional` (HOLD skipped when confirming without HOLD).

Coach does **not** authorize actions — it reflects props already derived from workspace + server readiness.

---

## 3. HOLD vs confirmation readiness separation

| | HOLD | Confirmation |
|---|---|---|
| Service | `getHoldReadiness` | `getConfirmationReadiness` |
| Panel | `HoldReadinessPanel` | `ConfirmationReadinessPanel` |
| Shared UI | `BookingReadinessCard` purpose `PLACE_HOLD` | purpose `CONFIRM_BOOKING` |
| Exception | PLACE_HOLD only | CONFIRM_BOOKING only |

Copy explicitly states purpose isolation. No client-side merge of readiness calculations.

---

## 4. Mobile action-bar strategy

| Token | Role |
|---|---|
| `--booking-action-bar-height` | Fixed bar height |
| `--booking-action-bar-offset` | Clears bar + bottom nav (`0` at `lg+`) |

- One primary mobile action (Start / Inventory / Confirm / Open booking / Cancel)
- Save pending + HOLD review remain in the in-flow coach on small screens
- Desktop keeps the full sticky action stack
- No nested sticky/fixed stacks under the UX3 nav

---

## 5. Inquiry queue changes

- Clearer assignment badges (assigned vs unassigned)
- Next-action hint on each row
- HOLD expiry wording cleaned up
- Same query/assignment semantics

---

## 6. Inquiry detail changes

- Readiness moved under the coach (still server-rendered via `readinessSection` slot)
- Coach links to `#hold-readiness`, `#confirmation-readiness`, `#availability-resources`, `#working-plan`
- Stale HOLD warning remains advisory with `role="status"`

---

## 7. Planner presentation changes

- Card surface + scroll margin
- Explicit copy: save recalculates but **does not reserve**
- Field names/actions unchanged

---

## 8. Proposal / HOLD presentation

- Active HOLD lists resources + expiry
- Expired HOLD callout
- Stale coverage warning when plan diverges from HOLD
- Purpose badges on readiness cards

---

## 9. Booking list / detail

- Shared Button styles for filters/actions
- `aria-current` on active filter
- Financial amounts labeled as preview / not collected
- Detail uses page title tokens

---

## 10. Schedule accessibility

`ScheduleCreateEventDialog`:

- Focus moves to Close on open
- Prior focus restored on close
- Existing `aria-labelledby` / `aria-describedby` / Escape path retained
- Larger Close touch target

No schedule engine changes.

---

## 11. Files changed (primary)

- `src/lib/inquiries/live-agent-next-step.ts`
- `src/components/layout/live-agent-booking-actions.tsx`
- `src/components/layout/booking-readiness-card.tsx`
- `src/components/layout/hold-readiness-panel.tsx`
- `src/components/layout/confirmation-readiness-panel.tsx`
- `src/components/layout/live-agent-workspace.tsx`
- `src/app/app/inquiries/[id]/page.tsx`
- `src/components/layout/live-agent-inquiry-queue.tsx`
- `src/components/layout/agent-working-plan-form.tsx`
- `src/components/layout/employee-selected-plan-resource-check.tsx`
- `src/components/layout/booking-list.tsx`, `booking-detail.tsx`
- `src/components/layout/schedule-create-event-dialog.tsx`
- `src/styles/tokens.css`, `src/app/globals.css`
- `planning/architecture/ui-conventions.md`
- Tests: `booking-readiness-card`, coach/next-step updates, schedule a11y source test

---

## 12. Tests added / updated

- Coach step states (optional HOLD)
- Mobile action bar marker + coach landmark
- PLACE_HOLD vs CONFIRM_BOOKING presentation
- Active / expired HOLD display
- Payment-neutral confirmation panel
- Schedule dialog focus restore (source contract)
- Sticky / booking action bar tokens

---

## 13. Validation results

Recorded 2026-10-10:

- `corepack pnpm lint` — pass
- `corepack pnpm typecheck` — pass
- `corepack pnpm test:unit` — 105 files / 570 tests pass
- Focused SBF integration: not required (presentation-only; action wiring unchanged) — spot-check `staff-booking-journey` before merge still recommended
- `corepack pnpm build` — pass

Full integration: **not run**.

---

## 14. Browser verification status

**Static/code-based only.** No authenticated browser screenshots in UX4.

Verified by construction: bottom-safe action bar CSS, header/mobile offsets, purpose-separated readiness, coach links.

Not verified visually at 320–1440 in a real browser.

---

## 15. Remaining limitations

- Mobile bar shows one primary control; secondary actions require scrolling the coach
- Schedule board mobile agenda not redesigned beyond dialog a11y
- Dual Place HOLD entry points (readiness panel + resource check) remain by product choice
- Contrast not instrumented with a meter

---

## 16. UX5 handoff

1. Customer intake / proposal polish can reuse BookingReadinessCard patterns only for staff-facing mirrors — do not expose HOLD exceptions publicly.
2. Keep `--booking-action-bar-offset` when adding any future sticky customer CTAs.
3. Do not fold HOLD + confirm into one server readiness function.
4. Playwright smoke for coach + mobile bar belongs in UX7.
