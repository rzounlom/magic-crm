# LAB1 — Scenario Lab synthetic venue seed apply verification

**Status:** Complete — seed applied and verified on dedicated Scenario Lab Neon  
**Date:** 2026-10-17  
**Target:** `ep-lucky-hall-av5j542n.c-11.us-east-1.aws.neon.tech/neondb`  
**Authorization:** Operator-approved dry-run in `LAB1_SCENARIO_LAB_SYNTHETIC_VENUE_SEED.md`

## Pre-apply checks

| Check | Result |
| --- | --- |
| `pnpm scenario-lab:verify-database` | pass |
| Deployment kind | `scenario_lab_test` |
| Sentinel | `singleton` / `scenario_lab_test` / **Scenario Lab TEST** |
| Endpoint | `ep-lucky-hall-av5j542n` (pooled + direct) |
| Differs from DEV / integration TEST | yes |
| Migrations | 30 applied / 0 pending |
| Allowlisted Clerk users | exactly 2 (Clerk membership verified) |
| Dry-run plan vs reviewed doc | match (create org/location/2 profiles + ensure catalog/hours) |

No material plan changes → proceed.

## Execute

```bash
MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test \
  pnpm scenario-lab:seed -- --confirm SEED
```

Apply result (safe ids only):

| Field | Value |
| --- | --- |
| organizationId | `tf95x2m37d3kfgvwmtnyhnkv` |
| locationId | `amrjy2jbq3h0wtffwvj8agre` |
| staff profiles | 2 |
| attraction interests | 3 |
| venueReady | **true** |

## Records created

| Record | Outcome |
| --- | --- |
| Organization `magiccrm-scenario-lab` / MagicCRM Scenario Lab TEST | created, `ACTIVE`, mapped to trusted Clerk TEST org |
| Location `main` / **MagicCRM Scenario Lab Center** | created, active, `America/Chicago` |
| System security groups + permissions | ensured |
| User profiles for both allowlisted Clerk users | created |
| Administrators membership ×2 (`organization.settings.manage`) | ensured |
| Category `lab-entertainment` | created |
| Products `lab-bowling`, `lab-arcade`, `lab-party-room` | created |
| Attraction interests (3) | created + linked |
| Resources | 4 bowling lanes, 2 arcade bays, 2 party rooms |
| Operating hours | VERIFIED, 7 weekly windows (10:00–20:00), synthetic QA note |

No inquiries, bookings, or scenario runs were created.

## Post-apply verification

| # | Check | Result |
| --- | --- | --- |
| 1 | Exactly one MagicCRM organization | **pass** (count=1, slug `magiccrm-scenario-lab`) |
| 2 | Exactly one primary location | **pass** (`main` / MagicCRM Scenario Lab Center) |
| 3 | Both allowlisted admins + `organization.settings.manage` | **pass** (2 admin members; permission present) |
| 4 | Bowling / arcade / party-room offerings | **pass** |
| 5 | Resource inventory + synthetic hours | **pass** (4/2/2 units; VERIFIED + 7 windows) |
| 6 | Public inquiry catalog available | **pass** (3 attractions via planner catalog) |
| 7 | No inquiries / bookings / scenario runs from seed | **pass** (0 / 0 / 0) |
| 8 | No unrelated orgs or users | **pass** (1 org, 2 profiles total) |
| 9 | Migrations still 30 / 0 pending | **pass** |
| 10 | DEV / integration TEST untouched | **pass** (identity mismatch retained) |

### Post-apply dry-run

```bash
pnpm scenario-lab:seed
```

Plan now shows **reuse** for organization and both user profiles, and **ensure** for catalog/hours/security — no unexpected additional create actions for new tenants or third admins.

## Warnings

- None blocking.
- Post-apply dry-run still labels catalog/hours as `ensure` (idempotent ensure semantics), not as new creates.
- Clerk directory org display name remains “MagicCRM Test Center B”; MagicCRM org name is the synthetic **MagicCRM Scenario Lab TEST** label.

## Browser walkthrough readiness

| Prerequisite | Status |
| --- | --- |
| Scenario Lab DB + identity | ready |
| Trusted org + two admins | ready |
| Venue / public catalog | ready (`venueReady: true`) |
| Local app env pointed at Scenario Lab | operator must run Next against `.env.scenario-lab.local` (not done in this phase) |
| Inquiry scenarios / LAB1-C | **not started** |

**Verdict:** Database side is ready for a real browser walkthrough once the local (or private) app process loads the Scenario Lab environment. No Vercel deploy; no inquiry scenarios executed in this phase.

## Explicitly not done

- Vercel deploy
- LAB1-C
- Browser inquiry / scenario runs
