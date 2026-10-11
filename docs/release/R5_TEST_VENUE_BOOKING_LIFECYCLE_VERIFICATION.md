# R5 — Isolated TEST Venue Readiness & Complete Booking Lifecycle Verification

**Status:** Synthetic TEST venue prepared; successful HOLD and booking confirmation verified with persisted state + schedule consistency.  
**Not a production-readiness approval. Do not deploy from this document alone.**  
**STOP after R5.**

---

## 1. TEST environment and tenant safety evidence

| Check | Evidence |
|---|---|
| Clerk keys | `playwright/.auth/staff.meta.json` → `clerkPublishableKeyKind: "test"`; bootstrap refuses `pk_live_` / `sk_live_` |
| Database | Neon **DEV** host fragment `ep-bold-art-avjy5nt4` (venue + lifecycle fixture scripts refuse other hosts) |
| `MAGICCRM_DATABASE_ROLE=test` | Venue/fixture scripts **refuse** this role (browser path uses DEV, not Neon TEST branch) |
| Organization | Disposable `magiccrm-test-center-b` — not a production tenant; not Generations-special-cased |
| Staff permissions | Authenticated TEST staff can manage inquiries / place HOLD / confirm events; **cannot** manage inventory, team, or security groups (intended) |
| Payments / messaging | Confirm path remains payment-neutral (no Stripe charge, no “payment received” copy); no customer mailer in confirm/HOLD actions |
| External side effects | Lifecycle mutations scoped to disposable synthetic inquiries (`r5-hold+…@example.com`, `r5-confirm+…@example.com`) |

**Tenant decision:** Reuse `magiccrm-test-center-b` with explicitly synthetic R5 inventory + hours rather than a second tenant. Isolation is by disposable fixtures + synthetic QA labeling, not by bypassing authorization or multi-tenant guards.

---

## 2. Synthetic inventory and operating-hours configuration

Prepared via `pnpm test:e2e:staff:r5-venue` → `scripts/r5-prepare-test-venue.ts` → `playwright/.fixtures/r5-venue.json` (gitignored metadata).

| Item | Configuration |
|---|---|
| Location / TZ | Main Location · **UTC** |
| Operating hours | Sun–Sat **08:00–22:00** local; `VERIFIED` |
| Hours note | `R5 synthetic QA operating hours — NOT real-world venue hours. Disposable TEST/DEV only.` |
| Resource types | Bowling Lane (4), Laser Arena (2), Party Room (2) — numbered units |
| Attractions | R5 Bowling, R5 Laser Tag, R5 Party Room linked to types |
| Fixtures | `pnpm test:e2e:staff:r5-fixture` creates separate HOLD + confirm inquiries with **unique preferred dates** (collision-safe) |

Synthetic hours are **not** represented as verified real-world venue hours. No live organization outside this disposable TEST/DEV tenant was modified.

---

## 3. Staff permission model

| Surface | Observed behavior | Disposition |
|---|---|---|
| `/app/admin/resources` | Permission denied for TEST staff role | **Intended** — inventory.manage required |
| `/app/admin/team`, `/app/admin/security-groups` | Permission denied | **Intended** |
| Schedule empty state (pre-inventory) | Linked “Configure resources” led to denial | **Improved** — without `inventory.manage`, copy asks for an authorized administrator |
| Booking coach “Set up inventory” | Previously linked to Resources without inventory permission | **Improved** — admin guidance instead of unauthorized control |
| SecurityStatusPanel | Generic denial only | **Improved** — role-appropriate guidance (`data-permission-guidance`) |

No elevated permissions were granted automatically. Navigation remains aligned with server authorization.

---

## 4. Successful HOLD evidence

| Step | Result |
|---|---|
| Opt-in | `PLAYWRIGHT_STAFF_MUTATIONS=1` + `pnpm test:e2e:staff:lifecycle` |
| Prep | Start Working → Check Availability → hard reload |
| Place HOLD | Real UI dialog → success toast “Resources held” |
| Persisted readiness | Hard nav shows `Active (N resources)`, Expires / 24-hour policy, **not** a confirmed booking |
| Schedule | Event day shows HOLD occupancy on Master Schedule |
| Screenshot | `docs/release/r5-evidence/lifecycle-hold-schedule-chromium-desktop.png` |
| Playwright | **Passed** — `places HOLD and verifies persisted HOLD state` |

---

## 5. Successful booking confirmation evidence

| Step | Result |
|---|---|
| Fixture | Separate confirm inquiry (distinct event date from HOLD) |
| Prep | Start Working → Check Availability → hard reload |
| Confirm booking | Real UI dialog → redirect to `/app/bookings/[id]` |
| Persisted booking | Booking detail shows confirmed booking identity (`MAG-…` / confirmed copy) |
| Payment status | Distinct — no “payment received / Stripe / charged” claims |
| Schedule | Confirm event day shows Booked occupancy |
| Inquiry queue | Confirmed inquiry email absent from active queue |
| Screenshot | `docs/release/r5-evidence/lifecycle-confirm-booking-chromium-desktop.png` |
| Playwright | **Passed** — `confirms booking and verifies booking detail + schedule occupancy` |

---

## 6. Persisted state and schedule consistency

| Assertion | HOLD path | Confirm path |
|---|---|---|
| Server toast / mutation result | Resources held | Booking confirmed |
| Readiness / booking UI after reload | Active HOLD resources + expiry | Booking detail route |
| Master Schedule | HOLD blocks on event day | Booked blocks on event day |
| HOLD ≠ confirmed booking | Asserted (no Open BK- / Booking confirmed on HOLD inquiry) | N/A |
| Purpose separation | `PLACE_HOLD` vs `CONFIRM_BOOKING` labels retained | Same |

---

## 7. Conflict and authorization test results

| Coverage | Result |
|---|---|
| Playwright purpose separation (guarded-failure) | **Passed** — PLACE_HOLD / CONFIRM_BOOKING stay distinct |
| Admin-denied Resources guidance | **Passed** (`@staff-lifecycle`) |
| Opt-in HOLD/confirm when guards block (legacy specs) | Still assert blocked guidance when mutations opted in without readiness |
| Integration: resource conflicts, hours exceptions, orphan occupancy | Covered by existing suites (`staff-booking-journey`, `operating-hours-guards`, `phase-3b-holds`) — see validation section for run counts |
| Cross-tenant / unauthorized mutation | Unchanged server `requirePermission` + tenant context; not weakened |
| Duplicate confirmation / stale availability | Existing transactional confirmation services unchanged |

Exception forms: collapsible `<details>` (`HoursExceptionSection`) — collapsed by default when no active exception; blockers remain visible; no server validation changes.

---

## 8. Updated screenshots (post R4 CSS fix)

Capture: `pnpm test:e2e:staff:r5-nav-evidence` → `docs/release/r5-evidence/nav/`.

| Viewport | Mobile nav (`[data-employee-mobile-nav]`) | Overflow |
|---|---|---|
| 390px | `display: grid` (visible) | 0 |
| 768px | `display: grid` (visible) | 0 |
| 1024px | `display: none` (hidden) | 0 |
| 1440px | `display: none` (hidden) | 0 |

Files: `shell-{390,768,1024,1440}w.png`, `inquiry-{390,768,1024,1440}w.png`, readiness crops. Desktop module nav present; booking mobile action bar not shown at ≥1024px.

Responsive Playwright (`@staff-responsive` including 1024px): **Passed**.

---

## 9. Unresolved blockers

| Item | Status |
|---|---|
| Production deploy | **Out of scope** — STOP after R5 |
| Payment collection | Intentionally not verified (product does not collect payment here) |
| Real-world venue hours | Not claimed — synthetic QA hours only |
| Neon TEST branch lifecycle | Not used for browser path (DEV host required) |
| Inventory admin as this staff user | Correctly denied; admin must configure venue |

---

## 10. Exact validation results

| Suite | Result | Counts |
|---|---|---|
| Lint | **Pass** (1 pre-existing unused-import warning in unrelated integration file) | 0 errors |
| Typecheck | **Pass** | — |
| Unit | **Pass** | **117** files / **611** tests |
| Production build | **Pass** | Compiled + static generation OK |
| Staff observation Playwright (`@staff`, exclude lifecycle, no mutations) | **Pass** | **23 passed**, **2 skipped** (mutation opt-in skips) |
| Staff lifecycle mutations (`PLAYWRIGHT_STAFF_MUTATIONS=1`, `@staff-lifecycle`) | **Pass** | **3 passed**, 0 failed, 0 skipped |
| Staff axe (`@staff-a11y`) | **Pass** | 2/2 in observation run |
| Focused integration (`staff-booking-journey`, `operating-hours-guards`, `phase-3b-holds`) | **Pass** | **3** files / **22** tests |

Lifecycle command:

```bash
export PLAYWRIGHT_STORAGE_STATE="$PWD/playwright/.auth/staff.json"
export PLAYWRIGHT_STAFF_MUTATIONS=1
corepack pnpm test:e2e:staff:lifecycle
# → 3 passed
```

---

## 11. Release recommendation

| Recommendation | Detail |
|---|---|
| **DEV/TEST lifecycle** | **Verified** for isolated disposable tenant with synthetic inventory + hours |
| **Production** | **Do not deploy** based on R5 alone |
| Next product risk | Keep synthetic hours clearly labeled; do not copy VERIFIED QA hours onto live orgs |
| Staff UX | Permission guidance shipped; exception forms collapsed until relevant |

**STOP after R5. Do not deploy to production.**

---

## Concise outcome table

| Category | Items |
|---|---|
| **Successfully verified lifecycle paths** | Place HOLD → persisted Active HOLD + schedule occupancy; Confirm booking → booking detail + schedule Booked + inquiry queue exit; purpose separation; payment-neutral confirm; nav breakpoints 390/768/1024/1440 after CSS fix |
| **Correctly blocked lifecycle paths** | Inventory/team/security-group admin for TEST staff role; confirm without Start Working / availability (coach disables Confirm); HOLD≠booking representation |
| **Tests not executed** | Production deploy; live payment provider; real-world hours verification ceremony; full multi-viewport mutation matrix beyond chromium-desktop lifecycle |
| **Remaining release risks** | Accumulated DEV HOLDs/bookings can saturate finite inventory if fixture dates collide (mitigated by unique dates); soft `router.refresh` lag requires hard reload in e2e; staff role still cannot self-serve inventory (by design) |
