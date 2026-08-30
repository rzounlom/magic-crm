# MagicCRM

MagicCRM is a multi-tenant SaaS platform for fun centers. It will eventually cover CRM and lead intake, AI-assisted sales conversations, event booking, proposals, online booking, shared attraction inventory, POS, payments, waivers, operations, communications, and reporting.

Generations Adventureplex is the first MagicCRM tenant. The system is being designed as a multi-tenant SaaS application from inception.

## Current status

Repository and Next.js application foundation only.

The app currently renders a minimal landing page that proves the Next.js App Router, TypeScript, Tailwind CSS, and import alias setup. Business features, authentication, database access, payments, and AI integrations are not implemented yet.

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

Copy the environment example and leave values empty until a later phase configures each service:

```bash
cp .env.example .env.local
```

`.env.example` lists future integrations only. None of those services are configured in this foundation step. Never commit `.env` or `.env.local`.

## Commands

```bash
pnpm dev        # development server (Turbopack)
pnpm build      # production build
pnpm start      # run the production build
pnpm lint       # ESLint
pnpm typecheck  # TypeScript (`tsc --noEmit`)
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
