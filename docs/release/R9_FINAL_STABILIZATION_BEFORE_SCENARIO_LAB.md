# R9 — Final Stabilization Before Scenario Lab

**Status:** Complete — **STOP** (no production deploy; Scenario Lab not started).  
**Date:** 2026-10-17  
**Baseline (pre-R9 work):** R8 verification on `5cdcf20…` plus R8 test-date hygiene  
**Scope:** Performance, date-fixture debt, mobile nav obstruction, technical cleanup, full regression

**Readiness for private Scenario Lab:** **YES** — DEV/TEST foundation is stable enough to begin Scenario Lab construction.  
**Production launch readiness:** **NO** (unchanged from R8 — ops checklist, payments, LIVE Clerk still out of scope).

---

## 1. Files changed

### Product / config

| File | Change |
| --- | --- |
| `src/server/actions/revalidate-booking-workspace.ts` | Stop double client refresh; skip redundant `/app` layout invalidation |
| `src/server/actions/resource-schedule.ts` | Mutation timing for Place HOLD |
| `src/server/actions/bookings.ts` | Mutation timing for Confirm |
| `src/lib/observability/mutation-timing.ts` | Opt-in phase timing (`MAGICCRM_MUTATION_TIMING=1`) |
| `src/app/layout.tsx` | Set `metadataBase` from `APP_URL` |
| `next.config.ts` | `devIndicators: false` (DEV “N” overlay blocked mobile nav) |
| `playwright.config.ts` | `navigationTimeout` / `actionTimeout` for staff `/app` load |

### Tests / helpers / scripts

| File | Change |
| --- | --- |
| `tests/helpers/future-event-date.ts` | Shared future-relative / weekday helpers |
| Many `tests/integration/*.test.ts` | Replace brittle past calendar dates; weekday/DST-safe where required |
| `tests/integration/catalog-resource-allocation.test.ts` | Remove unused import |
| `tests/e2e/staff.navigation.spec.ts` | `waitUntil: "domcontentloaded"` |
| `tests/e2e/staff.smoke.spec.ts` / `staff.responsive.spec.ts` | Same + More-menu reliability |
| `tests/e2e/helpers/staff-mobile-nav.ts` | Scroll + force click for More |
| `scripts/r9-measure-mutation-latency.mjs` | Reliable completion signals (no pre-existing “Available” text) |
| `scripts/r9-capture-mobile-nav-evidence.mjs` | Responsive nav evidence |

### Evidence

`docs/release/r9-evidence/` — logs, latency JSON, UX screenshots.

---

## 2. Root causes identified

### HOLD / Confirm ~5 s (R8)

| Phase | Finding |
| --- | --- |
| Server action | Auth context ~70 ms; domain mutation ~1.6 s (Neon TEST/DEV); cache invalidation ~0 ms after fix |
| Double refresh | `revalidateBookingWorkspace` called `refresh()` **and** `SecurityActionForm` always awaited `router.refresh()` on success |
| Layout invalidation | Full `/app` layout revalidation on every mutation was redundant with page-scoped invalidation + client refresh |
| Remaining latency | ~1.5–2 s client RSC refresh after server returns — not safely removable without weakening read-your-own-writes |

### Date-sensitive failures

Hardcoded `2026-10-15` (and neighbors) became historical or landed on the wrong weekday/DST offset after wall-clock moved past mid-October 2026. Active-queue history filtering, Thursday promotions, and Indianapolis EDT `T22:00Z` assertions are weekday/DST sensitive.

### Mobile nav obstruction

The obstructing control was the **Next.js DEV “N” indicator**, not an app FAB. Bottom-left covered Inquiries; moving it to bottom-right covered More and prevented the More dialog from opening in Playwright. Fix: disable `devIndicators` in `next.config.ts` (production builds never show it).

### Staff nav timeouts

`page.goto(..., waitUntil: "load")` hung when Clerk/awareness kept the load event deferred. Mitigated with `domcontentloaded` + navigation timeout.

### Lint / metadataBase

Unused import in `catalog-resource-allocation.test.ts`. Build warned because `metadataBase` was unset — fixed via `APP_URL`.

### Clerk CSS warning

Structural CSS selectors against Clerk internals — not changed (would require `@clerk/ui` pin migration; not a Scenario Lab blocker).

---

## 3. Performance before and after

Completion signals: Place HOLD → `#hold-readiness` text `/^Active \(/`; Confirm → URL `/app/bookings/:id`.  
Hard reload: **never required**.

| Mutation | R8 median | R9 median | R9 worst | Samples |
| --- | --- | --- | --- | --- |
| Place HOLD | **4858 ms** | **3844 ms** | 4359 ms | 4 |
| Confirm booking | **5000 ms** | **3192 ms** | 3511 ms | 2 |

Evidence: `docs/release/r9-evidence/mutation-latency-combined.json`  
Server phases (sample Place HOLD): `auth_context=72`, `domain_mutation=1670`, `cache_invalidation=0`, `total=1742` ms — remainder is client RSC refresh.

**Substantial safe improvement achieved** (~1.0–1.8 s). Further gains would require Neon query path work or broader RSC payload reduction — out of R9 scope without risking allocation/permission semantics.

---

## 4. Exact validation results

### Lint

```bash
corepack pnpm lint
```

| Result | **0 errors, 0 warnings** | **16s** | Exit 0 |
| Log | `r9-evidence/lint.log` |

### Typecheck

```bash
corepack pnpm typecheck
```

| Result | Pass | **5s** | Exit 0 |

### Unit

```bash
corepack pnpm test:unit
```

| Result | **117 files / 614 tests passed** | **20s** | Exit 0 |

### Full integration (final green run — not a focused rerun)

```bash
corepack pnpm test:integration
```

| Result | **38 files / 188 tests passed** | **819s** | Exit 0 |
| Isolation | Neon TEST `ep-sparkling-bird-…` ≠ DEV `ep-bold-art-…` |

**First full run after date migration:** 6 failed (weekday/DST) → fixed → **second full run:** 1 failed (`booking-catalog` Saturday composition) → Thursday helper → **third full run: 188/188 PASS**.  
Focused reruns alone were **not** used as the final verdict.

### Production build

```bash
corepack pnpm build
```

| Result | Pass | **24s** | Exit 0 | No `metadataBase` warning |

### Public Playwright

```bash
# chromium-desktop public suite
```

| Result | **31 passed** | **62s** | Exit 0 |

### Authenticated staff observation

```bash
playwright test --grep @staff --project=chromium-desktop \
  --grep-invert '@staff-lifecycle|@staff-conflict'
```

| Final run (fresh staff fixture) | **25 passed / 0 failed / 0 skipped** | **67s** | Exit 0 |
| Earlier runs | Failures from DEV “N” overlay on More + stale fixture after lifecycle — **not** product regressions; distinguished below |

### Staff lifecycle mutations

| Result | **6 passed / 1 skipped** (intentional conflict-after-availability) | **60s** | Exit 0 |

### R7 conflict

| Integration | **2 passed** | **20s** |
| Browser | **1 passed** | **27s** |

### Staff accessibility

| Result | **2 passed** | **10s** | Exit 0 |

### Distinguishing first-run failures vs final

| Issue | First observation | Final |
| --- | --- | --- |
| Integration weekday/DST | 6 fail | Fixed; full suite green |
| booking-catalog Saturday | 1 fail | Thursday helper; full suite green |
| Staff More @ 390 | Fail with N overlay open | Pass after `devIndicators: false` |
| Staff fixture-dependent | Fail after r5 overwrite | Pass after `test:e2e:staff:fixture` |

---

## 5. Screenshots (responsive / nav)

`docs/release/r9-evidence/ux/`

| Viewport | Shell | Inquiry detail |
| --- | --- | --- |
| 390 | `staff-shell-390w.png` | `inquiry-detail-390w.png` |
| 768 | `staff-shell-768w.png` | `inquiry-detail-768w.png` |
| 1024 | `staff-shell-1024w.png` | `inquiry-detail-1024w.png` |
| 1440 | `staff-shell-1440w.png` | `inquiry-detail-1440w.png` |

Manifest: `overflowPx: 0` at all widths; `nextIndicatorPresent: false` at 390.  
Inquiries bottom-nav item is unobstructed; More opens in staff smoke/responsive tests.

---

## 6. Remaining known limitations

1. **Place HOLD / Confirm still ~3–4 s median** — dominated by Neon domain work + one client RSC refresh.
2. **Payment collection unsupported** — Scenario Lab must not imply card capture.
3. **Clerk structural CSS warning** — informational; not fixed in R9.
4. **Synthetic QA operating hours** — still TEST/DEV only; never copy to live venues.
5. **Intentional lifecycle skip** — conflict-after-availability on shared bowling inventory (covered by R7 exclusive suite).
6. **Overview content under bottom nav** — long overview can tuck under the bar (padding exists; polish only).

---

## 7. Readiness assessment

### Is MagicCRM’s existing DEV/TEST foundation stable enough to begin building the private Scenario Lab?

**YES.**

Evidence: clean lint/typecheck/unit; **full** integration green (188); public + staff observation + lifecycle + R7 conflict + a11y green; HOLD/Confirm faster without weakening transactions/permissions; mobile primary nav usable without DEV overlay interference.

### Explicit non-claims

- Not production GO.
- Not payment-ready.
- Not a LIVE-tenant ops certification.

---

## Next actions (after STOP)

1. Begin private Scenario Lab design/build on this DEV/TEST foundation.  
2. Track HOLD/Confirm Neon+RSC latency as a non-blocking Scenario Lab UX note.  
3. Keep R8 ops checklist for any future production path.

**R9 STOP.** No production deployment. Scenario Lab implementation not started in this phase.
