# LAB1-A — Private Scenario Lab Security & Environment Foundation

**Status:** Complete — **STOP** (no deploy; no LAB1-B scenario staging).  
**Date:** 2026-10-17  
**Baseline:** R9 accepted for DEV/TEST  
**Deployment:** None. Work remains on local `main` (no new repo/branch).

---

## 1. Architecture decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Deployment identity | Explicit `MAGICCRM_DEPLOYMENT_KIND` (`local_development` \| `scenario_lab_test` \| `customer_production`) | Never use `NODE_ENV` alone; Vercel Production builds may host private TEST |
| Feature flag | `SCENARIO_LAB_ENABLED=true` required | Fail closed when unset/false |
| Clerk instance | Require `sk_test_` + `pk_test_`; reject LIVE | Initial private QA on Clerk TEST |
| Trusted org | `SCENARIO_LAB_ORG_ID` = Clerk org id (`org_…`) | Matches active session org; operators configure from Clerk |
| Allowlist | Exactly two distinct Clerk user IDs | Server-only; never email; never `NEXT_PUBLIC_*` |
| Admin permission | `organization.settings.manage` via existing `requirePermission` | Reuses tenant authorization; no bypass |
| Unauthorized UX | Server `notFound()` | Safe 404; no client-only protection |
| DB identity | Singleton `database_environment_identity` row + env token + `current_database()::text` vs URL db name | Not hostname-only; unlabeled DBs never treated as TEST |
| Persistence | Minimal `ScenarioLabRun` + `ScenarioLabOwnedEntity` | Enough for future ownership/reset; no booking schema changes |
| Route protection | Page loader calls shared `requireScenarioLabAccess` | Same helper for future mutations |
| Middleware | Do **not** add `/scenario-lab` to `auth.protect` redirect | Avoid leaking existence via sign-in redirect; page returns 404 |

### Assumptions

1. Solo-developer local work continues on `main`; Scenario Lab Vercel project is future manual setup.
2. Dedicated Scenario Lab Neon branch will be provisioned before any private deploy (not done in LAB1-A).
3. Integration TEST Neon (`ep-sparkling-bird-…`) may temporarily hold a sentinel **only inside security tests**; it is cleared after each test and is not a long-lived Scenario Lab target.
4. Administrators hold `organization.settings.manage` via the system Administrators group (existing catalog).

---

## 2. Files changed

### Core

| Path | Role |
| --- | --- |
| `src/lib/env/scenario-lab-config.ts` | Pure fail-closed config parse (no request input) |
| `src/server/scenario-lab/errors.ts` | `ScenarioLabError` codes |
| `src/server/scenario-lab/environment-guard.ts` | Server env + DB identity verification |
| `src/server/scenario-lab/authorize-scenario-lab.ts` | Two-user + org + permission gate |
| `src/server/scenario-lab/load-scenario-lab-page.ts` | Page loader → 404 on denial |
| `src/app/scenario-lab/page.tsx` | Foundation UI only |
| `prisma/schema.prisma` | Identity + run ownership models |
| `prisma/migrations/20261017180000_scenario_lab_foundation/` | Migration (no sentinel seed) |
| `scripts/provision-scenario-lab-database-identity.ts` | Explicit opt-in sentinel provisioner |
| `.env.example` / `.env.test.example` | Documented variables |
| `package.json` | `scenario-lab:provision-db-identity` |
| `tests/helpers/cleanup-test-organizations.ts` | Clean scenario lab tables |
| `tests/mocks/server-only.ts` + vitest aliases | Allow importing server-only modules in Vitest |
| `scripts/run-integration-tests.mjs` | Forward CLI args to Vitest |

### Tests / docs

| Path | Role |
| --- | --- |
| `tests/unit/scenario-lab-config.test.ts` | Config / allowlist / production rejection |
| `tests/unit/scenario-lab-environment-guard.test.ts` | DB identity / connection checks |
| `tests/integration/scenario-lab-authorization.test.ts` | Full authz matrix on Neon TEST |
| `docs/release/LAB1_A_SCENARIO_LAB_VERCEL_SETUP.md` | Future second Vercel project guide |
| `docs/release/LAB1_A_SECURITY_AND_ENVIRONMENT_FOUNDATION.md` | This deliverable |

---

## 3. Environment guard design

`parseScenarioLabConfig` (pure) then `assertScenarioLabEnvironment` (DB):

1. `MAGICCRM_DEPLOYMENT_KIND=customer_production` → always deny (`PRODUCTION_DEPLOYMENT`), even if enabled.
2. `SCENARIO_LAB_ENABLED` must be exactly `true`.
3. Deployment kind must be `scenario_lab_test`.
4. Clerk keys must be TEST; LIVE rejected.
5. Allowlist must be exactly two distinct `user_…` IDs.
6. `SCENARIO_LAB_ORG_ID` must be `org_…`.
7. `MAGICCRM_DATABASE_ENVIRONMENT_TOKEN` min 16 chars.
8. Against the **active** Prisma connection:
   - `SELECT current_database()::text`
   - Must equal the database name from `DATABASE_URL` (not hostname-only trust)
   - Singleton `database_environment_identity` must exist with `kind=scenario_lab_test` and token match
9. Unknown / unlabeled databases are never treated as TEST.

Request headers, cookies, query parameters, and `NODE_ENV` alone never establish deployment identity.

---

## 4. Two-user authorization design

`requireScenarioLabAccess({ auth, database, env })`:

1. `assertScenarioLabEnvironment`
2. Authenticated Clerk user required
3. Active Clerk organization required
4. Clerk user id ∈ allowlist
5. Active Clerk org id === `SCENARIO_LAB_ORG_ID`
6. `resolveRequestContext` (existing tenant mapping; no bypass)
7. `requirePermission(..., ORGANIZATION_SETTINGS_MANAGE)`
8. Returns safe context for pages/mutations

Page path: `loadScenarioLabFoundationPage` maps any `ScenarioLabError` to `notFound()`.

---

## 5. Database identity strategy

| Piece | Purpose |
| --- | --- |
| Table `database_environment_identity` | Singleton proof of intentional nonproduction labeling |
| Columns `kind`, `token`, `label` | Kind must be `scenario_lab_test`; token secret; label safe for UI |
| Env `MAGICCRM_DATABASE_ENVIRONMENT_TOKEN` | Must match row token |
| `current_database()::text` | Confirms active connection vs `DATABASE_URL` pathname |
| Provisioner script | `--confirm-nonproduction` required; refuses customer production; never auto-seed |

Migration creates the **table only**. No identity row is inserted automatically.

---

## 6. Prisma changes

New models (booking domain unchanged):

- `DatabaseEnvironmentIdentity` → `database_environment_identity`
- `ScenarioLabRun` → `scenario_lab_runs` (status default `initialized`; optional `templateKey` for LAB1-B+)
- `ScenarioLabOwnedEntity` → `scenario_lab_owned_entities` (unique per org+entityType+entityId)

Applied to local DEV and integration TEST via `pnpm db:deploy` (not customer production).

---

## 7. Security test evidence

### Unit (`pnpm test:unit`)

- Full unit suite: **633 passed** (119 files), including:
  - `tests/unit/scenario-lab-config.test.ts`
  - `tests/unit/scenario-lab-environment-guard.test.ts`
- Covers: allowlist exactly-two, emails rejected, feature disabled, production identity rejection, LIVE Clerk rejection, missing org/token, DB sentinel missing/mismatch, connection db name mismatch, unlabeled kind rejection, `NODE_ENV=production` not treated as deployment identity.

### Integration (Neon TEST `ep-sparkling-bird-…`)

```text
tests/integration/scenario-lab-authorization.test.ts
Test Files  1 passed
Tests       10 passed
```

Covers: allowlisted admin success, signed-out, non-allowlisted, wrong org, missing permission, feature disabled, customer production, DB token mismatch, cross-tenant denial, ownership row persistence.

### Not claimed / skipped

| Coverage | Status |
| --- | --- |
| Live Clerk browser login against `/scenario-lab` | Skipped — LAB1-A uses injected trusted auth in tests; private Vercel + Clerk TEST not configured yet |
| Deployed production negative test on a real prod project | Skipped — no deployment; covered by unit/integration production-identity cases |
| Staff/public Playwright regression | Skipped — no `/app` layout, booking, or shared shell changes; additive `/scenario-lab` route only |

---

## 8. Regression results

| Check | Result |
| --- | --- |
| Lint | Pass (0 errors; 1 pre-existing warning in `scripts/r9-capture-mobile-nav-evidence.mjs`) |
| Typecheck | Pass |
| Unit tests | **633 passed** |
| Scenario Lab integration | **10 passed** |
| Production build | Pass — route `ƒ /scenario-lab` present |
| Booking domain schema | Unchanged |
| Deploy | **Not performed** |

R9 baseline counts (614 unit / 188 integration / Playwright suites) were not fully re-run in LAB1-A beyond unit suite growth and targeted Scenario Lab integration. Full integration suite was not required for this additive security foundation; booking paths were not modified.

---

## 9. Vercel deployment preparation steps

See `docs/release/LAB1_A_SCENARIO_LAB_VERCEL_SETUP.md` for the full checklist:

1. Second Vercel project from the same GitHub repo (same `main`; no new Git branch).
2. Dedicated Neon Scenario Lab branch + migrate deploy.
3. Provision DB identity sentinel with confirmation flag.
4. Clerk TEST keys; exactly two allowlisted users; trusted `SCENARIO_LAB_ORG_ID`.
5. Set `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test` and `SCENARIO_LAB_ENABLED=true` only on that project.
6. Customer production: `MAGICCRM_DEPLOYMENT_KIND=customer_production`, `SCENARIO_LAB_ENABLED=false`.
7. Future option: dedicated Clerk staging application for a long-lived external lab.

---

## 10. Remaining manual configuration

- Create Scenario Lab Vercel project
- Create Neon Scenario Lab database/branch
- Generate and store `MAGICCRM_DATABASE_ENVIRONMENT_TOKEN`
- Run `pnpm scenario-lab:provision-db-identity -- --confirm-nonproduction`
- Configure two Clerk TEST user IDs + trusted org
- Set Scenario Lab env vars on that Vercel project only
- Leave outbound notification providers unset for private QA

---

## 11. Blockers before LAB1-B

None for starting LAB1-B **implementation** in-repo.

Before **using** Scenario Lab against a hosted private environment:

1. Manual Neon Scenario Lab database + identity provisioning
2. Clerk TEST allowlist + trusted org configuration
3. Explicit decision to deploy the second Vercel project (still out of scope until requested)

LAB1-B must not begin scenario templates, staging buttons, real inquiry submission, automated verification, or reset until those product phases are authorized.

---

## Acceptance criteria checklist

| Criterion | Met |
| --- | --- |
| `/scenario-lab` exists | Yes |
| Only two configured TEST admins can access | Yes (server gate) |
| Unauthorized rejected server-side | Yes (`notFound`) |
| Production config cannot enable Scenario Lab | Yes |
| Database identity verified | Yes |
| Trusted organization scoping enforced | Yes |
| Future scenario ownership can persist | Yes (`ScenarioLabRun` / `OwnedEntity`) |
| Existing booking functionality unchanged | Yes (no booking schema/logic edits) |
| Security tests pass | Yes |
| No deployment occurred | Yes |

**STOP after LAB1-A.**
