# UX7 browser smoke (Playwright)

Minimal, maintainable smoke tests for the Effortless Precision redesign.

## Prerequisites

1. App reachable at `PLAYWRIGHT_BASE_URL` (default `http://localhost:3000`).
2. Chromium installed: `corepack pnpm exec playwright install chromium`
3. For intake specs: a **non-production** organization slug that resolves `/inquire/[slug]`:

```bash
export PLAYWRIGHT_PUBLIC_ORG_SLUG=your-test-org-slug
```

## Authenticated staff journeys

Staff routes (`/app/*`) require a Clerk session. This suite does **not** embed production credentials.

Options:

- Skip staff specs when `PLAYWRIGHT_STORAGE_STATE` is unset (default).
- Provide a local storage state file from a disposable test account:

```bash
# After signing in manually in a headed browser (test tenant only):
# playwright codegen --save-storage=playwright/.auth/staff.json
export PLAYWRIGHT_STORAGE_STATE=playwright/.auth/staff.json
```

Never commit storage state or secrets.

## Commands

```bash
corepack pnpm test:e2e          # all smoke projects
corepack pnpm test:e2e:public   # unauthenticated public only
```

Artifacts on failure: `test-results/playwright/` and `playwright-report/`.

## Safety

- Prefer invalid-token and read-only navigation.
- Do not submit real inquiries into production.
- Do not bypass authorization.
