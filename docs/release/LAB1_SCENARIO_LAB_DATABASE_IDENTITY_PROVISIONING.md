# LAB1 — Scenario Lab database identity provisioning

**Status:** Complete — identity sentinel provisioned on dedicated Scenario Lab Neon branch  
**Date:** 2026-10-17  
**Target branch:** Neon `scenario_lab`  
**Verified endpoint:** `ep-lucky-hall-av5j542n.c-11.us-east-1.aws.neon.tech/neondb`

## Summary

After migration baselining, the Scenario Lab database identity sentinel was provisioned with kind `scenario_lab_test` and label `Scenario Lab TEST`. Post-checks confirm a single matching sentinel row, unchanged migration history (30 applied / 0 pending), and no application/customer data. DEV and integration TEST were not targeted.

## Pre-execution checks

```bash
pnpm scenario-lab:verify-database
```

| Check | Result |
| --- | --- |
| Pooled host | `ep-lucky-hall-av5j542n-pooler.c-11.us-east-1.aws.neon.tech` |
| Direct host | `ep-lucky-hall-av5j542n.c-11.us-east-1.aws.neon.tech` |
| Same endpoint identity (pooled + direct) | yes |
| Differs from DEV | yes |
| Differs from integration TEST | yes |
| Applied migrations | 30 |
| Pending migrations | 0 |
| `MAGICCRM_DEPLOYMENT_KIND` | `scenario_lab_test` |
| `MAGICCRM_DATABASE_ENVIRONMENT_TOKEN` present (≥16 chars) | yes |
| Identity sentinel before provision | not provisioned |

Isolated loader (`scripts/load-scenario-lab-env.mjs`) confirmed the same identity and refused DEV/TEST collision before provisioning.

## Provision command

`MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test` was set in the process environment so `scripts/provision-scenario-lab-database-identity.ts` loads `.env.scenario-lab.local` only (not DEV `.env` / `.env.local`).

```bash
MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test \
  pnpm scenario-lab:provision-db-identity -- \
  --confirm-nonproduction \
  --label "Scenario Lab TEST"
```

Observed output (no secrets):

```text
[scenario-lab] provisioning identity kind=scenario_lab_test database=neondb label=Scenario Lab TEST
[scenario-lab] database environment identity provisioned
```

Datasource host reported by Prisma during prior lab operations: `ep-lucky-hall-av5j542n.c-11.us-east-1.aws.neon.tech`.

## Post-provision verification

```bash
pnpm scenario-lab:verify-database
```

Verify script reported:

```text
identity sentinel: id=singleton kind=scenario_lab_test label=Scenario Lab TEST
applied migrations on Scenario Lab DB: 30
pending migrations to apply: 0
differs from DEV: yes
differs from integration TEST: yes
```

Additional read-only checks:

| Check | Result |
| --- | --- |
| Identity row count | **1** |
| Row id | `singleton` |
| Kind | `scenario_lab_test` |
| Label | `Scenario Lab TEST` |
| Stored token matches configured token | **yes** (compared via hash fingerprints; values not displayed or recorded) |
| Migrations finished / unfinished | **30 / 0** |
| Public tables | **48** |
| Non-empty tables | `_prisma_migrations` (30), `database_environment_identity` (1) only |
| Application/customer data created | **no** |

## Issues / notes

- Provisioning script selects `.env.scenario-lab.local` only when `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test` is already set in the process environment before dotenv load. Invocations should set that variable explicitly (as done here).
- No passwords, connection strings, or identity token values are recorded in this document.

## Explicitly not done

- Organization / venue seeding
- Browser Scenario Lab runs
- Vercel deploy
- Any writes to DEV, integration TEST, or production databases
