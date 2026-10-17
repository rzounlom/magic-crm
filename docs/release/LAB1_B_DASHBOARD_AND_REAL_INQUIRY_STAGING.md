# LAB1-B — Private Scenario Lab Dashboard & Real Inquiry Staging

**Status:** Complete — **STOP** (no deploy; no LAB1-C).  
**Date:** 2026-10-17  
**Baseline:** LAB1-A security foundation  

---

## Can an authorized Scenario Lab administrator stage and inspect a real customer inquiry using the actual MagicCRM intake workflow?

| Layer | Answer |
| --- | --- |
| **Code-complete** | **YES** — authorized admins can create a run, open the real `/inquire` form with synthetic prefill, submit via `createPublicInquiry` / `submitPublicInquiryAction`, and inspect the linked inquiry on `/scenario-lab/runs/[runId]` with a staff workspace link. |
| **Verified in automated tests** | **YES** — integration tests exercise authorized create, public intake correlation, ownership isolation, and tenant denial against Neon TEST. |
| **Verified in a live browser with Scenario Lab enabled** | **NO (skipped)** — local/hosted Scenario Lab env (deployment kind, DB sentinel, allowlist) was not enabled for interactive browser capture in this phase. Public intake Playwright suites still passed on the shared DEV planner. |

---

## 1. Dashboard screenshots

**Not captured.** Scenario Lab pages return 404 unless LAB1-A fail-closed env is fully enabled (deployment kind, DB identity token, Clerk TEST allowlist, trusted org). That configuration was not turned on for local screenshotting during LAB1-B.

UI surfaces implemented for later capture:

- `/scenario-lab` — TEST badge, operator/org/DB identity, templates, create form, recent runs
- `/scenario-lab/runs/[runId]` — fixture, linked inquiry, open-intake action, timeline

---

## 2. Files changed

### Scenario Lab core

| Path | Role |
| --- | --- |
| `src/server/scenario-lab/constants.ts` | Statuses, templates, timeline kinds |
| `src/server/scenario-lab/synthetic-customer.ts` | Fictional `@example.com` / `555` fixtures |
| `src/server/scenario-lab/timeline.ts` | Timeline parse/append |
| `src/server/scenario-lab/run-service.ts` | Create/list/detail/open-intake/prefill |
| `src/server/scenario-lab/claim-inquiry.ts` | Post-create ownership claim |
| `src/server/scenario-lab/load-scenario-lab-access.ts` | Shared page gate |
| `src/server/scenario-lab/load-scenario-lab-page.ts` | Dashboard loader |
| `src/server/scenario-lab/load-scenario-lab-run-page.ts` | Run detail loader |
| `src/server/actions/scenario-lab.ts` | Authorized server actions |
| `src/components/layout/scenario-lab-dashboard.tsx` | Dashboard UI |
| `src/components/layout/scenario-lab-run-detail.tsx` | Run detail UI |
| `src/app/scenario-lab/page.tsx` | Dashboard route |
| `src/app/scenario-lab/runs/[runId]/page.tsx` | Detail route |

### Public intake (narrow correlation)

| Path | Role |
| --- | --- |
| `src/server/inquiries/intake-validation.ts` | Optional `scenarioLabCorrelationToken` |
| `src/server/services/inquiry-service.ts` | Claim after persist; skip outbound plan email when lab token present |
| `src/server/actions/public-inquiry.ts` | Pass correlation field |
| `src/components/layout/public-intake-wizard.tsx` | Prefill + hidden lab token |
| `src/app/inquire/[organizationSlug]/page.tsx` | Resolve `?lab=` prefill |

### Persistence

| Path | Role |
| --- | --- |
| `prisma/schema.prisma` | Run lifecycle fields |
| `prisma/migrations/20261017200000_scenario_lab_run_lifecycle/` | Migration |

### Tests

| Path | Role |
| --- | --- |
| `tests/unit/scenario-lab-synthetic-customer.test.ts` | Safe synthetic data |
| `tests/unit/scenario-lab-timeline.test.ts` | Timeline helpers |
| `tests/integration/scenario-lab-inquiry-staging.test.ts` | Staging + correlation matrix |
| `tests/integration/scenario-lab-authorization.test.ts` | Updated for new required columns |

---

## 3. Scenario run lifecycle

Statuses: `initialized` → `ready` → `running` → `completed` | `failed`

| Transition | When |
| --- | --- |
| → `ready` | Run created with synthetic fixture (create is atomic; status starts ready) |
| `ready` → `running` | Operator opens public intake (recorded) |
| `running` → `completed` | Inquiry claimed via correlation after successful public create |
| → `failed` | Reserved for explicit failure messaging (not used for “fixtures created”) |

**Not a pass:** Creating fixtures or opening intake never marks the scenario Passed. `completed` means inquiry was persisted and linked — not booking/HOLD verification.

**Idempotency:** `idempotencyKey` unique per organization; duplicate create returns the same run.

**Concurrency:** Intake open and claim use `SELECT … FOR UPDATE` on the run row; ownership unique on `(organizationId, entityType, entityId)`.

---

## 4. Real inquiry submission flow

1. Authorized admin opens `/scenario-lab`.
2. Creates **Customer submits an inquiry** run (synthetic fixture + correlation token).
3. On run detail, **Open public inquiry form** marks intake opened and redirects to `/inquire/{slug}?lab={correlationToken}` (token ≠ run id).
4. Public page loads real catalog + prefill; wizard submits via existing `submitPublicInquiryAction` → `createPublicInquiry`.
5. After inquiry commit, optional claim links ownership; run → `completed`.
6. Operator returns to run detail / staff `/app/inquiries/{id}`.

No parallel Scenario Lab inquiry API.

---

## 5. Correlation and ownership design

### Trust model

| Element | Behavior |
| --- | --- |
| Token | High-entropy hex (`correlationToken`), unique DB-wide |
| Public URL | `?lab=<token>` only — never run id or privileged secrets |
| Prefill | Server resolves token → org slug match → READY/RUNNING only; returns synthetic answers |
| Submit | Hidden `scenarioLabCorrelationToken` through normal form + validation |
| Claim | After successful inquiry create; tenant-scoped; ignores invalid/expired tokens so normal customers are unaffected |
| Ownership | `ScenarioLabOwnedEntity` (`inquiry` + inquiry id); one inquiry per run; one owner per inquiry |
| Notifications | Lab-token submissions skip outbound plan email notification |

Matching is **not** by name/email/timestamp alone.

---

## 6. Security controls

Every Scenario Lab page/action uses `requireScenarioLabAccess` (LAB1-A):

- Exactly two allowlisted Clerk users
- Trusted active org
- `organization.settings.manage`
- Verified DB identity + `scenario_lab_test` deployment
- Clerk TEST keys
- Tenant-scoped queries
- Unauthorized → `notFound()`
- Public intake rate limits / honeypot / validation preserved
- No production DB switching

---

## 7. Test results

| Suite | Result |
| --- | --- |
| Lint | Pass (0 errors; 1 pre-existing warning) |
| Typecheck | Pass |
| Unit | **636 passed** |
| Scenario Lab integration | **17 passed** (authz 10 + staging 7) |
| Production build | Pass (`/scenario-lab`, `/scenario-lab/runs/[runId]`) |
| Public Playwright (`test:e2e:public`) | **61 passed**, **1 failed** |
| Failed e2e | `auth-transition.smoke` mobile — visibility of `hidden sm:inline` MagicCRM label after `/app` refresh (unrelated to Scenario Lab / inquire) |
| Public intake smoke/journey/a11y | All passed |
| Scenario Lab browser e2e | **Skipped** — Scenario Lab env not enabled for authenticated browser fixtures |

---

## 8. Known limitations

- No full verification engine / pass-fail scoring
- No HOLD, confirm, conflict, or reset templates
- No live browser Scenario Lab walkthrough in this phase
- Venue must already have active location + public attraction interests
- Event-plan generation may still mark inquiry `NEEDS_FOLLOW_UP` if catalog/AI incomplete — ownership claim still succeeds after persist
- Dashboard screenshots pending enabled lab env

---

## 9. Manual configuration required

Same as LAB1-A Vercel/Neon/Clerk setup, plus:

1. Trusted TEST org must be ACTIVE with a primary location and at least one public attraction interest.
2. Enable Scenario Lab env locally only when intentionally testing the lab UI.
3. Keep outbound providers unset for private QA.

---

## 10. Readiness for LAB1-C

**Ready to begin LAB1-C implementation in-repo** for the next scenario/observation layer, with the understanding that:

- Hosted private deploy is still manual / not done
- LAB1-C must not assume reset or automated pass/fail yet unless that phase defines them

**STOP after LAB1-B. Do not deploy. Do not start LAB1-C until requested.**
