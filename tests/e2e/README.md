# Browser smoke (Playwright)

Minimal smoke tests for public intake and (optionally) authenticated staff chrome.

## Prerequisites

1. App reachable at `PLAYWRIGHT_BASE_URL` (default `http://localhost:3000`).
2. Chromium: `corepack pnpm exec playwright install chromium`
3. For intake / axe specs: a **non-production** organization slug:

```bash
export PLAYWRIGHT_PUBLIC_ORG_SLUG=your-test-org-slug
```

## Commands

```bash
corepack pnpm test:e2e          # all projects (staff skips without auth)
corepack pnpm test:e2e:public   # public intake + journey + token + axe + marketing home
```

Artifacts on failure: `test-results/playwright/` and `playwright-report/`.

## Authenticated staff journeys (human setup)

Staff routes (`/app/*`) require a real Clerk session. The suite **never** bypasses server authz and **never** commits cookies.

### Required human setup

1. Create a **dedicated Clerk test user** (not a production operator).
2. Attach that user to a **dedicated non-production tenant** (TEST org).
3. Grant least privilege for the scenario (e.g. Front Desk for Booking Coach; Administrators only when testing admin chrome).
4. Sign in locally against the test Clerk application (the same keys as local `next dev`).
5. Export a storage-state file (gitignored under `playwright/.auth/`):

```bash
mkdir -p playwright/.auth
corepack pnpm exec playwright codegen "$PLAYWRIGHT_BASE_URL/app" \
  --save-storage=playwright/.auth/staff.json
# Complete sign-in in the headed window, then close.
export PLAYWRIGHT_STORAGE_STATE="$PWD/playwright/.auth/staff.json"
corepack pnpm exec playwright test tests/e2e/staff.smoke.spec.ts tests/e2e/staff.routes.smoke.spec.ts
```

### Session hygiene

- Rotate / delete `playwright/.auth/*.json` when expired or when the test user changes.
- Do not reuse production Clerk sessions.
- If `PLAYWRIGHT_STORAGE_STATE` is unset or the file is missing, staff specs **skip** (not fail).

### Current blocker

Until a human produces a TEST storage-state file, authenticated staff browser coverage remains **BLOCKED**. Unit coverage and UX4 docs remain the verified source for Booking Coach layout.

## Optional proposal token fixture

For non-mutating `/plan/[token]` smoke against the local DEV app:

```bash
corepack pnpm exec tsx --tsconfig tsconfig.json scripts/r1-create-proposal-browser-fixture.ts
# prints exportHint; also writes playwright/.fixtures/proposal.json (gitignored)
export PLAYWRIGHT_PUBLIC_PLAN_TOKEN='…'   # from script output
export PLAYWRIGHT_PUBLIC_ORG_SLUG=magiccrm-test-center-b
corepack pnpm exec playwright test tests/e2e/public-token.smoke.spec.ts
```

The script refuses the Neon TEST branch and any host other than the known DEV branch. It creates a synthetic `r1-fixture+…@example.com` inquiry only.

Service-level fixture coverage (create → resolve → invalid token → tenant bind) lives in `tests/integration/proposal-token-fixture.test.ts` on the isolated TEST database.

Do not confirm bookings or collect payment during visual smoke. Invalid-token coverage already runs without `PLAYWRIGHT_PUBLIC_PLAN_TOKEN`.

## Axe

`tests/e2e/public-a11y.smoke.spec.ts` fails the suite on **critical** or **serious** axe findings for `/inquire/[slug]`. Axe alone is not a WCAG conformance claim.

## Safety

- Prefer invalid-token and read-only navigation.
- Do not submit real inquiries into production.
- Do not bypass authorization.
- Never commit `playwright/.auth/`, storage state, or secrets.
