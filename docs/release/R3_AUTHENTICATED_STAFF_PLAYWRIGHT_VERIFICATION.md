# R3 — Authenticated Staff Playwright Verification & Visual Release Gate

**Status:** Infrastructure and scenarios delivered; authenticated execution **BLOCKED** on human Clerk TEST storage state.  
**Not a production-readiness approval. Do not deploy from this document alone.**  
**STOP after R3.**

---

## 1. Environment isolation evidence

| Check | Result |
|---|---|
| Local Clerk publishable key | **TEST** (`pk_test_`) |
| Local Clerk secret key | **TEST** (`sk_test_`) — LIVE keys refused by auth verify/bootstrap |
| App database host (browser fixtures) | Neon **DEV** `ep-bold-art-avjy5nt4…` |
| Integration TEST host (R2) | Neon **TEST** `ep-sparkling-bird…` (not used for browser fixtures) |
| PROD Clerk / PROD Neon / production tenants | **Not targeted** |
| Storage state path | `playwright/.auth/staff.json` (**gitignored**) |
| Fixture path | `playwright/.fixtures/staff-inquiry.json` (**gitignored**) |
| Auth bypass in browser path | **Not used** |

Staff browser fixtures refuse `MAGICCRM_DATABASE_ROLE=test` and non-DEV hosts (same safety pattern as R1 proposal fixture).

---

## 2. Clerk TEST setup and human prerequisites

### Why authenticated staff tests remain blocked

| Item | Status |
|---|---|
| `playwright/.auth/staff.json` | **Absent** |
| `pnpm test:e2e:staff:auth:verify` | **FAILED** (expected) — clear missing-state message |
| Human Clerk TEST user + org membership | **Required** — not inventable by the agent |
| Session fabrication / auth bypass | **Refused** |

Local Clerk is correctly configured as TEST, but no human has exported a storage-state session yet.

### Exact human checklist

1. Create a **dedicated Clerk TEST user** (not a production operator).
2. Attach to a **non-production** organization (recommended: `magiccrm-test-center-b` on DEV).
3. Grant least privilege for the scenario (Front Desk for Booking Coach; add `events.create` / `events.confirm` only when exercising HOLD/confirm mutations).
4. Start the app: `corepack pnpm dev` or `corepack pnpm build && PORT=3000 corepack pnpm start`.
5. Bootstrap:

```bash
export PLAYWRIGHT_BASE_URL=http://localhost:3000
export PLAYWRIGHT_STAFF_ORG_SLUG=magiccrm-test-center-b
corepack pnpm test:e2e:staff:auth
# Sign in in the headed window, confirm /app loads, then close codegen.
export PLAYWRIGHT_STORAGE_STATE="$PWD/playwright/.auth/staff.json"
corepack pnpm test:e2e:staff:auth:verify
git check-ignore -v playwright/.auth/staff.json
```

6. Create inquiry fixture (once per refresh cycle):

```bash
corepack pnpm test:e2e:staff:fixture
```

7. Run headed staff scenarios:

```bash
corepack pnpm test:e2e:staff:headed
```

---

## 3. Scenario matrix

| ID | Scenario | Spec / tag | Status (this R3 run) |
|---|---|---|---|
| A | Staff navigation & org context | `staff.navigation.spec.ts` `@staff-nav` | **BLOCKED** (no auth) |
| B | Inquiry review | `staff.inquiry-review.spec.ts` `@staff-inquiry` | **BLOCKED** (no auth; fixture ready) |
| C | Proposal / HOLD readiness (+ optional mutation) | `staff.hold-readiness.spec.ts` `@staff-hold` | **BLOCKED** (no auth; fixture ready) |
| D | Confirmation readiness (+ optional mutation) | `staff.confirmation.spec.ts` `@staff-confirm` | **BLOCKED** (no auth; fixture ready) |
| E | Guarded failure / blocker messaging | `staff.guarded-failure.spec.ts` `@staff-guard` | **BLOCKED** (no auth; fixture ready) |
| F | Responsive staff UX (390 / 768 / 1440) | `staff.responsive.spec.ts` `@staff-responsive` | **BLOCKED** (no auth) |
| — | Staff axe smoke | `staff.a11y.spec.ts` `@staff-a11y` | **BLOCKED** (no auth) |
| — | Legacy staff smoke / routes | `staff.smoke` / `staff.routes` | **BLOCKED** (no auth) |

Executed without auth: `corepack pnpm test:e2e:staff` → **24 skipped** (chromium-desktop). Exit code 0 with skips — **not** reported as PASSED. Use `test:e2e:staff:all-viewports` for desktop+mobile.

HOLD/confirm **mutations** require `PLAYWRIGHT_STAFF_MUTATIONS=1` and a fixture that legitimately enables the UI controls. Default mode is read-only readiness observation.

---

## 4. Commands for repeatable headed / UI-mode execution

| Intent | Command |
|---|---|
| Bootstrap auth | `corepack pnpm test:e2e:staff:auth` |
| Verify auth (no secrets printed) | `corepack pnpm test:e2e:staff:auth:verify` |
| Create staff inquiry fixture | `corepack pnpm test:e2e:staff:fixture` |
| All staff (desktop) | `corepack pnpm test:e2e:staff` |
| Headed | `corepack pnpm test:e2e:staff:headed` |
| Playwright UI mode | `corepack pnpm test:e2e:staff:ui` |
| Single scenario | `corepack pnpm exec playwright test --grep @staff-hold --headed --project=chromium-desktop` |
| HTML report | `corepack pnpm test:e2e:report` |
| Trace after failure | `corepack pnpm exec playwright show-trace test-results/playwright/**/trace.zip` |

Failure artifacts: screenshots, traces, and videos under `test-results/playwright/` (`video: retain-on-failure`, `trace: retain-on-failure`).

---

## 5. Fixture creation and cleanup approach

| Fixture | Script | Isolation |
|---|---|---|
| Staff inquiry | `scripts/r3-create-staff-browser-fixture.ts` | DEV host only; synthetic `r3-staff+…@example.com`; no HOLD/confirm/payment |
| Auth storage | `scripts/r3-bootstrap-staff-auth.mjs` | Writes gitignored `staff.json` + non-secret `staff.meta.json` |
| Auth verify | `scripts/r3-verify-staff-auth.mjs` | Refuses LIVE Clerk keys; never prints cookies/tokens |

**Created this R3 run:** `playwright/.fixtures/staff-inquiry.json` on DEV org `magiccrm-test-center-b` with **3** plans (`inquiryId` present locally; not committed).

Cleanup: delete `playwright/.fixtures/staff-inquiry.json` and rotate `playwright/.auth/*` when sessions expire. Synthetic inquiries may be archived/deleted in the staff UI; no automated PROD cleanup path exists (and must not).

---

## 6. Screenshots / traces and locations

| Location | Contents | Status |
|---|---|---|
| `docs/release/r3-evidence/` | Intended staff screenshots when auth works | **Empty** (only `.gitkeep`) — **NOT RUN** |
| `test-results/playwright/` | Failure screenshots / traces / videos | N/A (all skipped) |
| `playwright-report/` | HTML report | Available after runs |

No public page was presented as an authenticated staff screen.

---

## 7. Accessibility and responsive observations

| Check | Status |
|---|---|
| Staff axe (`@staff-a11y`) | **BLOCKED** — requires auth |
| Responsive 390 / 768 / 1440 | **BLOCKED** — requires auth |
| Public axe / marketing (R2) | Previously **PASSED** (unchanged this phase) |

No new product visual defects were observed in authenticated staff UI because authenticated runs did not execute.

---

## 8. Validation matrix (commands actually run)

| Check | Result | Notes |
|---|---|---|
| `pnpm test:e2e:staff:auth:verify` | **FAILED** (expected) | Missing storage state; clear reason |
| `pnpm test:e2e:staff:fixture` | **PASSED** | DEV inquiry + 3 plans |
| `pnpm test:e2e:staff` | **BLOCKED** | 48 skipped without auth |
| `pnpm lint` | **PASSED** | 0 errors; 1 pre-existing warning |
| `pnpm typecheck` | **PASSED** | |
| `pnpm test:unit` | **PASSED** | 604 tests |
| `pnpm build` | **PASSED** | |
| `pnpm test:e2e:public` | **PASSED** | **48/48** in 1.8 m against `next start` |
| Full Neon integration (~52 min) | **NOT RUN** | Unchanged product rules; R2 already green — rerun not required for R3 Playwright infrastructure |

---

## 9. Remaining production release blockers

1. **Human Clerk TEST storage state** — staff scenarios A–F cannot execute until bootstrap completes.  
2. After auth exists: capture sanitized staff evidence into `docs/release/r3-evidence/`; resolve any axe/responsive findings.  
3. Manual SR / keyboard pass on staff surfaces.  
4. Prelaunch product/legal surfaces (privacy/terms, lead-capture) — not R3 defects.

---

## 10. Production ship recommendation

| Gate | Verdict |
|---|---|
| R2 full integration | **PASSED** (prior phase) |
| Public Playwright | Re-verified in R3 validation |
| Staff Playwright infrastructure | **PASSED** (delivered) |
| Staff Playwright authenticated execution | **BLOCKED** |
| Staff visual evidence | **NOT RUN** |
| **Ship to production** | **NO** |

**Verdict:** R3 delivers a repeatable, observable, Clerk-TEST-bound Playwright staff gate (bootstrap, verify, fixtures, scenarios A–F, headed/UI scripts, traces/videos). Authenticated verification remains blocked solely on human sign-in to produce `playwright/.auth/staff.json`. Production release remains **NO**.

**STOP.** Do not deploy or begin another phase automatically.
