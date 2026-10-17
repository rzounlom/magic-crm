# R8 — Release Candidate Verification & Operational Readiness

**Status:** Verification complete — **STOP** (no production deploy).  
**Date:** 2026-10-17  
**Baseline commit:** `5cdcf20b0f0409293acd830072fadd2aad61f897` — `feat: enhance booking detail and inquiry workspace components`  
**Branch:** `main` (ahead of `origin/main` by 36 at baseline)  
**Working tree at baseline:** clean (R8 evidence + narrowly scoped test-date fix added during this phase)

**Recommendation:** **CONDITIONAL GO** as a release candidate for ops hardening — **NO-GO for production deployment** until the operational checklist and launch conditions below are satisfied.

---

## 1. Clean release baseline

| Check | Result | Evidence |
| --- | --- | --- |
| Git HEAD | `5cdcf20…` | `git rev-parse HEAD` |
| Secrets / auth / fixtures tracked | **None** | `.env`, `.env.test`, `playwright/.auth/`, `playwright/.fixtures/` gitignored; only `.env.example` / `.env.test.example` tracked |
| DEV vs TEST databases | **Separated** | DEV Neon `ep-bold-art-…`; TEST Neon `ep-sparkling-bird-…` + `MAGICCRM_DATABASE_ROLE=test`; distinct hostname hashes in `r8-evidence/db-separation.json`; integration loader prints both hosts |
| Production database | **Not used** | No production credentials exercised; no production data modified |
| Clerk TEST auth | **Verified** | `staff.meta.json`: `clerkPublishableKeyKind: "test"`, org `magiccrm-test-center-b`; `pnpm test:e2e:staff:auth:verify` → `ok: true` |
| Pre-existing lint warning | **Confirmed (1)** | `tests/integration/catalog-resource-allocation.test.ts:17` unused `authorizeHoldHoursForInquiry` |

### Known skips / quarantine (inventory, not new failures)

| Kind | Location | Reason |
| --- | --- | --- |
| Opt-in mutations | Staff hold/confirm/lifecycle/conflict | Require `PLAYWRIGHT_STAFF_MUTATIONS=1` |
| Auth/fixture gates | Most `@staff*` specs | Skip when storage state or fixture missing/expired |
| Intentional lifecycle skip | `staff.lifecycle.spec.ts` conflict-after-availability | Not safely automated on shared disposable inventory (covered by R7 exclusive suite instead) |
| Public env gates | Public intake/a11y/token | Skip without `PLAYWRIGHT_PUBLIC_ORG_SLUG` / plan token |
| Flaky under load | Staff nav `ERR_TIMED_OUT` once | Transient while server contended; **passed on immediate re-run** (3/3) |

No quarantined test suites found beyond the intentional opt-in / fixture gates above.

---

## 2. Regression matrix (exact commands & counts)

Durations are wall-clock for the recorded command. Pass/fail/skip are from tool output. Failing runs are not omitted.

### Lint

```bash
corepack pnpm lint
```

| Metric | Value |
| --- | --- |
| Duration | **17s** |
| Exit | **0** |
| Errors | **0** |
| Warnings | **1** (unused import in `catalog-resource-allocation.test.ts`) |
| Log | `docs/release/r8-evidence/lint.log` |

### Typecheck

```bash
corepack pnpm typecheck
```

| Metric | Value |
| --- | --- |
| Duration | **6s** |
| Exit | **0** |
| Log | `docs/release/r8-evidence/typecheck.log` |

### Unit tests

```bash
corepack pnpm test:unit
```

| Metric | Value |
| --- | --- |
| Duration | **23s** (vitest **21.10s**) |
| Exit | **0** |
| Files | **117 passed** |
| Tests | **614 passed** |
| Log | `docs/release/r8-evidence/unit.log` |

### Full integration suite

```bash
corepack pnpm test:integration
```

| Metric | Value |
| --- | --- |
| Duration | **820s** (vitest **817.32s**) |
| Isolation log | `role=test host=ep-sparkling-bird-…` ; development `ep-bold-art-…` |
| Initial result | **1 failed / 187 passed** (38 files: 1 failed / 37 passed) |
| Failure | `booking-confirmation.test.ts` — active inquiry list assertion after confirm |
| Root cause | Hardcoded event date `2026-10-15` became **historical** vs run date `2026-10-17`, so `inquiryListWhere` correctly excluded the BOOKED inquiry from the **active** queue (product behavior correct; test date debt) |
| Remediation (R8, test-only) | Future-relative `EVENT_DATE` in that file |
| Focused re-run | **8/8 passed** in **59s** (`r8-evidence/integration-booking-confirmation-rerun.log`) |
| Log | `docs/release/r8-evidence/integration.log` |

> Distinguishing: this was a **date-sensitive test failure**, not a newly introduced booking invariant break. Domain assertions before the queue check (BOOKED status, reservations, schedule, idempotent re-confirm) had already passed in the failing run.

### Production build

```bash
corepack pnpm build
```

| Metric | Value |
| --- | --- |
| Duration | **19s** |
| Exit | **0** |
| Notes | `metadataBase` warning for OG/Twitter resolution; build succeeded |
| Log | `docs/release/r8-evidence/build.log` |

### Public intake & proposal Playwright

Prerequisite: `pnpm exec playwright install chromium` (browsers missing in agent cache on first attempt — infrastructure, not product).

```bash
export PLAYWRIGHT_PUBLIC_ORG_SLUG=magiccrm-test-center-b
export PLAYWRIGHT_PUBLIC_PLAN_TOKEN=<from playwright/.fixtures/proposal.json publicToken>
corepack pnpm exec playwright test \
  tests/e2e/public-intake.smoke.spec.ts \
  tests/e2e/public-intake.journey.spec.ts \
  tests/e2e/public-token.smoke.spec.ts \
  tests/e2e/public-a11y.smoke.spec.ts \
  tests/e2e/marketing-home.spec.ts \
  tests/e2e/auth-transition.smoke.spec.ts \
  --project=chromium-desktop
```

| Metric | Value |
| --- | --- |
| Duration | **66s** (Playwright **1.1m**) |
| Exit | **0** |
| Result | **31 passed / 0 failed / 0 skipped** |
| Log | `docs/release/r8-evidence/e2e-public.log` |

### Authenticated staff observation Playwright

```bash
corepack pnpm exec playwright test --grep @staff --project=chromium-desktop \
  --grep-invert '@staff-lifecycle|@staff-conflict'
```

| Metric | Value |
| --- | --- |
| Duration | **102s** (Playwright **1.7m**) |
| Exit | **1** (initial) |
| Result | **21 passed / 2 failed / 2 skipped** |
| Failures | `staff.navigation` ×2 — `net::ERR_TIMED_OUT` to `/app` under load |
| Skips | Mutation-gated Scenario C/D (`PLAYWRIGHT_STAFF_MUTATIONS` unset) — **known** |
| Re-run | `staff.navigation.spec.ts` → **3 passed** in **9s** |
| Logs | `e2e-staff-observation.log`, `e2e-staff-nav-rerun.log` |

**Adjusted staff observation verdict after re-run:** navigation green; remaining skips are known opt-in mutation gates (lifecycle/conflict run separately).

### Staff lifecycle mutations

```bash
export PLAYWRIGHT_STAFF_MUTATIONS=1
corepack pnpm test:e2e:staff:lifecycle
```

| Metric | Value |
| --- | --- |
| Duration | **57s** (Playwright **55.1s**) |
| Exit | **0** |
| Result | **6 passed / 1 skipped** (intentional conflict-after-availability) |
| Log | `docs/release/r8-evidence/e2e-staff-lifecycle.log` |

### R7 conflict integration + browser

```bash
# Integration (Neon TEST)
node --input-type=module -e 'import { runWithTestEnv } from "./scripts/load-test-env.mjs"; runWithTestEnv("corepack",["pnpm","exec","vitest","run","--config","vitest.integration.config.mts","tests/integration/r7-stale-availability-conflict.test.ts"]);'

# Browser (Neon DEV + Clerk TEST)
corepack pnpm test:e2e:staff:r7-fixture
export PLAYWRIGHT_STAFF_MUTATIONS=1
corepack pnpm test:e2e:staff:r7-conflict
```

| Suite | Duration | Result |
| --- | --- | --- |
| Integration R7 conflict | **22s** | **2 passed** |
| Browser R7 conflict | **24s** | **1 passed** |
| Logs | `integration-r7-conflict.log`, `e2e-staff-conflict.log` |

### Staff accessibility

```bash
corepack pnpm exec playwright test --grep @staff-a11y --project=chromium-desktop
```

| Metric | Value |
| --- | --- |
| Duration | **10s** (Playwright **9.3s**) |
| Exit | **0** |
| Result | **2 passed** (`/app` + inquiry detail; no critical/serious axe) |
| Log | `docs/release/r8-evidence/e2e-staff-a11y.log` |

### Matrix rollup

| Suite | Pass | Fail | Skip | Notes |
| --- | --- | --- | --- | --- |
| Lint | ✓ | 0 err | 1 warn | Pre-existing |
| Typecheck | ✓ | | | |
| Unit | 614 | 0 | 0 | |
| Integration (full) | 187 | 1 | 0 | Date-sensitive test; fixed + 8/8 re-run |
| Build | ✓ | | | |
| Public e2e | 31 | 0 | 0 | Desktop |
| Staff observation | 21 (+3 nav re-run) | 2 transient | 2 known | |
| Lifecycle | 6 | 0 | 1 known | |
| R7 conflict int+e2e | 3 | 0 | 0 | |
| Staff a11y | 2 | 0 | 0 | |

---

## 3. Mutation responsiveness

Instrument: `scripts/r8-measure-mutation-latency.mjs`  
Environment: uncontended local `pnpm dev` + Clerk TEST storage  
Evidence: `docs/release/r8-evidence/mutation-latency-combined.json` (2 runs)

| Mutation | Samples | Median | Worst | Hard reload required? |
| --- | --- | --- | --- | --- |
| Start Working | 4 | **2353 ms** | 2392 ms | **No** |
| Check Availability | 4 | *17.5 ms* | 20 ms | **No** (see caveat) |
| Place HOLD | 4 | **4858 ms** | 5856 ms | **No** |
| Release HOLD | 4 | **1611 ms** | 3392 ms | **No** |
| Confirm booking | 2 | **5000 ms** | 5234 ms | **No** |
| Cancel booking | 2 | **1078 ms** | 1328 ms | **No** |

**Caveats**

- Check Availability sub-50 ms samples almost certainly matched **pre-existing** “Available” copy; treat as **under-measured**, not a ~20 ms product win.
- Place HOLD / Confirm ~5 s median is the material latency to investigate next (server action + RSC refresh path), without adding sleeps/polling workarounds.
- Lifecycle e2e independently confirmed UI updates without hard reload.

---

## 4. Critical domain invariants

| Invariant | Coverage evidence | R8 verdict |
| --- | --- | --- |
| Tenant isolation | `catalog-tenant-isolation`, `tenant-isolation`, cross-tenant deny in `staff-booking-journey` | **Covered** |
| Server-side permissions | Integration + lifecycle admin-denied routes; TEST staff cannot manage inventory/team/security groups | **Covered** |
| HOLD vs confirmed booking | HOLD readiness states; `BOOKED_CANNOT_RELEASE`; lifecycle + R7 | **Covered** |
| Transactional resource allocation | `booking-transaction-safety`, confirmation rollback test | **Covered** |
| Stale availability conflicts | R7 integration **2/2** + browser **1/1** | **Covered** |
| Idempotency / duplicate submit | Duplicate confirm in booking-confirmation; duplicate Place HOLD e2e; concurrent confirm race | **Covered** |
| Cancellation resource release | Lifecycle cancel e2e; cancel/archive integration | **Covered** |
| Expired HOLD treatment | `resource-schedule` expired holds as available | **Covered** |
| Time zone / operating hours | `operating-hours-guards`, `location-timezone-scheduling` | **Covered** |
| Deterministic pricing | Unit price/tier tests; staff journey `pricingComplete` | **Covered** |
| No implied payment collection | Public token e2e payment-neutral; proposal fixture integration; Stripe unset | **Covered / unsupported by design** |

**Narrow test change during R8:** only the date-sensitive `booking-confirmation` fixture dates — no business-rule changes.

**Coverage gaps (not blocking RC, track as debt):**

- Browser automation of “conflict after successful Check Availability on shared bowling inventory” remains intentionally skipped (R7 exclusive suite covers the safety property).
- Broader sweep of hardcoded past `preferredDate` values in other integration files (same class of date debt).

---

## 5. Manual release-candidate UX audit

Script: `scripts/r8-capture-rc-ux-evidence.mjs`  
Artifacts: `docs/release/r8-evidence/ux/` (**44** screenshots, `manifest.json`)  
Viewports: **390 / 768 / 1024 / 1440**  
Org: `magiccrm-test-center-b` (Clerk TEST)

| Surface | Functional blockers | Visual polish |
| --- | --- | --- |
| Public inquiry | None observed | — |
| Public proposal | None observed (payment-neutral) | — |
| Sign-in / workspace transition | None (auth1 suite green) | Clerk structural CSS pin console warning |
| Inquiry queue / detail | None | Dense stack of readiness cards on 390w |
| HOLD workflow | Place HOLD reachable without claim | — |
| Confirmed / booking detail | Lifecycle confirmed path green | — |
| Master Schedule | Loads; HOLD/Booked filters present | — |
| Mobile navigation | Present (`More` + bottom bar) | Dark circular FAB / overlay can obscure Inquiries tab (**P2**) |
| Horizontal overflow | **0 px** across captured inventory | — |

Screenshots for material polish: `staff-shell-390w.png`, `inquiry-detail-390w.png`, `master-schedule-390w.png`.

---

## 6. Operational launch checklist

| Item | Status | Notes |
| --- | --- | --- |
| Required env vars | **Template verified** | `.env.example`: `DATABASE_URL`, `DIRECT_URL`, `APP_URL`, Clerk keys; Stripe/QStash marked not configured |
| TEST env vars | **Template verified** | `.env.test.example`: `MAGICCRM_DATABASE_ROLE=test`, dedicated DB URLs |
| Database migrations | **Not re-run against production** | Local/TEST/DEV only in R8 — run `prisma migrate deploy` on target before launch |
| Clerk organization configuration | **TEST verified** | LIVE org + roles **not** verified in R8 |
| Venue catalog setup | **TEST/DEV disposable only** | Must configure real venue catalog for live tenants |
| Resource capacity setup | **TEST/DEV disposable only** | Do not reuse R5/R7 synthetic inventory as production truth |
| Operating hours | **Synthetic QA hours in TEST/DEV** | **Never copy synthetic QA operating hours into a live venue** |
| Staff roles & permissions | **TEST staff verified** | Confirm LIVE memberships/groups before launch |
| Error logging & monitoring | **Not verified** | Need production log sink / alerting ownership |
| Backup & rollback | **Not verified** | Neon branch/backup + deploy rollback plan required |
| Support / incident response | **Not verified** | On-call path + runbooks required |
| Payment collection | **Unsupported** | No Stripe capture; external payment attestation only where modeled — do not imply card processing |

---

## 7. Unresolved issues (severity)

### P0 — launch blockers

*None found in executable product evidence during R8.*

### P1 — must resolve before confident production launch

1. **Operational readiness gaps** — production migrations, LIVE Clerk, real hours/catalog/capacity, monitoring, backup/rollback, support path unverified.
2. **Mutation latency** — Place HOLD / Confirm ~5 s median to visible update (soft refresh works; still material for front-desk UX).
3. **Date-sensitive integration fixtures** — class of hardcoded past event dates; one file fixed in R8; sweep remaining files.
4. **Payment collection unsupported** — explicit launch messaging / sales process required so staff do not imply in-app payment.

### P2 — polish / debt

1. Mobile FAB/overlay obscuring bottom **Inquiries** control (`*-390w` staff screenshots).
2. Pre-existing lint unused-import warning.
3. Build `metadataBase` warning; Clerk structural CSS pin warning.
4. Staff nav timeout flake under concurrent load.
5. Check Availability latency instrumentation under-measured.

---

## 8. GO / CONDITIONAL GO / NO-GO

| Scope | Verdict |
| --- | --- |
| Production deploy | **NO-GO** (mission STOP; ops checklist incomplete; payments unsupported) |
| Release candidate for next hardening phase | **CONDITIONAL GO** |

Conditions for upgrading to GO:

1. Complete §6 operational checklist on the **live** tenant (real hours — never synthetic QA hours).
2. Accept or improve HOLD/Confirm mutation latency with measured evidence.
3. Sweep remaining date-sensitive integration fixtures.
4. Explicit launch stance on unsupported payment collection.
5. Clean full integration suite on a green CI/agent run after (3).

---

## 9. Next actions (ordered by severity)

1. **Do not deploy to production.**
2. Complete production ops checklist (migrations, LIVE Clerk org/roles, real catalog/capacity/hours, monitoring, backup/rollback, support).
3. Investigate Place HOLD / Confirm ~5 s path (server action duration vs RSC refresh) with tracing — no artificial sleeps.
4. Sweep integration tests for hardcoded past `preferredDate` / slot dates; prefer relative future dates.
5. Fix mobile FAB/nav overlap before customer-facing staff rollout polish.
6. Clear unused-import lint warning when convenient.
7. Keep `PLAYWRIGHT_STAFF_MUTATIONS` lifecycle + R7 conflict in the pre-release gate.

---

## Evidence index

| Path | Contents |
| --- | --- |
| `docs/release/r8-evidence/lint.log` | Lint |
| `docs/release/r8-evidence/typecheck.log` | Typecheck |
| `docs/release/r8-evidence/unit.log` | Unit |
| `docs/release/r8-evidence/integration.log` | Full integration |
| `docs/release/r8-evidence/integration-booking-confirmation-rerun.log` | Post-fix focused file |
| `docs/release/r8-evidence/integration-r7-conflict.log` | R7 integration |
| `docs/release/r8-evidence/build.log` | Production build |
| `docs/release/r8-evidence/e2e-public.log` | Public Playwright |
| `docs/release/r8-evidence/e2e-staff-observation.log` | Staff observation |
| `docs/release/r8-evidence/e2e-staff-nav-rerun.log` | Nav re-run |
| `docs/release/r8-evidence/e2e-staff-lifecycle.log` | Lifecycle |
| `docs/release/r8-evidence/e2e-staff-conflict.log` | Conflict browser |
| `docs/release/r8-evidence/e2e-staff-a11y.log` | A11y |
| `docs/release/r8-evidence/mutation-latency-combined.json` | Latency samples |
| `docs/release/r8-evidence/ux/` | RC UX screenshots |
| `docs/release/r8-evidence/db-separation.json` | DEV≠TEST host fingerprints |

**R8 STOP.** No production deployment performed or recommended from this phase.
