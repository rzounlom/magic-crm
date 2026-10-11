# Browser smoke (Playwright)

Public intake smoke and authenticated staff scenarios (R3).

## Prerequisites

1. App reachable at `PLAYWRIGHT_BASE_URL` (default `http://localhost:3000`).
2. Chromium: `corepack pnpm exec playwright install chromium`
3. For intake / axe specs: a **non-production** organization slug:

```bash
export PLAYWRIGHT_PUBLIC_ORG_SLUG=magiccrm-test-center-b
```

4. Local Clerk keys must be **TEST** (`pk_test_` / `sk_test_`). Never point staff auth at LIVE Clerk.

## Commands

```bash
corepack pnpm test:e2e          # all projects (staff skips without auth)
corepack pnpm test:e2e:public   # public intake + journey + token + axe + marketing home + AUTH1
corepack pnpm test:e2e:auth1    # authentication transition smoke (signed-out; auth scenarios skip)
corepack pnpm test:e2e:staff    # authenticated staff scenarios (skip without auth)
corepack pnpm test:e2e:report   # open HTML report
```

Artifacts on failure: `test-results/playwright/` (screenshots, traces, videos) and `playwright-report/`.

### Watchable staff runs (solo developer)

```bash
# One scenario tag
corepack pnpm exec playwright test --grep @staff-nav --headed --project=chromium-desktop
corepack pnpm exec playwright test --grep @staff-inquiry --headed
corepack pnpm exec playwright test --grep @staff-hold --headed
corepack pnpm exec playwright test --grep @staff-confirm --headed
corepack pnpm exec playwright test --grep @staff-guard --headed
corepack pnpm exec playwright test --grep @staff-responsive --headed
corepack pnpm exec playwright test --grep @staff-a11y --headed

# All staff scenarios, headed or UI mode
corepack pnpm test:e2e:staff:headed
corepack pnpm test:e2e:staff:ui

# After a failure
corepack pnpm test:e2e:report
corepack pnpm exec playwright show-trace test-results/playwright/**/trace.zip
```

Scenario tags: `@staff-nav` · `@staff-inquiry` · `@staff-hold` · `@staff-confirm` · `@staff-guard` · `@staff-responsive` · `@staff-a11y` · `@staff-smoke` · `@staff-routes`

## Authenticated staff journeys (human setup)

Staff routes (`/app/*`) require a real Clerk session. The suite **never** bypasses server authz and **never** commits cookies.

### Required human setup

1. Create a **dedicated Clerk test user** (not a production operator).
2. Attach that user to a **dedicated non-production tenant** (e.g. `magiccrm-test-center-b` on DEV).
3. Grant least privilege for the scenario (Front Desk for Booking Coach; Administrators only when testing admin chrome). Ensure `events.create` / `events.confirm` as needed for HOLD/confirm mutation runs.
4. Sign in locally against the **TEST** Clerk application (same `pk_test_` keys as local `next dev` / `next start`).
5. Bootstrap storage state (gitignored under `playwright/.auth/`):

```bash
# App must already be running at PLAYWRIGHT_BASE_URL
export PLAYWRIGHT_BASE_URL=http://localhost:3000
export PLAYWRIGHT_STAFF_ORG_SLUG=magiccrm-test-center-b
corepack pnpm test:e2e:staff:auth
# Complete sign-in in the headed codegen window, land on /app, then close.

export PLAYWRIGHT_STORAGE_STATE="$PWD/playwright/.auth/staff.json"
corepack pnpm test:e2e:staff:auth:verify
git check-ignore -v playwright/.auth/staff.json   # must report ignored
```

Manual equivalent:

```bash
mkdir -p playwright/.auth
corepack pnpm exec playwright codegen "$PLAYWRIGHT_BASE_URL/app" \
  --save-storage=playwright/.auth/staff.json
```

### Staff inquiry fixture (DEV database only)

```bash
corepack pnpm test:e2e:staff:fixture
# writes playwright/.fixtures/staff-inquiry.json (gitignored)
```

The fixture script refuses Neon TEST role and non-DEV hosts. It creates a synthetic `r3-staff+…@example.com` inquiry only — no HOLD, no confirm, no payment.

### Running staff scenarios

```bash
export PLAYWRIGHT_STORAGE_STATE="$PWD/playwright/.auth/staff.json"
export PLAYWRIGHT_PUBLIC_ORG_SLUG=magiccrm-test-center-b
corepack pnpm test:e2e:staff:headed
```

HOLD / confirm **mutations** are opt-in (default is read-only readiness observation):

```bash
export PLAYWRIGHT_STAFF_MUTATIONS=1
corepack pnpm exec playwright test --grep '@staff-hold|@staff-confirm' --headed --project=chromium-desktop
```

Do not enable mutations against production tenants.

### Session hygiene

- Rotate / delete `playwright/.auth/*.json` when expired or when the test user changes.
- Do not reuse production Clerk sessions.
- If storage state is missing or invalid, staff specs **skip** with a clear BLOCKED reason (not a silent pass).
- Auth verify refuses `pk_live_` / `sk_live_` keys.

### Current blocker

Until a human produces a TEST storage-state file via `pnpm test:e2e:staff:auth`, authenticated staff browser coverage remains **BLOCKED**.

Evidence screenshots (when auth works) land in `docs/release/r3-evidence/` (committed only when sanitized and intentional).

## Optional proposal token fixture

For non-mutating `/plan/[token]` smoke against the local DEV app:

```bash
corepack pnpm exec tsx --tsconfig tsconfig.json scripts/r1-create-proposal-browser-fixture.ts
export PLAYWRIGHT_PUBLIC_PLAN_TOKEN='…'   # from script output (publicToken)
export PLAYWRIGHT_PUBLIC_ORG_SLUG=magiccrm-test-center-b
corepack pnpm exec playwright test tests/e2e/public-token.smoke.spec.ts
```

The script refuses the Neon TEST branch and any host other than the known DEV branch.

## Axe

- Public: `tests/e2e/public-a11y.smoke.spec.ts` and marketing home fail on **critical** / **serious** findings.
- Staff: `tests/e2e/staff.a11y.spec.ts` (requires auth). Axe alone is not a WCAG conformance claim.

## Safety

- Prefer invalid-token and read-only navigation.
- Do not submit real inquiries into production.
- Do not bypass authorization.
- Never commit `playwright/.auth/`, `playwright/.fixtures/`, storage state, or secrets.
