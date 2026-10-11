# UX9 — Intake Refinement & Release Verification

**Status:** Track A intake refinements shipped; Track B verification diagnosed with evidence.  
**Do not claim production readiness based on UX9 alone.**  
**STOP after UX9.**

---

## 1. Intake defects investigated

| ID | Observation (UX8 screenshots) | Root cause |
|---|---|---|
| A1 | Full-width red-border **Start over** above questions on mobile | Header used `flex-col` so Start over spanned the row as a primary-looking control |
| A2 | “Empty bordered field” on Details under draft banner | Nested `overflow-y-auto` + tall **Review** block above contact clipped labels out of the scrollport; Playwright `fullPage` did not expand the nested scroller — looked like a mystery input. Legitimate empty optional fields existed below the fold |
| A3 | Fun step long vertical scroll | 1-column cards, 1rem gaps, long preference titles |
| A4 | Fixed 09:00–21:00 half-hour menu | Could block valid late-night / overnight preferred times; public catalog does **not** expose operating-hours policies |

---

## 2. Changes made and rationale

### A1 — Start over demoted
- Text-style secondary control beside progress (`text-muted-foreground`, underline on hover)
- Always horizontal alignment with progress (no full-width mobile row)
- Confirm dialog + draft clear preserved

### A2 — Details layout
- **Contact fields first**, then compact “Review your answers”
- Draft banner moved inside the scroll region with spacing + **Dismiss**
- Reset planner scroll to top on step change
- Notes field gets explicit `htmlFor` / `id`

### A3 — Fun compact
- `.choice-grid-compact` two-column short options from narrow widths
- Tighter preference-block spacing; shorter section titles/microcopy
- Activities remain scannable single-column on small screens

### A4 — Time menu
- Expanded preferred start times to **00:00–23:30** half-hours (venue-local wall clock)
- Copy clarifies preference ≠ availability
- Operating-hours–aware menus deferred (no public policy in catalog loader; do not invent approved hours)

---

## 3. Before / after screenshots

| | UX8 (`docs/design/ux8-screenshots/`) | UX9 (`docs/design/ux9-screenshots/`) |
|---|---|---|
| Event 390 | Full-width Start over | Start over text link beside progress |
| Details 390 | Draft + unlabeled empty box + Notes | Draft + labeled First/Last/Email/Phone |
| Fun / When / Validation / Draft | — | Captured in UX9 run |

Additional UX9 captures: `draft-restored-390.png`, `validation-390.png`, viewport matrix `event-{320…1440}.png`.

---

## 4. Time-choice policy findings

| Question | Finding |
|---|---|
| Does fixed 09–21 block valid requests? | **Yes** — overnight / late venues can prefer times outside that window; inquiry contract accepts any valid `HH:mm` |
| Can we build tenant-aware lists without schema changes? | **Not safely** — operating-hours policies exist for staff confirmation readiness, but `listPublicPlannerCatalog` does not expose them; seeding hours is out of scope |
| UX9 action | Full-day half-hour select; honest “not available/reserved” copy |
| Follow-up | Optional catalog field for public preferred-time windows once product defines policy |

---

## 5. Test cases added / updated

- Unit: Start over secondary styling; full-day time options; compact CSS contract
- E2E journey: scroll-to-top screenshots; draft/validation; contact-before-review assertion; late time `23:30`
- E2E axe: `tests/e2e/public-a11y.smoke.spec.ts` (critical/serious gate)
- `tests/e2e/README.md` — staff auth + proposal token human setup

---

## 6. Invitation failure root causes

Previously reported failures:

- `keeps queued groups until first provisioning…`
- `reconciles already-revoked and missing Clerk invitations…`

**UX9 re-run (isolated TEST DB `ep-sparkling-bird-…`):**

| Scope | Result | Duration |
|---|---|---|
| Those 2 tests only | **PASSED** (2/2) | ~38s |
| Full `team-invitations.test.ts` | **PASSED** (24/24) | **364s** |

**Conclusion:** No production domain defect found in this pass. Prior failures are consistent with **Neon TEST latency / flake under load**, not incorrect invitation semantics. Concurrent `applyPendingTeamInvitations` uses `FOR UPDATE` locking; revoke reconcile paths behave as tested. No domain change made solely to green tests.

---

## 7. Neon TEST performance diagnosis

Isolation confirmed every run:

`role=test` host `ep-sparkling-bird-…` ≠ development `ep-bold-art-…`.

Evidence:

| Signal | Value |
|---|---|
| `SELECT 1` ping samples | 627, 98, 100, 104, 96 ms (median **100**, max **627** cold) |
| `COUNT(*)` organizations | **83 ms** |
| Empty `BEGIN`/`SELECT`/`ROLLBACK` | **294 ms** |
| Invitation suite | 24 tests / **364s** ≈ **15.2 s/test** average |
| Two-test subset | ~38s |
| `public-inquiry-write-boundary` | 1 test / **16.5s** |
| `security-groups` | 2 failures: `afterEach` **hookTimeout 10s**, test **timeout 20s** — cleanup/fixture RTT, not assertion mismatches on permissions |

Interpretation: network/branch latency and cold starts dominate (multi-query fixtures × ~100ms RTT + occasional 600ms+ cold). Not treated as application deadlocks. **Did not** raise timeouts to hide the issue. **Did not** point tests at DEV/PROD.

---

## 8. Focused integration results

| Suite | Status | Duration / notes |
|---|---|---|
| Team invitations | **PASSED** | 24/24, 364s |
| Public inquiry write boundary | **PASSED** | 1/1, 16.5s |
| Security groups | **FAILED** (timeouts) | 2 timed out / 17 passed; hookTimeout during cleanup |
| Staff booking journey | **NOT RUN** | Focused suite unhealthy (security-groups timeouts) |
| HOLD / confirmation readiness | **NOT RUN** | Same gate |
| Tenant isolation / reservation conflict | **NOT RUN** | Same gate |

---

## 9. Full integration results

**NOT RUN** — focused suite not reliably green (security-groups latency timeouts). Per UX9 rules, full suite was not started blindly.

---

## 10. Staff authentication fixture status

**BLOCKED — external human setup required.**

Documented in `tests/e2e/README.md`:

1. Dedicated Clerk **test** identity  
2. Dedicated non-production tenant  
3. Least-privilege role for the scenario  
4. `playwright codegen --save-storage=playwright/.auth/staff.json`  
5. `export PLAYWRIGHT_STORAGE_STATE=…` (gitignored; never commit)

No storage-state file was present in this environment. Server authz is not bypassed.

---

## 11. Authenticated browser results

| Check | Status |
|---|---|
| Staff shell / More / Booking Coach / schedule | **BLOCKED** (no `PLAYWRIGHT_STORAGE_STATE`) |
| `tests/e2e/staff.smoke.spec.ts` | **SKIPPED** by design without auth |

---

## 12. Proposal fixture status

**BLOCKED — needs TEST-only opaque token.**

Invalid-token public smoke remains green. Optional `PLAYWRIGHT_PUBLIC_PLAN_TOKEN` workflow documented in `tests/e2e/README.md`. No booking confirmation or payment in smoke.

---

## 13. Axe results

| Check | Status |
|---|---|
| `/inquire/[slug]` critical/serious | **PASSED** (desktop + mobile) |

Not a full WCAG conformance claim. Manual keyboard / SR / contrast checks remain.

---

## 14. Files changed

- `src/components/layout/public-intake-wizard.tsx`
- `src/lib/event-planner/intake-journey.ts`
- `src/app/globals.css`
- `tests/unit/public-intake-wizard.test.tsx`
- `tests/unit/intake-journey.test.ts`
- `tests/e2e/public-intake.journey.spec.ts`
- `tests/e2e/public-a11y.smoke.spec.ts` *(new)*
- `tests/e2e/README.md`
- `package.json` (`test:e2e:public` includes axe)
- `docs/design/UX9_INTAKE_REFINEMENT_AND_RELEASE_VERIFICATION.md` *(new)*
- `docs/design/ux9-screenshots/*` *(generated)*

---

## 15. Outstanding release blockers

1. Neon TEST **latency** — security-groups (and similar) flake/timeout under default Vitest hook/test timeouts  
2. Authenticated staff Playwright storage state (human Clerk TEST setup)  
3. Safe valid proposal token fixture for `/plan` happy-path smoke  
4. Full integration suite not run while focused suites remain latency-unhealthy  
5. Manual a11y beyond axe still required  

---

## 16. Production-readiness assessment

**Not production-ready on UX9 alone.**

| Gate | Result |
|---|---|
| Intake visual refinements | Done |
| Public Playwright + axe | Green |
| Unit / lint / typecheck / build | Green |
| Invitation domain tests | Green this run (prior flake attributed to latency) |
| Focused integration overall | **Partial** — security-groups timeouts |
| Full integration | **Not run** |
| Staff browser | **Blocked** |
| Proposal happy-path browser | **Blocked** |

---

## Validation summary

| Check | Status |
|---|---|
| `corepack pnpm lint` | **PASSED** |
| `corepack pnpm typecheck` | **PASSED** |
| `corepack pnpm test:unit` | **PASSED** (599) |
| `corepack pnpm build` | **PASSED** |
| Public Playwright (intake + journey + token) | **PASSED** (28/28) |
| Public axe | **PASSED** (2/2) |
| Team invitations (focused) | **PASSED** |
| Public inquiry write boundary | **PASSED** |
| Security groups (focused) | **FAILED** (timeouts) |
| Full integration | **NOT RUN** |
| Staff Playwright | **BLOCKED** |
| Proposal fixture smoke | **BLOCKED** |

**STOP.** UX9 ends here.
