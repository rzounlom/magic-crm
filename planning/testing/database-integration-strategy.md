# Database integration testing strategy

## Purpose

Unit tests in this phase prove tenant-query shape and environment validation without a live database. Integration tests against Postgres are required before inventory, payments, and other transactional features ship.

## Dedicated test database

Automated Prisma repository tests must use a **dedicated test database**.

Never run destructive tests against:

- production
- a staging database that holds real tenant data
- a developer’s normal Neon development branch

A developer’s everyday branch will accumulate local data and is too easy to reset accidentally.

### Phase 2 status

A dedicated Neon TEST branch exists. Local credentials are gitignored in `.env.test`. Integration tests inject trusted Clerk auth and do not call Clerk’s API.

Do not invent those credentials in planning docs. Do not reuse `DATABASE_URL` / `DIRECT_URL` from the normal development `.env`.

Local test credentials live in gitignored `.env.test` and must include:

```env
MAGICCRM_DATABASE_ROLE=test
```

`pnpm test:db:prepare` applies migrations to the test database only.  
`pnpm test:integration` refuses to run if the role is missing or if the test URLs match development.

```bash
pnpm test:db:prepare
pnpm test:integration
```

## Preferred isolation

1. A Neon branch or local Postgres instance created only for tests.
2. Schema applied with `pnpm db:deploy` (or an equivalent migrate-before-test step) against that database.
3. Tests use `DATABASE_URL` / `DIRECT_URL` from a gitignored `.env.test` or CI secret — never production credentials.

## Migration-before-test

CI and local integration suites should:

1. Provision or select the test database.
2. Apply committed migrations (`prisma migrate deploy`).
3. Run tests.
4. Fail if the schema is behind the committed migration history.

Do not use `db push` as the long-term CI source of truth.

## Cleanup / isolation

Until a richer harness exists:

- Prefer wrapping each test in a transaction and rolling back, or
- Delete only rows created by that test, scoped by test-specific organization IDs.

Do not truncate shared tables in a database that anyone uses for manual development.

## CI

CI should provision an ephemeral Postgres (GitHub Actions service, Neon ephemeral branch, or equivalent), apply migrations, and run `pnpm test` plus future integration tests. Production credentials must not be available to the test job.

## Future: Neon branch-per-test-suite

Neon branches are a good later option for isolation:

- one branch per CI run or suite
- apply migrations
- destroy the branch after

Do not build that infrastructure in this phase.

## Future: inventory concurrency

The shared availability engine will require concurrency tests against a real database: overlapping reservations, holds vs confirms, and cancellation release. Those tests are release blockers for the inventory phase and must not run against production.

## Current limitation

This phase’s tenant isolation tests inject a repository dependency and assert that `findFirst` is called with both `id` and `organizationId`, then prove a cross-tenant ID returns `null` through that query path.

They do **not** yet execute SQL against Postgres. That is intentional until a dedicated test database exists.
