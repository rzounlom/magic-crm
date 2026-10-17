# LAB1 — Scenario Lab synthetic organization & venue seed

**Status:** Applied — see `LAB1_SCENARIO_LAB_SEED_APPLY_VERIFICATION.md`  
**Date:** 2026-10-17  
**Target endpoint:** `ep-lucky-hall-av5j542n.c-11.us-east-1.aws.neon.tech/neondb`  
**Database label:** Scenario Lab TEST  

## Mission

Prepare the dedicated Neon Scenario Lab database with one fictional TEST organization, one location, two allowlisted staff administrators, and a minimal public-inquiry catalog — without copying real venue data and without executing the seed until approved.

## Exact database target

| Check | Value |
| --- | --- |
| Neon branch | `scenario_lab` |
| Endpoint | `ep-lucky-hall-av5j542n` |
| Identity | `ep-lucky-hall-av5j542n.c-11.us-east-1.aws.neon.tech/neondb` |
| Differs from DEV / integration TEST | yes (isolated loader) |
| Deployment kind | `scenario_lab_test` |
| Identity sentinel | `singleton` / `scenario_lab_test` / label `Scenario Lab TEST` |
| Migrations | 30 applied / 0 pending |
| Clerk TEST org (trusted) | configured via `SCENARIO_LAB_ORG_ID` (verified present in Clerk; 2 memberships) |
| Allowlisted users | exactly 2 (verified members of trusted Clerk org) |

## Command

```bash
# Dry-run (default — no writes)
pnpm scenario-lab:seed

# Apply (requires explicit confirmation)
pnpm scenario-lab:seed -- --confirm SEED
```

Implementation:

| Path | Role |
| --- | --- |
| `src/server/scenario-lab/synthetic-venue-constants.ts` | Deterministic TEST slugs / offerings / endpoint guard |
| `src/server/scenario-lab/synthetic-venue-seed.ts` | Idempotent plan + apply |
| `scripts/seed-scenario-lab-venue.ts` | Isolated env loader, Clerk checks, dry-run/apply CLI |
| `package.json` → `scenario-lab:seed` | Entry point |

## Records proposed for creation

From the verified dry-run on `ep-lucky-hall-av5j542n`:

| Action | Entity | Detail |
| --- | --- | --- |
| create | organization `magiccrm-scenario-lab` | MagicCRM Scenario Lab TEST → trusted Clerk org |
| create | location `main` | **MagicCRM Scenario Lab Center** (`America/Chicago`) |
| ensure | security defaults | Permission definitions + system groups |
| create | user_profile ×2 | Both allowlisted Clerk users → Administrators |
| ensure | product_category `lab-entertainment` | TEST Entertainment |
| ensure | catalog `lab-bowling` | TEST Bowling + 4 lanes @ $15/guest |
| ensure | catalog `lab-arcade` | TEST Arcade + 2 bays @ $12/guest |
| ensure | catalog `lab-party-room` | TEST Party Room Rental + 2 rooms @ $250 fixed |
| ensure | operating hours | Sun–Sat 10:00–20:00 VERIFIED (synthetic QA note) |

Synthetic contact (documented only — `Location` has no address columns):

- 100 Test Lane, Suite LAB, Exampleville, TX 00000  
- +1-555-0100 / scenario-lab@example.com  

## Synthetic venue configuration

- All product / interest / resource-type slugs use the `lab-` prefix.
- Names and notes are explicitly labeled **TEST**.
- Operating hours note: `Scenario Lab TEST synthetic operating hours — NOT a real venue.`
- Resource metadata notes mark units as synthetic.
- No Generations / real-venue hours, pricing, or inventory copied.
- No customer inquiries, bookings, or scenario runs created.

## Staff and permission mapping

1. Map `SCENARIO_LAB_ORG_ID` → MagicCRM `Organization.clerkOrganizationId`.
2. Create/reuse `UserProfile` for each of the two allowlisted Clerk user IDs.
3. `ensureDefaultSecurityGroups` + upsert both profiles into the system **Administrators** group (`organization.settings.manage`).
4. No third administrator is created.
5. Clerk IDs are never invented — only the configured allowlist is used.

## Idempotency design

- Organization keyed by `clerkOrganizationId` (reuse if present).
- Location keyed by `(organizationId, slug=main)`.
- Catalog entities keyed by deterministic `lab-*` slugs (create-if-missing; reactivate if inactive).
- Resources only **add** missing `displayOrder` units — never delete inventory.
- Operating-hours windows created only when the policy has zero windows (does not wipe operator-edited windows on rerun).
- Never deletes `scenario_lab_runs` / owned entities.
- Refuses if slug `magiccrm-scenario-lab` is owned by a different Clerk org.
- Does not overwrite unrelated operator-renamed org/location names (only renames seed-owned / default “Main Location” names).

## Dry-run results

Executed:

```bash
pnpm scenario-lab:seed
```

Outcome:

- mode: **DRY-RUN**
- target identity confirmed `ep-lucky-hall-av5j542n…/neondb`
- Clerk trusted org found; 2 memberships match allowlist
- 30 migrations baseline OK
- Plan printed (see table above)
- **No database writes**

## Approval required before first seed execution

Do **not** run `pnpm scenario-lab:seed -- --confirm SEED` until the operator explicitly approves this dry-run.

## Manual configuration required

Already expected in `.env.scenario-lab.local` (gitignored):

- Neon `DATABASE_URL` / `DIRECT_URL` for `scenario_lab`
- `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test`
- `SCENARIO_LAB_ENABLED=true`
- Clerk TEST keys
- Exactly two `SCENARIO_LAB_ALLOWED_CLERK_USER_IDS`
- `SCENARIO_LAB_ORG_ID`
- `MAGICCRM_DATABASE_ENVIRONMENT_TOKEN` matching the provisioned sentinel

Both allowlisted users must already be members of the trusted Clerk TEST organization (verified by the seed CLI against Clerk).

## Tests

| Suite | Coverage |
| --- | --- |
| `tests/unit/scenario-lab-synthetic-venue-seed.test.ts` | Endpoint refuse DEV/unknown; managed `lab-` offerings |
| `tests/integration/scenario-lab-synthetic-venue-seed.test.ts` | Dry-run no writes; apply + idempotency; two admins + LAB1-A auth; venue readiness; slug conflict refuse; no extra tenant |

### Validation results (this phase)

| Command | Result |
| --- | --- |
| `pnpm exec tsc --noEmit` | pass |
| `pnpm test:unit` | pass (643 tests) |
| `pnpm test:integration tests/integration/scenario-lab-synthetic-venue-seed.test.ts` | pass (3 tests) |
| `pnpm lint` | pass (0 errors; 1 pre-existing warning in unrelated script) |
| `pnpm build` | pass |
| `pnpm scenario-lab:seed` (dry-run) | pass — no writes |

## Explicitly not done

- First seed **apply** (waiting for approval)
- Browser Scenario Lab scenarios
- Vercel deploy
- Customer/org data migration from DEV
