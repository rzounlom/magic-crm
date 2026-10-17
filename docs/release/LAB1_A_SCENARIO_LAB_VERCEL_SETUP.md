# LAB1-A — Scenario Lab Vercel project setup (manual)

This guide prepares a **future** private Scenario Lab deployment. It does **not** deploy anything.

Architecture: same GitHub repository, **no separate Git branch required**.

| Surface | Vercel project | Database | Clerk | Scenario Lab |
| --- | --- | --- | --- | --- |
| Local development | n/a | Neon DEV | TEST (local) | Disabled by default |
| Private Scenario Lab | **New** project from same repo | Dedicated Neon Scenario Lab branch/DB | Clerk **TEST** (initial QA) | Enabled |
| Future customer production | Separate project | Production Neon | Clerk **LIVE** | **Disabled** |

`NODE_ENV=production` alone must never be treated as customer production. A Vercel Production build may host the private Scenario Lab TEST deployment.

---

## 1. Create the second Vercel project

1. In Vercel, **Add New Project** → import the **same** GitHub repository as local MagicCRM.
2. Name it distinctly (for example `magiccrm-scenario-lab`).
3. Use the default Next.js build (`pnpm build` / repo defaults).
4. Do **not** point customer production at this project.
5. Optional: deploy only from `main` (same branch as local work). A separate Git branch is not required.

## 2. Dedicated Neon Scenario Lab database

1. In Neon, create a **new branch** (or project) reserved for Scenario Lab.
2. Do **not** reuse the local DEV endpoint or the integration TEST endpoint as the long-lived Scenario Lab target if you need hard isolation from day-to-day fixtures.
3. Copy the pooled `DATABASE_URL` and direct `DIRECT_URL` into the Scenario Lab Vercel project only.
4. Apply committed migrations with Prisma migrate deploy using that database’s `DIRECT_URL` / `DATABASE_URL` (never against customer production).

## 3. Provision the database identity sentinel

Scenario Lab will not enable against an unlabeled database.

From a trusted machine, with Scenario Lab DB URLs loaded and:

```bash
export MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test
export MAGICCRM_DATABASE_ENVIRONMENT_TOKEN="<long-random-token-min-16-chars>"
export DATABASE_URL="<scenario-lab-pooled-url>"

pnpm scenario-lab:provision-db-identity -- --confirm-nonproduction --label "Scenario Lab TEST"
```

Rules:

- Requires `--confirm-nonproduction`.
- Refuses `MAGICCRM_DEPLOYMENT_KIND=customer_production`.
- Never auto-runs from app boot.
- Never seeds an unknown database without the explicit confirmation flag.

Store the same token in Vercel as `MAGICCRM_DATABASE_ENVIRONMENT_TOKEN`.

## 4. Clerk TEST for initial private QA

1. Use a Clerk **TEST** application (`sk_test_` / `pk_test_`).
2. Set on the Scenario Lab Vercel project:
   - `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - Sign-in / sign-up URLs as in `.env.example`
3. Create or select one Clerk organization that will be the trusted Scenario Lab org.
4. Invite exactly the two administrators who will operate the lab.

### Future option: dedicated Clerk staging app

If the private Scenario Lab becomes a long-lived externally hosted environment, create a separate production-grade Clerk **staging** application (still non-LIVE customer keys) instead of sharing day-to-day TEST keys. Reconfigure the Scenario Lab Vercel project to that app’s keys and re-allowlist the two user IDs from that instance. Customer production continues to use Clerk LIVE with Scenario Lab disabled.

## 5. Exactly two allowed users

1. In Clerk, copy the two administrators’ user IDs (`user_…`).
2. Set:

```bash
SCENARIO_LAB_ALLOWED_CLERK_USER_IDS=user_aaa,user_bbb
```

Requirements enforced by code:

- Exactly two distinct IDs
- Must be Clerk user IDs (not emails)
- Allowlist is server-only (never `NEXT_PUBLIC_*`)

## 6. Trusted TEST organization

Set:

```bash
SCENARIO_LAB_ORG_ID=org_xxxxxxxx
```

This is the Clerk organization ID. The signed-in user’s **active** organization must match. Belonging to another org, even as an allowlisted user, is denied.

## 7. Scenario Lab enablement flags

On the Scenario Lab Vercel project only:

```bash
MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test
SCENARIO_LAB_ENABLED=true
MAGICCRM_DATABASE_ENVIRONMENT_TOKEN=<same as provisioned>
SCENARIO_LAB_ALLOWED_CLERK_USER_IDS=user_a,user_b
SCENARIO_LAB_ORG_ID=org_trusted
APP_URL=https://<scenario-lab-host>
DATABASE_URL=...
DIRECT_URL=...
```

On customer production:

```bash
MAGICCRM_DEPLOYMENT_KIND=customer_production
SCENARIO_LAB_ENABLED=false
# Omit Scenario Lab allowlist / token / org id
```

## 8. Verify database identity

After deploy (future):

1. Sign in as an allowlisted admin with the trusted org active.
2. Open `/scenario-lab`.
3. Confirm the page shows the safe label (for example `Scenario Lab TEST`) and `verified`.
4. Confirm the page never shows connection strings, tokens, or secret keys.

Negative checks:

- Wrong token → 404
- Unprovisioned sentinel → 404
- `MAGICCRM_DEPLOYMENT_KIND=customer_production` → 404 even if `SCENARIO_LAB_ENABLED=true`

## 9. Disable external customer notifications

Until LAB phases that stage fixtures intentionally:

1. Do not configure live customer email/SMS providers on the Scenario Lab project (leave `QSTASH_TOKEN` / outbound providers unset).
2. Prefer Clerk TEST so invitation emails stay in the TEST instance.
3. Do not point Scenario Lab `APP_URL` at a customer-facing production domain.

## 10. Prove production cannot access Scenario Lab

On a customer-production-shaped env (local simulation or future prod project):

```bash
MAGICCRM_DEPLOYMENT_KIND=customer_production
SCENARIO_LAB_ENABLED=true   # even if mistakenly enabled
```

Expected: Scenario Lab config parse fails with `PRODUCTION_DEPLOYMENT`; `/scenario-lab` returns 404.

Automated coverage: unit + integration tests in LAB1-A assert this without deploying.

## Remaining manual work (not done by LAB1-A)

- Create the Vercel project
- Create the Neon Scenario Lab branch
- Provision the identity sentinel
- Configure Clerk users/org
- Deploy (explicitly out of scope for LAB1-A)
