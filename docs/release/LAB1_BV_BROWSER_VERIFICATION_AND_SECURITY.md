# LAB1-BV — Real Inquiry Browser Verification & Security Hardening

**Status:** Complete — **STOP** (no deploy; no LAB1-C).  
**Date:** 2026-10-17  
**Baseline:** LAB1-B dashboard + real inquiry staging  

---

## Executive answer

| Question | Result |
| --- | --- |
| Correlation-token security hardened? | **YES** — forged tokens can no longer suppress outbound plan notifications; claim/replay/prefill regressions covered |
| Live browser Scenario Lab walkthrough verified? | **NO — blocked** by missing dedicated Scenario Lab env configuration (see §3 and checklist) |
| Mobile auth-transition failure resolved? | **YES** — incorrect assertion for desktop-only brand text; **62/62** public Playwright passed |

---

## 1. Correlation-token security findings

### Audit path

`?lab=` → `loadPublicIntakePrefillForLabToken` → wizard hidden field → `publicIntakeSchema` → `createPublicInquiry` → claimable check → optional notification skip → `claimScenarioLabInquiryIfPresent` (transaction + `FOR UPDATE`).

### Findings

| Check | Pre-LAB1-BV | Post-LAB1-BV |
| --- | --- | --- |
| Invalid / forged token cannot claim | Pass (no matching run) | Pass |
| Consumed / completed token cannot claim | Pass (status gate) | Pass + replay integration test |
| Wrong-tenant token cannot claim | Pass (org-scoped lookup) | Pass |
| Token is not Scenario Lab admin auth | Pass (pages use `requireScenarioLabAccess`) | Pass |
| Public intake cannot read private run metadata | Pass (prefill returns synthetic answers only) | Pass + null-prefill test |
| **Forged token suppresses notifications** | **FAIL** — `Boolean(labCorrelationToken)` skipped plan email for any hex-shaped token | **FIXED** — skip only when `isClaimableScenarioLabCorrelationToken` is true |
| Replay cannot create dual ownership | Pass (unique + status) | Pass + explicit replay test |
| Claim failure consistency | Pass (single DB transaction) | Pass |
| Normal public inquiries unchanged | Pass when no token | Pass; forged token still gets normal `planUrl` audit metadata when `APP_URL` set |

### Trust model (unchanged intent, tightened enforcement)

The correlation token is a **limited-purpose capability** for synthetic prefill and post-create association within one tenant. It is **not** an administrator credential and must not alter normal customer side effects unless it matches a currently claimable READY/RUNNING run.

---

## 2. Fixes and regression tests

### Code fix

- `src/server/scenario-lab/claim-inquiry.ts` — added `isClaimableScenarioLabCorrelationToken`
- `src/server/services/inquiry-service.ts` — notification suppression and claim gated on claimable token only

### Tests added/updated

| Test | Coverage |
| --- | --- |
| `tests/unit/scenario-lab-claimable-token.test.ts` | Plausible / forged / already-owned / READY |
| `tests/integration/scenario-lab-inquiry-staging.test.ts` | Forged token keeps `planUrl` notification metadata; replay cannot claim second inquiry; invalid prefill returns null |
| `tests/e2e/auth-transition.smoke.spec.ts` | Mobile shell assertion uses home link + nav roles |
| `tests/e2e/scenario-lab.smoke.spec.ts` | Gated behind `SCENARIO_LAB_E2E=1` (skipped until env ready) |

---

## 3. Local browser environment used

**Not established.** Inspection of local env:

| Item | Status |
| --- | --- |
| Clerk TEST keys in `.env` | Present (`sk_test_` / `pk_test_`) |
| Neon DEV (`ep-bold-art-…`) | Present (day-to-day DEV — not labeled Scenario Lab) |
| Integration TEST (`ep-sparkling-bird-…`) | Present — **must not** be used for browser walks |
| Dedicated Scenario Lab Neon branch | **Not configured in workspace** |
| `SCENARIO_LAB_*` / deployment kind / DB token | **Unset** |
| DB identity sentinel provisioned for browser target | **No** |
| Allowlisted Clerk user/org IDs | **Not provided** (must not invent) |

Manual checklist: `docs/release/LAB1_BV_MANUAL_BROWSER_SETUP_CHECKLIST.md`

LAB1-A guards were **not** bypassed to force screenshots.

---

## 4. Actual browser walkthrough results

| Step | Result |
| --- | --- |
| Authorized admin opens `/scenario-lab` | **Not executed** (env blocker) |
| Create inquiry scenario → detail → public form → submit → link → staff workspace | **Not executed** |
| Desktop/mobile screenshots | **Not captured** |
| Negative browser cases (signed-out, wrong org, etc.) | **Not executed** in browser; covered by server/integration tests and skip-gated e2e scaffold |

Skip-gated Playwright file reports:

```text
tests/e2e/scenario-lab.smoke.spec.ts
2 skipped (SCENARIO_LAB_E2E≠1)
```

---

## 5. Screenshots

None. Blocked by missing Scenario Lab environment (see §3).

---

## 6. Mobile auth-transition resolution

**Root cause:** Test assertion bug, not a product regression.

- Header brand text `MagicCRM` uses `hidden sm:inline` (intentionally hidden on mobile).
- Assertion used `.getByText(/MagicCRM|…/)`, which matched the hidden span and failed `toBeVisible` on chromium-mobile.

**Fix:** Assert the always-available `MagicCRM home` link and `navigation` named `Modules` or `Primary`.

**Rerun:** Full `pnpm test:e2e:public` → **62 passed**, including the previously failing mobile auth-transition case.

---

## 7. Full validation matrix

| Check | Result |
| --- | --- |
| Lint | Pass (0 errors; 1 pre-existing warning) |
| Typecheck | Pass |
| Unit | **640 passed** |
| Scenario Lab integration | **20 passed** |
| Production build | Pass |
| Public Playwright | **62 passed** |
| Scenario Lab browser e2e | **2 skipped** (env not enabled) |
| Live Scenario Lab walkthrough | **Not executed** (blocker) |

Distinguish: skipped/unexecuted ≠ passed.

---

## 8. Remaining manual setup

Complete `docs/release/LAB1_BV_MANUAL_BROWSER_SETUP_CHECKLIST.md`, then:

```bash
SCENARIO_LAB_E2E=1 pnpm exec playwright test tests/e2e/scenario-lab.smoke.spec.ts
```

Expand that spec to the full 10-step walkthrough once the env and allowlisted auth fixture exist.

---

## 9. Readiness for LAB1-C

| Gate | Status |
| --- | --- |
| Correlation-token hardening | Ready |
| Public Playwright green | Ready |
| Live browser Scenario Lab proof | **Not ready** — blocked on dedicated DB + allowlist config |
| HOLD / Confirm / reset / automated verification | Out of scope (do not start) |

LAB1-C may proceed for **code design** of the next scenario only if the product owner accepts that hosted/live Scenario Lab browser proof remains outstanding. Otherwise, finish the manual checklist and re-run LAB1-BV browser steps first.

**STOP after LAB1-BV. Do not deploy. Do not start LAB1-C until requested.**
