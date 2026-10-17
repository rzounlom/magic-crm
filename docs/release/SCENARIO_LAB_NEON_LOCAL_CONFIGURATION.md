# Scenario Lab Neon — local configuration prep

**Status:** Prepared — waiting for connection strings + explicit approval before migrate/provision.  
**Date:** 2026-10-17  

## What was created

| File | Role |
| --- | --- |
| `.env.scenario-lab.local` | Gitignored local secrets (via `.env*.local`) |
| `.env.scenario-lab.example` | Committed template |
| `scripts/load-scenario-lab-env.mjs` | Isolated load; refuses DEV/TEST identity match |
| `scripts/verify-scenario-lab-database.ts` | Read-only Neon inspection |
| `scripts/migrate-scenario-lab-database.mjs` | `migrate deploy` against lab only (not run yet) |
| `prisma.config.ts` | Loads `.env.scenario-lab.local` when `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test` |

Existing `.env`, `.env.local`, and `.env.test` were **not** modified.

## Your next manual action (required now)

1. Open Neon → branch **`scenario_lab`**.
2. Copy the **pooled** connection string into `.env.scenario-lab.local` as `DATABASE_URL=…`
3. Copy the **direct / non-pooled** connection string into the same file as `DIRECT_URL=…`
4. Paste only into that file — **do not paste connection strings into chat**.
5. Optionally fill Clerk TEST keys, two allowlisted `user_…` IDs, `SCENARIO_LAB_ORG_ID`, and generate:

```bash
openssl rand -hex 24
# put result in MAGICCRM_DATABASE_ENVIRONMENT_TOKEN=
```

6. Run verification (read-only):

```bash
pnpm scenario-lab:verify-database
```

7. Reply with approval (or not) after reviewing the printed target identity and pending migrations. **No migrate or identity provision will run without that approval.**

## Proposed commands after approval (not executed)

```bash
# 1) Apply committed migrations to Scenario Lab only (no reset, no db push)
pnpm scenario-lab:migrate-deploy

# 2) Provision DB identity sentinel (requires --confirm-nonproduction)
pnpm scenario-lab:provision-db-identity -- --confirm-nonproduction --label "Scenario Lab TEST"
```

Identity provisioning still requires `MAGICCRM_DATABASE_ENVIRONMENT_TOKEN` set in `.env.scenario-lab.local`.

## Safety notes

- Schema-only Neon branches copy schema structure without data; migrations may still be required if `_prisma_migrations` is incomplete or missing relative to this repo.
- Database name `neondb` alone is insufficient — verification uses Neon **endpoint** identity and refuses DEV/TEST matches.
- No customer data copy, venue seed, Vercel deploy, or production changes.
