# LAB1-BV — Manual Scenario Lab browser setup checklist

Live browser verification is **blocked** until these items are completed. Do not bypass LAB1-A guards.

## Blocker summary

Local `.env` currently has Clerk TEST keys and Neon DEV (`ep-bold-art-…`) but **does not** set:

- `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test`
- `SCENARIO_LAB_ENABLED=true`
- `SCENARIO_LAB_ALLOWED_CLERK_USER_IDS` (exactly two `user_…` IDs)
- `SCENARIO_LAB_ORG_ID` (`org_…`)
- `MAGICCRM_DATABASE_ENVIRONMENT_TOKEN`
- A provisioned `database_environment_identity` singleton on the target DB

There is no dedicated `.env.scenario-lab` and no confirmed dedicated Neon Scenario Lab branch in this workspace. The shared integration TEST DB (`ep-sparkling-bird-…`) must **not** be reused for browser walks.

## Checklist

1. **Create a dedicated Neon Scenario Lab branch** (preferred) — not DEV day-to-day data, not integration TEST.
2. Confirm the exact pooled/direct URLs and that the target is nonproduction.
3. Apply migrations: `prisma migrate deploy` against that database only.
4. Choose a long random `MAGICCRM_DATABASE_ENVIRONMENT_TOKEN` (≥16 chars).
5. Provision identity (explicit confirmation required):

```bash
export MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test
export MAGICCRM_DATABASE_ENVIRONMENT_TOKEN="<token>"
export DATABASE_URL="<scenario-lab-pooled-url>"
pnpm scenario-lab:provision-db-identity -- --confirm-nonproduction --label "Scenario Lab TEST"
```

6. In Clerk TEST, identify the trusted organization id and exactly two administrator user ids.
7. Configure local env (or `.env.scenario-lab` loaded only for lab browser runs) with:
   - `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test`
   - `SCENARIO_LAB_ENABLED=true`
   - `SCENARIO_LAB_ALLOWED_CLERK_USER_IDS=user_a,user_b`
   - `SCENARIO_LAB_ORG_ID=org_…`
   - `MAGICCRM_DATABASE_ENVIRONMENT_TOKEN=<same token>`
   - Scenario Lab `DATABASE_URL` / `DIRECT_URL`
   - Clerk TEST keys
   - `APP_URL=http://localhost:3000`
8. Ensure the trusted org is ACTIVE with a primary location and ≥1 public attraction interest.
9. Sign in as an allowlisted admin with that org active, then open `/scenario-lab`.

Do **not** invent IDs, copy real customer records, or auto-label an unknown database as TEST.
