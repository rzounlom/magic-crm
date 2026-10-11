# R1 — Release Readiness Verification

**Status:** Engineering verification phase complete with evidence-based gates.  
**Not a production-readiness approval. Do not deploy from this document alone.**  
**STOP after R1.**

---

## 1. Test environment isolation proof

| Check | Result |
|---|---|
| `MAGICCRM_DATABASE_ROLE` | `test` (from `.env.test`) |
| TEST host | `ep-sparkling-bird-avsqbixx-pooler…` (Neon TEST branch) |
| DEV host | `ep-bold-art-avjy5nt4-pooler…` |
| Hosts differ | **Yes** |
| PROD targeted | **No** |
| Loader guard | `scripts/load-test-env.mjs` refuses role≠test and TEST≡DEV identity |
| Cleanup guard | `assertTestDatabaseClient` + organization-id safety regex |

Every focused/full integration invocation logged:

`[magiccrm] test database role=test host=ep-sparkling-bird-…; development host=ep-bold-art-…`

Browser public smoke uses local `next dev` against the **DEV** app database (nonproduction). Proposal browser fixture script refuses TEST role and non-DEV hosts.

---

## 2. Integration timeout root causes

### Measured latency (Neon TEST, 2026-10-10)

| Signal | Value |
|---|---|
| `SELECT 1` median | **108 ms** |
| `SELECT 1` max (cold) | **429–667 ms** |
| Provision 2 orgs | **~7.9 s** |
| Legacy cleanup (41 sequential `deleteMany`) | **~4.7 s** warm; estimated **>10 s** cold |
| Vitest default `hookTimeout` | **10 s** (was exceeded by cold cleanup) |
| Config `testTimeout` (pre-R1) | **20 s** |

**Root cause (security-groups / UX9):** not domain assertion failures. Neon HTTP RTT × many sequential cleanup queries caused `afterEach` `hookTimeout` and occasional test timeouts. Not treated as application deadlocks.

---

## 3. Fixes made

| Fix | Intent |
|---|---|
| `deleteTestOrganizations` → single SQL `DO` block | Pay Neon RTT once; cleanup **4.7 s → 261 ms** |
| `vitest.integration.config.mts` `testTimeout: 45s`, `hookTimeout: 30s` | Bound hangs above measured warm ops; documented evidence |
| Hours-exception test fixtures | Operating-hours guards correctly block confirm/HOLD without exception; tests updated to authorize via server fingerprint (no guard weakening) |
| `confirmHeldBooking` forwards `hoursExceptionId` | Bug fix — wrapper previously dropped the parameter |
| Proposal browser fixture script + e2e valid-token test | Safe nonproduction `/plan` coverage |
| Staff routes smoke spec | Ready when Clerk storage state exists |
| Gitignore `playwright/.fixtures/` | Never commit tokens |

**Not changed:** pricing, HOLD/confirm product semantics, authz, tax, payments, marketing homepage (UX10 untouched).

---

## 4. Focused integration results

| Suite | Status | Tests | Duration / notes |
|---|---|---|---|
| Security groups | **PASSED** | 18/18 | 144 s standalone |
| Team invitations | **PASSED** | 24/24 | in 793 s batch with peers |
| Public inquiry write boundary | **PASSED** | 1/1 | |
| Tenant isolation | **PASSED** | 6/6 | |
| Booking transaction safety | **PASSED** | 8/8 | |
| Staff HOLD operations | **PASSED** | 4/4 | |
| Operating-hours guards | **PASSED** | 5/5 | |
| Resource schedule | **PASSED** | 3/3 | |
| Staff booking journey | **PASSED** | 7/7 | |
| Booking cancel / archive | **PASSED** | 10/10 | after hours-fixture update |
| Booking confirmation | **PASSED** | 8/8 | after hours-fixture update |
| Pending bookings | **PASSED** | 8/8 | |
| Segment scheduling | **PASSED** | 9/9 | |
| Proposal token fixture (TEST) | **PASSED** | 1/1 | tenant bind + invalid token + payment-neutral |
| Live-agent workspace | **PASSED** | 3/3 | after HOLD hours fixture |
| Resource management | **PASSED** | 2/2 | after HOLD hours fixture |
| Phase 3B holds | **PASSED** | 10/10 | after HOLD/confirm hours fixtures |
| Catalog resource allocation | **PASSED** | (suite) | after confirm hours fixture |
| Schedule-native booking | **FAILED** | 0/1 | `PLAN_NOT_FOUND` in `savePendingEmployeeBooking` — manual inquiry has no working/selected plan; **not** an hours-guard issue |

Focused batch (9 primary suites after security-groups): **58/58 PASSED** in **793 s** before later hours-fixture expansions.

---

## 5. Full integration results

| Item | Status |
|---|---|
| Full `pnpm test:integration` | **NOT COMPLETED as green** |
| Isolation during run | Confirmed TEST host each file |
| Approach | Diagnose & fix hours-fixture + cleanup gaps; do not raise timeouts to hide domain failures |

### Known remaining failures (characterized)

| Suite | Failure | Classification |
|---|---|---|
| `schedule-native-booking` | `PLAN_NOT_FOUND` in `savePendingEmployeeBooking` after catalog import + sales-knowledge seed | Employee manual inquiry did not leave a working/selected plan usable for pending save — needs product/test follow-up |
| `catalog-composition` | `estimatedTotalCents` expected `101500` got `123000` | Assertion drift vs catalog pricing — **not** hours/cleanup |
| `proposal-nearby-search` | `INVALID_INTAKE` “Choose at least one attraction” | Test intake missing explicit attractions required by recommendation profile |

Hours-related booking/HOLD suites that previously failed under operating-hours guards were fixed and re-verified green (see §4).

---

## 6. Clerk TEST setup status

| Item | Status |
|---|---|
| Dedicated Clerk TEST identity | **BLOCKED** — requires human |
| Dedicated nonproduction org | **BLOCKED** — requires human |
| `playwright/.auth/staff.json` | **Absent** |
| `PLAYWRIGHT_STORAGE_STATE` | **Unset** |
| Auth bypass | **Not used** |

### Exact human actions required

1. Create a dedicated Clerk **test** user (not a production operator).
2. Attach to a dedicated **nonproduction** organization.
3. Grant least privilege for the scenario (Front Desk vs Administrators as needed).
4. Sign in locally against the same Clerk app as `next dev`.
5. Export storage state (gitignored):

```bash
mkdir -p playwright/.auth
corepack pnpm exec playwright codegen "$PLAYWRIGHT_BASE_URL/app" \
  --save-storage=playwright/.auth/staff.json
export PLAYWRIGHT_STORAGE_STATE="$PWD/playwright/.auth/staff.json"
corepack pnpm exec playwright test tests/e2e/staff.smoke.spec.ts tests/e2e/staff.routes.smoke.spec.ts
```

---

## 7. Staff browser results

| Item | Status |
|---|---|
| Staff smoke / routes specs | **BLOCKED** — 18 skipped without storage state |
| Employee shell / Booking Coach / schedule screenshots | **NOT RUN** |
| Permission-aware visibility | **NOT RUN** |

---

## 8. Proposal fixture results

| Check | Status |
|---|---|
| TEST service fixture (`proposal-token-fixture.test.ts`) | **PASSED** |
| DEV browser fixture script | **PASSED** (`scripts/r1-create-proposal-browser-fixture.ts`) |
| Org | `magiccrm-test-center-b` (nonproduction DEV) |
| Plans generated | 3 (seeded fixture attractions when catalog empty) |
| Invalid token | Covered by existing smoke + TEST fixture |
| Payment-neutral copy | **PASSED** (e2e asserts no pay-now/stripe/card) |
| Valid-token Playwright | **PASSED** (desktop + mobile) |
| Evidence screenshots | `docs/release/r1-evidence/proposal-1440.png`, `proposal-390.png` |
| Token storage | `playwright/.fixtures/proposal.json` (**gitignored**) |

UX10 homepage **not** modified to consume these assets.

---

## 9. Screenshot provenance and sanitized asset inventory

| Asset | Provenance | Notes |
|---|---|---|
| `docs/release/r1-evidence/proposal-*.png` | Live `/plan/{token}` from DEV fixture | Synthetic `r1-fixture+…@example.com`; no staff session; no tokens in image chrome |
| Staff marketing screenshots | **NOT RUN** | Auth blocked |
| UX10 intake assets | Unchanged from UX10 | Still authentic public intake |

---

## 10. Accessibility findings

| Surface | Status |
|---|---|
| Marketing `/` axe critical/serious | **PASSED** (public e2e) |
| Public intake axe | **PASSED** |
| Valid proposal page | Smoke assertions only (no axe gate added) |
| Staff keyboard / dialogs | **BLOCKED** (auth) |
| Manual SR pass | **NOT RUN** |
| Lighthouse a11y (home / intake) | **100 / 100** (see §11; against `next dev`) |

---

## 11. Performance measurements

Measured with Lighthouse 13.5 against **local `next dev`** (not production build). Scores are diagnostic only.

| Page | Perf | A11y | Best practices | SEO | FCP | LCP |
|---|---|---|---|---|---|---|
| `/` | **51** | **100** | **77** | **63** | 2.5 s | 10.0 s |
| `/inquire/magiccrm-test-center-b` | **56** | **100** | — | — | 2.0 s | 9.5 s |

Raw JSON: `docs/release/r1-evidence/lighthouse-*.json`.

Re-measure against `next start` / deployed preview before treating as a release gate.

---

## 12. Remaining blockers

1. **Clerk TEST storage state** — staff browser + authentic staff marketing screenshots  
2. **Full integration green** — schedule-native, catalog-composition price drift, proposal-nearby attraction intake  
3. **Manual accessibility** beyond axe  
4. **Lighthouse on production-like build** (dev-server LCP ~10s is not a ship metric)  
5. Privacy/terms pages and sales lead-capture (prelaunch product, not R1 defects)  
6. Neon TEST cold RTT remains inherent; cleanup no longer amplifies it into hook timeouts  

---

## 13. Exact human actions required

1. Produce `PLAYWRIGHT_STORAGE_STATE` per §6.  
2. After auth exists: run staff e2e; capture sanitized staff screenshots into `docs/release/r1-evidence/staff-*`.  
3. Investigate `schedule-native-booking` — ensure employee manual inquiry creates/selects a working plan before `savePendingEmployeeBooking`.  
4. Re-run full `pnpm test:integration` to green.  
5. Optional: Lighthouse against `next start`.  

---

## 14. Production-readiness verdict

| Gate | Verdict |
|---|---|
| TEST isolation | **PASSED** |
| Security-groups reliability | **PASSED** (root cause fixed; suite green) |
| Focused integration (named R1 suites) | **PASSED** (except schedule-native noted above) |
| Full integration | **NOT COMPLETED** (not green) |
| Authenticated staff browser | **BLOCKED** |
| Proposal fixture | **PASSED** |
| Public Playwright | **PASSED** (48/48 with valid plan token) |
| Unit / lint / typecheck / build | **PASSED** |
| **Ship to production** | **NO** |

**Verdict:** R1 substantially improved integration reliability and closed the proposal-browser gap. Production remains blocked on Clerk staff auth, a fully green integration suite, and production-like performance/a11y sign-off.

**STOP.** Do not begin another phase automatically.
