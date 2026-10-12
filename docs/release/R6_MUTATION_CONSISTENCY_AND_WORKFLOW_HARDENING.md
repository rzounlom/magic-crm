# R6 — Mutation Consistency, Workflow Clarity & Booking UX Hardening

**Status:** Soft-refresh mutation consistency fixed; HOLD/confirm/release/cancel lifecycle verified without hard reload; primary HOLD action consolidated; responsive evidence captured.  
**Not a production-readiness approval. Do not deploy from this document alone.**  
**STOP after R6.**

---

## 1. Root cause of stale post-mutation UI

Two independent defects caused R5 Playwright to require hard navigation after mutations:

### 1A — Cache revalidation no-op on dynamic inquiry routes (Next.js 16)

`revalidatePath("/app/inquiries/[id]")` (and similar dynamic segments) **without** a second `type` argument is a **no-op** in Next.js 16. Booking mutations therefore left RSC caches stale.

**Fix:** `src/server/actions/revalidate-booking-workspace.ts` centralizes:

- `revalidatePath(…, "page")` for schedule, inquiries, bookings, and the specific inquiry/booking ids
- `refresh()` from `next/cache` so the Server Action response updates the client router (read-your-own-writes)

Staff mutation actions (live-agent, bookings, hours-exceptions, resource-schedule) call this helper. Client `SecurityActionForm` **awaits** `router.refresh()` after successful mutations that request refresh.

### 1B — React 19 form `action` dispatch broken after soft remount

After **Check Availability** (which remounts large parts of the inquiry tree via soft refresh), Place HOLD / Confirm booking could not open their confirm dialogs:

- Native `requestSubmit` / click fired submit events with `defaultPrevented: false`
- React fiber still exposed `props.action` as a function
- Calling that function **directly** opened the dialog — only progressive-enhancement submit dispatch was dead

**Fix:** `SecurityActionForm` now uses explicit `onSubmit` + `preventDefault` + `FormData`, instead of the React 19 form `action` prop. Confirm dialogs and mutations work after Start Working → Check Availability without hard reload.

**Not used:** polling loops, arbitrary sleeps, or weakened transactional availability checks.

---

## 2. Before / after workflow explanation

| Step | Before R6 | After R6 |
|---|---|---|
| Start Working | Soft refresh often lagged; e2e hard-reloaded | Assignment UI updates via awaited refresh |
| Check Availability | Soft refresh OK for status text; broke subsequent HOLD/Confirm dialogs | Status updates; HOLD/Confirm dialogs open on soft-remounted forms |
| Place HOLD | Needed hard reload to see Active HOLD | Active status + expiry appear after soft refresh; reload kept as extra evidence only |
| Confirm booking | Needed hard reload / navigation luck | Redirects to booking detail; schedule + queue assertions without hard reload on the mutation itself |
| Release HOLD | Fragile after remount | Works via same `onSubmit` path |
| Cancel booking | Not covered in R5 lifecycle | Soft-refresh cancel covered when control is available |

---

## 3. Explicit claim / HOLD / confirm business rules

Audited against server services (no invented domain rules):

| Action | Server rule | UI |
|---|---|---|
| **Start Working (claim)** | Assigns `assignedUserProfileId`; required before editing the working plan toward confirmation | Primary coach CTA when unassigned |
| **Edit working plan** | Requires assigned agent (claim path) | Plan editors gated by assignment |
| **Check Availability** | Validates plan resources; does not place HOLD or book | Availability section; sets `availabilityChecked` for coach |
| **Place HOLD** | `placeProposalHold` does **not** require assignment — unassigned HOLD is intentional | Single primary control at `#hold-readiness` (`data-primary-hold-action`). Unassigned note explains HOLD may proceed without claim; confirmation still requires Start Working |
| **Confirm booking** | UI requires assignment + confirmation readiness (`confirmAttemptAllowed`); transactional availability recheck unchanged | Distinct **Confirm booking** control; coach disables until prerequisites met |
| **Release HOLD** | `releaseInquiryHoldsAction` when holds exist + permission | Availability “Active HOLD” section (“Release hold”) |
| **Cancel booking** | Permission-gated cancel on booked/pending | Inquiry coach + booking detail |

Coach copy when unassigned and HOLD-ready: claim is required to edit/confirm; optional proposal HOLD can still be placed from HOLD readiness without claiming.

---

## 4. Primary HOLD action (no competing mutation controls)

| Viewport / section | Behavior |
|---|---|
| `#hold-readiness` | **Only** Place HOLD mutation control (`data-primary-hold-action`) |
| `#availability-resources` | Links/scrolls to `#hold-readiness` — no Place HOLD button |
| Booking coach | Secondary links to HOLD readiness; Confirm remains distinct |

Accessible labels, disabled states, and confirm dialogs preserved.

---

## 5. Mutation state consistency evidence

| Scenario | Soft refresh (no hard reload) | Extra persisted check |
|---|---|---|
| Place HOLD | Toast “Resources held”; readiness `Active (N resources)` + Expires | Reload + schedule HOLD occupancy |
| Release HOLD | “Holds released”; readiness returns to No active HOLD | — |
| Confirm booking | Toast + navigate to `/app/bookings/[id]` | Schedule Booked; inquiry email absent from queue |
| Duplicate Place HOLD click | At most one open confirm dialog | — |
| Cancel booking | “Booking cancelled”; cancelled copy on inquiry | — |
| Conflict after availability | **Not executed** — unsafe on shared disposable inventory without a second concurrent fixture | Annotated skip |
| Admin-denied Resources | Permission guidance (`data-permission-guidance`) | — |

Evidence screenshots: `docs/release/r6-evidence/lifecycle-hold-schedule-chromium-desktop.png`, `lifecycle-confirm-booking-chromium-desktop.png`.

---

## 6. Responsive action placement

Capture: `pnpm test:e2e:staff:r6-nav-evidence` → `docs/release/r6-evidence/nav/`.

| Viewport | Mobile nav | Overflow (shell) |
|---|---|---|
| 390px | `display: grid` | 0 |
| 768px | `display: grid` | 0 |
| 1024px | `display: none` | 0 |
| 1440px | `display: none` | 0 |

Files: `shell-{390,768,1024,1440}w.png`, `inquiry-{390,768,1024,1440}w.png`.

Playwright `@staff-responsive`: action bar vs bottom nav overlap assertion at 390px; readiness `max-width: 48rem` prevents ultra-wide disconnection; no horizontal overflow on shell.

---

## 7. Accessibility (modified inquiry surfaces)

| Fix | Detail |
|---|---|
| Helper text contrast | `text-foreground/55` → `text-muted-foreground` on working-plan / inquiry helper copy |
| Inline links | Underline + offset on coach / archive / booking identity links so axe `link-in-text-block` passes |

Staff axe (`@staff-a11y`): **2 passed** (`/app` + inquiry detail).

---

## 8. Exact validation results

| Suite | Result | Counts |
|---|---|---|
| Lint | **Pass** | 0 errors; 1 pre-existing unused-import warning in unrelated integration file |
| Typecheck | **Pass** | — |
| Unit | **Pass** | **117** files / **614** tests |
| Production build | **Pass** | Next.js 16.3.3 compile + static generation OK |
| Staff observation Playwright (`@staff`, exclude `@staff-lifecycle` and `@staff-a11y`, no mutation opt-in) | **Pass** | **23 passed**, 0 failed, 0 skipped |
| Staff axe (`@staff-a11y`) | **Pass** | **2 passed** |
| Staff lifecycle mutations (`PLAYWRIGHT_STAFF_MUTATIONS=1`) | **Pass** | **6 passed**, **1 skipped** (conflict-after-availability not safely runnable) |
| R6 nav evidence | **Pass** | 12 screenshots (shell + inquiry + hold-readiness crops) + manifest |
| Focused integration (`phase-3b-holds`, `staff-booking-journey`, `operating-hours-guards` on Neon TEST) | **Pass** | **3** files / **22** tests |

Lifecycle command:

```bash
export PLAYWRIGHT_STORAGE_STATE="$PWD/playwright/.auth/staff.json"
export PLAYWRIGHT_BASE_URL=http://localhost:3000
export PLAYWRIGHT_STAFF_MUTATIONS=1
corepack pnpm test:e2e:staff:r5-fixture
corepack pnpm test:e2e:staff:lifecycle
# → 6 passed, 1 skipped
```

Environment unchanged from R5: Clerk TEST keys, Neon DEV host `ep-bold-art-avjy5nt4` for browser path, disposable `magiccrm-test-center-b`, synthetic QA hours labeled, no payment behavior changes.

---

## 9. Remaining blockers / not executed

| Item | Status |
|---|---|
| Production deploy | **Out of scope** — STOP after R6 |
| Conflict-after-availability e2e | **Not executed** (shared inventory collision risk) |
| HOLD expiration clock e2e | Not automated (24h policy; release path covered instead) |
| Payment collection | Intentionally out of scope |
| Real-world venue hours | Synthetic QA hours only |
| Concurrent soft-refresh under heavy local `next build` | Confirm can stall if prod build saturates the same machine as `next dev` — not a product defect |

---

## 10. Production readiness recommendation

| Recommendation | Detail |
|---|---|
| **DEV/TEST staff lifecycle UX** | **Improved and verified** — mutations read their own writes without hard reload |
| **Production** | **Do not deploy** based on R6 alone |
| Carry-forward risk | Keep synthetic hours labeled; do not copy VERIFIED QA hours to live orgs |
| Next hardening candidates | Safe conflict-after-check fixture; HOLD expiry clock test; broader multi-viewport mutation matrix |

**STOP after R6. Do not deploy to production.**

---

## Concise outcome table

| Category | Items |
|---|---|
| **Fixed** | Dynamic `revalidatePath(..., "page")` + `refresh()`; `SecurityActionForm` `onSubmit` after RSC remount; single primary HOLD; unassigned HOLD explained; soft-refresh lifecycle e2e |
| **Verified** | HOLD, release, confirm, cancel, duplicate-click guard, schedule/queue consistency, responsive 390–1440, staff a11y on inquiry |
| **Not executed** | Conflict-after-availability automation; production deploy; payment; real hours ceremony |
| **Recommendation** | Do not deploy; R6 goals met for TEST/DEV staff mutation consistency |
