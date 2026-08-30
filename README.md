# MagicCRM

MagicCRM is a multi-tenant SaaS platform for fun centers. It will eventually cover CRM and lead intake, AI-assisted sales conversations, event booking, proposals, online booking, shared attraction inventory, POS, payments, waivers, operations, communications, and reporting.

Generations Adventureplex is the first MagicCRM tenant. The system is being designed as a multi-tenant SaaS application from inception.

## Current status

Phase 2 tenant authentication is in place: Clerk Organizations, MagicCRM provisioning, and a trusted `RequestContext`. CRM, booking, payments, and AI are not implemented yet.

## Prerequisites

- Node.js 20 or later (Node.js 24 is known to work)
- [pnpm](https://pnpm.io) 11 (this repo pins `packageManager` to `pnpm@11.24.0`)

Enable pnpm with Corepack if it is not already on your PATH:

```bash
corepack enable
corepack prepare pnpm@11.24.0 --activate
```

## Setup

```bash
pnpm install
```

Copy the environment example:

```bash
cp .env.example .env.local
```

Never commit `.env`, `.env.local`, or `.env.test`.

## Clerk

Create a Clerk application and enable Organizations. Copy:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (browser-safe)
- `CLERK_SECRET_KEY` (server-only)

into `.env` / `.env.local`. Do not commit real keys.

Then:

```bash
pnpm dev
```

1. Open `/` and choose **Employee sign in**.
2. Sign up or sign in.
3. Create or select a Clerk Organization. Personal accounts cannot enter `/app`.
4. MagicCRM provisions an Organization, `Main Location`, and your UserProfile.
5. `/app` shows the active organization, default location, and user.
6. Switching organizations in the header resolves a different MagicCRM tenant. Refreshing does not create duplicate records.

Integration tests do not call Clerk. They inject trusted auth input.

## Database (Neon + Prisma)

Production, development, and test databases must be separate. Do not run migrations or tests against production.

1. Create a Neon **development** project (or branch).
2. Copy the **pooled** connection string into `DATABASE_URL`.
3. Copy the **direct / unpooled** connection string into `DIRECT_URL`.
4. Generate the Prisma Client, validate the schema, migrate, and test:

```bash
pnpm db:generate
pnpm db:validate
pnpm db:migrate    # development only; requires DIRECT_URL
pnpm test:unit
```

Dedicated test database (never the development database):

```bash
cp .env.test.example .env.test
# set MAGICCRM_DATABASE_ROLE=test and TEST Neon URLs only
pnpm test:db:prepare
pnpm test:integration
```

`DATABASE_URL` is the runtime application connection (Neon pooler).  
`DIRECT_URL` is for Prisma CLI migrations, introspection, and Prisma Studio.

`pnpm db:migrate`, `pnpm db:deploy`, and `pnpm db:studio` fail if `DIRECT_URL` is missing. They do not fall back to localhost. `pnpm db:validate` and `pnpm db:generate` can run without a live database.

Prisma Studio (`pnpm db:studio`) is privileged admin tooling. Treat it like direct production-database access.

There is no `db:reset` script. Do not add one casually.

After `pnpm install`, run `pnpm db:generate` before `pnpm typecheck` if `src/generated` is not present.

## Commands

```bash
pnpm dev          # development server (Turbopack)
pnpm build        # prisma generate + production build
pnpm start        # run the production build
pnpm lint         # ESLint
pnpm typecheck    # TypeScript (`tsc --noEmit`)
pnpm test              # unit tests
pnpm test:unit         # unit tests
pnpm test:integration  # Neon TEST database only
pnpm test:db:prepare   # apply migrations to TEST database
pnpm test:watch        # unit test watch
pnpm db:generate  # generate Prisma Client
pnpm db:validate  # validate Prisma schema
pnpm db:migrate   # create/apply development migrations
pnpm db:deploy    # apply committed migrations
pnpm db:studio    # privileged Prisma Studio
```

Open [http://localhost:3000](http://localhost:3000) after starting `pnpm dev`.

## Project directory overview

```text
magic-crm/
├── .cursor/rules/          Cursor project conventions
├── planning/               Implementation planning (not production code)
├── docs/                   Product and operational documentation
├── src/
│   ├── app/                Next.js App Router routes and layouts
│   ├── components/         Reusable visual components
│   │   ├── ui/             Low-level UI primitives
│   │   └── layout/         Application shell
│   ├── modules/            Feature/domain modules
│   ├── lib/                Shared infrastructure helpers
│   ├── server/             Server-only application logic
│   │   ├── services/       Business orchestration
│   │   ├── repositories/   Database access boundaries
│   │   └── policies/       Authorization and entitlements
│   ├── styles/             Design tokens and shared CSS
│   └── types/              Truly shared cross-domain types
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── public/
```

## Planning documents

Living technical planning lives in [`planning/`](./planning/README.md). It is separate from production application code. Use that workspace for architecture notes, ADRs, phase plans, feature specs, data-model work, API contracts, AI design, security, and test strategy.

## License

Proprietary. All rights reserved.
