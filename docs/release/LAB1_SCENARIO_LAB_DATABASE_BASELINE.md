# LAB1 — Scenario Lab database migration baseline

**Status:** Complete — migration history baselined; identity sentinel still unprovisioned  
**Date:** 2026-10-17  
**Target branch:** Neon `scenario_lab`  
**Verified endpoint:** `ep-lucky-hall-av5j542n.c-11.us-east-1.aws.neon.tech/neondb`

## Summary

The Scenario Lab Neon branch was created as **schema-only**: 48 public tables existed, but `_prisma_migrations` was empty. After schema compatibility checks, all **30** committed Prisma migrations were marked applied with `prisma migrate resolve --applied` (no DDL executed). Final verification shows **30 applied / 0 pending**. The database identity sentinel was **not** provisioned.

## Phase 1 — Schema compatibility

### Identity verification

Command:

```bash
pnpm scenario-lab:verify-database
```

Results (pre-baseline):

| Check | Result |
| --- | --- |
| Pooled host | `ep-lucky-hall-av5j542n-pooler.c-11.us-east-1.aws.neon.tech` |
| Direct host | `ep-lucky-hall-av5j542n.c-11.us-east-1.aws.neon.tech` |
| Identity | `ep-lucky-hall-av5j542n.c-11.us-east-1.aws.neon.tech/neondb` |
| Differs from DEV | yes |
| Differs from integration TEST | yes |
| Applied migrations | 0 |
| Pending migrations | 30 |
| Identity sentinel | not provisioned |

### Application data emptiness

All 48 public tables had **zero rows** before baselining (including `organizations`, `user_profiles`, `inquiries`, Scenario Lab tables). No unexpected user/application records.

### Prisma schema comparison

Commands (read-only; `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test` so datasource is `.env.scenario-lab.local`):

```bash
MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test pnpm exec prisma migrate diff \
  --from-config-datasource \
  --to-schema=prisma/schema.prisma \
  --exit-code

MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test pnpm exec prisma migrate diff \
  --from-schema=prisma/schema.prisma \
  --to-config-datasource \
  --script
```

Exit code **2** (diff not empty), but the script contained **only**:

- 18× `RenameForeignKey`
- 13× `RenameIndex`

No `CREATE` / `DROP` / column type changes / table adds/removes.

The same human-readable rename-only diff was produced against the **DEV** database (`LAB_DIFF_IDENTICAL_TO_DEV_DIFF=yes`). These are PostgreSQL 63-character identifier truncation / Prisma naming differences already present on DEV after a normal migrate history — not structural drift unique to Scenario Lab.

### Unsupported / partial comparison areas

| Area | Finding |
| --- | --- |
| `--from-migrations` → live DB | **Not run** — requires `datasource.shadowDatabaseUrl` in `prisma.config.ts` (not configured) |
| Postgres enums | Schema uses string columns; no public enums expected |
| RLS policies | None present |
| Triggers | None present |
| Extensions | `btree_gist`, `plpgsql` present (matches migration `CREATE EXTENSION IF NOT EXISTS btree_gist`) |
| EXCLUDE constraints (GiST) | Present on `resource_reservations`: `resource_reservations_no_overlap`, `resource_reservations_no_overlap_instants` — not fully represented by Prisma datamodel diff |
| Check constraints | `organizations_depositPercent_range` present |

**Phase 1 verdict:** Schema is compatible with the committed migration end-state. Safe to baseline history.

## Phase 2 — Baseline migration history

### Preconditions re-checked

- Target identity contains `ep-lucky-hall-av5j542n`
- `_prisma_migrations` had **0** total / finished / unfinished rows
- Exactly **30** committed migration directories

### Mechanism

Prisma-supported only:

```text
prisma migrate resolve --applied <migration_name>
```

No manual SQL inserts into `_prisma_migrations`. No `migrate deploy`, `migrate reset`, `migrate dev`, or `db push`.

### Exact migrations resolved (chronological)

1. `20260830200000_tenant_foundation`
2. `20260830220000_user_profile_default_location_same_tenant`
3. `20260830221500_user_profile_default_location_restrict`
4. `20260830223000_user_profile_org_membership`
5. `20260831051500_security_groups_and_audit`
6. `20260831060000_user_profile_identity_display`
7. `20260902070000_team_invitations_and_onboarding`
8. `20260906140000_ai_intake_sales_agent`
9. `20260909120000_personal_event_planner`
10. `20260909140000_finite_resource_schedule`
11. `20260909160000_resource_management_schedule`
12. `20260909180000_live_agent_workspace`
13. `20260909200000_confirmed_bookings`
14. `20260916120000_booking_catalog`
15. `20260916180000_phase_3b_holds_booking`
16. `20260920120000_composite_resource_requirements`
17. `20260920140000_pending_bookings`
18. `20260922120000_booking_cancel_inquiry_archive`
19. `20260926180000_product_scheduling_behavior`
20. `20260926200000_inquiry_notification_seen`
21. `20260926210000_inquiry_intake_preferences`
22. `20260927150000_attraction_interests`
23. `20261010120000_product_experience_grants`
24. `20261010140000_package_intake_declarations`
25. `20261010160000_pricing_promotions_weekend_days`
26. `20261010180000_tax_engine_foundation`
27. `20261010190000_operating_hours_guardrails`
28. `20261010200000_operating_hours_staff_exceptions`
29. `20261017180000_scenario_lab_foundation`
30. `20261017200000_scenario_lab_run_lifecycle`

Each command reported `Migration … marked as applied.` against datasource host `ep-lucky-hall-av5j542n.c-11.us-east-1.aws.neon.tech`. No errors; no stop mid-sequence.

## Phase 3 — Post-baseline verification

```bash
pnpm scenario-lab:verify-database
```

| Check | Result |
| --- | --- |
| Applied migrations | **30** |
| Pending migrations | **0** |
| Public tables | **48** (unchanged) |
| Non-empty tables | `_prisma_migrations` only (30 rows) |
| Identity sentinel | **still unprovisioned** (0 rows in `database_environment_identity`) |
| Differs from DEV | yes |
| Differs from integration TEST | yes |

## Commands executed (complete list)

```bash
# Phase 1
pnpm scenario-lab:verify-database
MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test pnpm exec prisma migrate diff \
  --from-config-datasource --to-schema=prisma/schema.prisma --exit-code
MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test pnpm exec prisma migrate diff \
  --from-schema=prisma/schema.prisma --to-config-datasource --script
# (DEV control comparison used default .env datasource — read-only diff only)

# Phase 2 (×30, Scenario Lab env only)
MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test pnpm exec prisma migrate resolve --applied <name>

# Phase 3
pnpm scenario-lab:verify-database
```

## Discrepancies / blockers

- **Cosmetic only:** Prisma `migrate diff` reports 31 rename operations for FK/index identifiers vs `schema.prisma`; identical on DEV. Not a baseline blocker.
- **Shadow DB:** Could not diff `--from-migrations` without configuring `shadowDatabaseUrl`. Mitigated by live↔schema diff + DEV control equality + custom SQL object inspection.
- **No blockers** for baselining.

## Explicitly not done

- Identity sentinel provisioning (`pnpm scenario-lab:provision-db-identity`)
- Venue/org seed
- Browser Scenario Lab runs
- Vercel deploy
- Any changes to DEV, integration TEST, or production databases
