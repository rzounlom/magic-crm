# MagicCRM

MagicCRM is a multi-tenant SaaS platform for fun centers. It will eventually cover CRM and lead intake, AI-assisted sales conversations, event booking, proposals, online booking, shared attraction inventory, POS, payments, waivers, operations, communications, and reporting.

Generations Adventureplex is the first MagicCRM tenant. The system is being designed as a multi-tenant SaaS application from inception.

## Current status

Repository foundation plus Phase 1 tenant-aware persistence.

The app still renders a minimal landing page. Prisma, Neon connection configuration, Organization / Location / UserProfile, and tenant-scoped repositories are in place. Authentication, CRM, booking, payments, and AI are not implemented yet.

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

Never commit `.env` or `.env.local`. Clerk, Stripe, OpenAI, and QStash remain unconfigured placeholders.

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
pnpm test
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
pnpm test         # Vitest
pnpm test:watch   # Vitest watch
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
