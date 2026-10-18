# LAB1 — Scenario Lab Vercel Deployment Readiness Audit

**Status:** Audit complete — **STOP** (no push, no deploy, no Vercel setting changes, no LAB1-C).  
**Date:** 2026-10-17  
**Scope:** Safe plan for a **second, separate** Vercel project dedicated to MagicCRM Scenario Lab.  
**Related:** `docs/release/LAB1_A_SCENARIO_LAB_VERCEL_SETUP.md` (earlier setup sketch; this document is the readiness audit).

---

## Executive verdict

A second Vercel project **can** deploy from the same GitHub repository and `main` branch without changing the existing project’s dashboard settings, **if** each project keeps fully separate environment variables and Neon targets.

**Not ready to deploy today.** Several blockers must be resolved first (see §11). The largest operational risk is that local `main` is **46 commits ahead of `origin/main`**: any push that makes Scenario Lab code available to Vercel will also trigger an automatic redeploy of the **existing** MagicCRM Vercel project.

---

## 1. Current deployment risks

| Risk | Severity | Notes |
| --- | --- | --- |
| Push to `main` redeploys the existing MagicCRM Vercel project | **High** | User-stated: existing project auto-deploys on `main` push. No GitHub Actions in-repo; deploy is Vercel Git integration. |
| Scenario Lab code not on GitHub yet | **High** | Local `main` is 46 commits ahead of `origin/main`. Second project cannot host current Lab features until that history is pushed. |
| Accidental Scenario Lab env on the existing project | **High** | If `SCENARIO_LAB_ENABLED=true` + `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test` + lab DB URLs were ever set on the **existing** project, Lab could activate there. Fail-closed helps only when those vars are absent/wrong. |
| Shared Clerk TEST app domains | **Medium** | Lab and local DEV may share one Clerk TEST application. New Vercel host must be allowlisted in Clerk or sign-in redirects fail. |
| Custom Next.js `distDir` when Lab kind is set | **Medium** | `next.config.ts` sets `distDir: ".next-scenario-lab"` whenever `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test` (intended for local dual-dev). Vercel builds with that env would use a non-default output directory — must be verified on first Lab build. |
| Outbound side effects from full app surface | **Medium** | Lab hosts the whole MagicCRM app (`/app`, public inquiry, Team invites). Not only `/scenario-lab`. Clerk invitations and optional OpenAI can fire if used/configured. |
| No in-repo Vercel project linkage | **Low** | No `.vercel/project.json`, no `vercel.json`, no `.github/workflows`. Cannot accidentally rewrite linkage from this repo; dashboard ownership is external. |

---

## 2. Existing project configuration findings

| Finding | Result |
| --- | --- |
| `.vercel/project.json` | **Absent** — no local Vercel project linkage in the working tree. **Do not create or change one for this audit.** |
| `vercel.json` | **Absent** — Next.js defaults apply (`pnpm build` → `prisma generate && next build`). |
| `.github/workflows` | **Absent** — no CI deploy scripts that could race Vercel. |
| Git remote | `origin` → `https://github.com/rzounlom/magic-crm.git` |
| Branch tracking | Local `main` tracks `origin/main` and is **ahead by 46 commits** (includes Scenario Lab foundation through navigation entry). |
| Existing deploy trigger | Vercel Git integration on `main` (dashboard; not represented in-repo). |
| Middleware | `src/proxy.ts` — Clerk middleware protects `/app/*` only. `/scenario-lab` is **not** redirected to sign-in; unauthorized access is handled by the page loader → `notFound()` (404). |
| Build command | `prisma generate && next build` — does **not** run migrations. |
| Runtime DB | Neon pooled `DATABASE_URL` via Prisma Neon adapter (`src/lib/db/client.ts`). |
| Scenario Lab local launcher | `pnpm scenario-lab:dev` + `.env.scenario-lab.local` — **not** required on Vercel; Vercel env vars replace that file. |

**Existing project (customer / current MagicCRM) expected posture (verify in Vercel dashboard before any push):**

- Must **not** use Scenario Lab Neon URLs.
- Must keep `SCENARIO_LAB_ENABLED` unset or `false`.
- Should set `MAGICCRM_DEPLOYMENT_KIND` to `local_development` or `customer_production` as appropriate — **never** `scenario_lab_test` unless intentionally converting that project (do not).
- Scenario Lab routes may appear in the bundle after push, but the server gate must keep `/scenario-lab` at 404 and hide the nav entry.

---

## 3. Fail-closed security (ordinary DEV and customer production)

Guards are process-env + DB identity; they do **not** trust `NODE_ENV`, request headers, or client flags.

`parseScenarioLabConfig` / `requireScenarioLabAccess` deny when:

1. `MAGICCRM_DEPLOYMENT_KIND=customer_production` → `PRODUCTION_DEPLOYMENT` (even if `SCENARIO_LAB_ENABLED=true`)
2. `SCENARIO_LAB_ENABLED` ≠ `true` → `FEATURE_DISABLED`
3. Deployment kind ≠ `scenario_lab_test` → `INVALID_DEPLOYMENT_KIND` (covers ordinary `local_development`)
4. Clerk LIVE keys → `INVALID_CLERK_INSTANCE`
5. Allowlist / org / DB token invalid → fail closed
6. DB identity sentinel missing/mismatched → fail closed
7. User not allowlisted, wrong active org, or missing `organization.settings.manage` → fail closed

Unauthorized `/scenario-lab` → HTTP 404 via `loadScenarioLabAccessOrNotFound()`.  
Navigation soft probe `hasScenarioLabAccess()` reuses the same gate; entry omitted when denied.

**Implication for the existing Vercel project after a `main` push:** Lab UI code may ship, but Lab must remain inert if Lab enablement vars and Lab DB are not configured there.

---

## 4. Build / runtime compatibility (without `.env.scenario-lab.local`)

| Concern | Finding |
| --- | --- |
| Can Vercel build without the local Lab env file? | **Yes.** Runtime reads `process.env` only. Local loader (`scripts/load-scenario-lab-env.mjs`) is for CLI/dev scripts, not the Next.js server on Vercel. |
| Can Vercel run without `pnpm scenario-lab:dev`? | **Yes.** Use standard `pnpm build` / `pnpm start` (Vercel’s Next.js runtime). |
| Required at build time | At least variables needed for `next build` / Clerk public keys / any pages that touch env. Runtime schema requires `DATABASE_URL` + `APP_URL` when `getEnv()` runs. Set Lab env on the **Scenario Lab** Vercel project for Production (and Preview if used). |
| Migrations on deploy | **Not automatic.** Lab DB is already baselined (30 migrations) and identity-provisioned locally. Future schema changes need explicit `pnpm scenario-lab:migrate-deploy` (or equivalent) against Lab only — **never** as a shared build step that could hit DEV/TEST/prod. |
| Synthetic venue | Already seedable/seeded via Lab scripts against Neon `scenario_lab` — do not re-seed from Vercel build. |
| Custom `distDir` | When `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test` is present at **build** time, output goes to `.next-scenario-lab`. Local dual-dev depends on this. **First Lab Vercel build must confirm** Vercel’s Next.js builder accepts that `distDir`. Preferred pre-deploy code fix (future, not done in this audit): gate custom `distDir` to non-Vercel / explicit local flag (e.g. only when `VERCEL` is unset). |

---

## 5. Proposed second-project configuration

| Setting | Recommendation |
| --- | --- |
| Vercel project name | Distinct, e.g. `magiccrm-scenario-lab` |
| Git repository | Same as existing MagicCRM (`rzounlom/magic-crm`) |
| Production branch | `main` (same branch; **separate env**, separate Neon) |
| Framework | Next.js (auto-detect) |
| Install | pnpm (`packageManager`: `pnpm@11.24.0`) |
| Build | Default / `pnpm build` (`prisma generate && next build`) |
| Output | Next.js default handling (verify if custom `distDir` is active) |
| Root directory | Repository root |
| Production auto-deploy | Enable only **after** env + Clerk domains + existing-project env audit are complete |
| Preview deployments | Optional; if enabled, Preview env must also point at Lab Neon + Lab flags (or disable Preview until ready) |
| Protection | Prefer Vercel Deployment Protection / password or SSO so the Lab host is not public SEO surface |
| Neon | Dedicated Scenario Lab branch already identified as `ep-lucky-hall-av5j542n` (pooled + direct). **Never** point this project at DEV (`ep-bold-art-…`) or integration TEST (`ep-sparkling-bird-…`). |
| Clerk | Clerk **TEST** application (`sk_test_` / `pk_test_`) |

Second project does **not** require a separate Git branch. Isolation is **environment + database**, not branch.

---

## 6. Exact required environment variable names (never values)

### Required on Scenario Lab Vercel project (Production)

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** Scenario Lab connection (runtime) |
| `DIRECT_URL` | Neon **direct** Scenario Lab connection (CLI migrate only; safe to store; unused by Next runtime) |
| `MAGICCRM_DATABASE_ENVIRONMENT_TOKEN` | Must match provisioned `database_environment_identity.token` (min 16 chars) |
| `MAGICCRM_DEPLOYMENT_KIND` | Must be exactly `scenario_lab_test` |
| `SCENARIO_LAB_ENABLED` | Must be exactly `true` |
| `SCENARIO_LAB_ALLOWED_CLERK_USER_IDS` | Exactly two distinct Clerk user IDs (`user_…,user_…`) |
| `SCENARIO_LAB_ORG_ID` | Trusted Clerk TEST organization ID (`org_…`) |
| `CLERK_SECRET_KEY` | Clerk TEST secret (`sk_test_…`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk TEST publishable (`pk_test_…`) |
| `APP_URL` | Canonical https origin of **this** Lab deployment (no trailing path) |

### Recommended Clerk path vars (match `.env.example`)

| Name | Typical value shape |
| --- | --- |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/app` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/app` |

### Must remain unset / disabled on Scenario Lab (outbound / live integrations)

| Name | Guidance |
| --- | --- |
| `QSTASH_TOKEN` | Leave unset (no Upstash outbound) |
| `STRIPE_SECRET_KEY` | Leave unset |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Leave unset |
| `OPENAI_API_KEY` | Prefer unset for first remote test (avoids paid model calls from public inquiry / planner). Optional later for Lab AI scenarios. |
| `OPENAI_SALES_MODEL` | Leave unset unless intentionally testing AI |

### Must **not** be set on the existing (non-Lab) MagicCRM Vercel project

- `SCENARIO_LAB_ENABLED=true`
- `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test`
- Scenario Lab `DATABASE_URL` / `DIRECT_URL`
- Lab-only allowlist / org / DB token (unless that project is intentionally the Lab — it must not be)

### Explicitly not authorization

- Do **not** add `NEXT_PUBLIC_SCENARIO_LAB_*` flags.
- Do **not** put allowlist or DB token in client bundles.

---

## 7. Clerk configuration requirements

Scenario Lab uses the same Clerk session model as `/app`. For a Vercel-hosted Lab domain:

1. **Clerk application:** TEST instance only for initial private QA (`sk_test_` / `pk_test_`). Code rejects LIVE keys for Lab.
2. **Allowed origins / redirect URLs:** Add the Lab production origin (and `*.vercel.app` if using Vercel previews) in the Clerk Dashboard for that TEST application:
   - Sign-in / sign-up redirect URLs
   - Allowed origins / satellite domains as required by Clerk’s current Dashboard UI
3. **`APP_URL`:** Must match the Lab https origin. Used for invitation return URLs (`/accept-invitation`) via `employeeInvitationRedirectUrl`.
4. **Trusted org:** Operators must sign in with `SCENARIO_LAB_ORG_ID` as the **active** Clerk organization.
5. **Allowlisted users:** Exactly the two `user_…` IDs in `SCENARIO_LAB_ALLOWED_CLERK_USER_IDS`, each with MagicCRM `organization.settings.manage` in the seeded Lab tenant.
6. **Do not** point customer-production LIVE Clerk keys at the Lab project.
7. Future option (from LAB1-A): dedicated Clerk staging application for a long-lived external Lab — out of scope for first deploy.

**Local vs remote:** Local Lab (`localhost:3010`) and Vercel Lab are different origins; both must be listed if the same Clerk TEST app serves both.

---

## 8. Outbound notification safeguards

| Channel | Current code posture | Lab guidance |
| --- | --- | --- |
| Plan “email” payload | `personalEventPlanNotification` is built for audit/metadata; no QStash/SMTP/Resend sender found under `src/` | Still suppress via Scenario Lab claimable correlation token path for Lab-staged inquiries; leave mail providers unset |
| In-app inquiry bell | DB-only awareness (`inquiry-notification-service`) | OK — no external send |
| Clerk organization invitations | `inviteEmployee` → Clerk API; Clerk may email invitees | Use TEST Clerk only; avoid inviting real customers from Lab |
| OpenAI | Called when `OPENAI_API_KEY` is set during plan generation | Leave unset for first remote browser test |
| Stripe / QStash | Referenced in env examples; no active QStash usage found in `src/` | Leave unset |
| Public inquiry form | Live against Lab Neon if someone opens `/inquire/<slug>` | Acceptable for Lab QA; use synthetic contacts; Lab correlation token suppresses plan-notification attachment when claimable |

**Hard rule for first deploy:** do not configure live customer email/SMS providers on the Scenario Lab Vercel project.

---

## 9. Same-repo / same-branch dual-project safety

| Question | Answer |
| --- | --- |
| Can a second Vercel project deploy from the same repo + `main`? | **Yes.** Vercel supports multiple projects per repository with independent env vars and domains. |
| Does creating the second project alter the first? | **No**, if created as a new project without changing the first project’s Git/env settings. |
| Does a push affect both? | **Yes, by default** — both Production deployments rebuild when `main` advances (unless one project disables Production auto-deploy or uses an Ignored Build Step). |
| Is a separate Git branch required? | **No** for Lab isolation. Optional later for release staging. |
| Does Lab code on `main` endanger the existing project? | Code presence alone is OK **iff** existing project env stays fail-closed and keeps non-Lab DB URLs. |

---

## 10. Safest first-deployment strategy

Ordered to minimize accidental production impact:

1. **Audit the existing Vercel project env (dashboard only)**  
   Confirm Lab flags are off / absent and DB URLs are not the Scenario Lab Neon branch.

2. **Create the second Vercel project** from the same GitHub repo, but keep **Production auto-deploy disabled** (or do not connect Production domain yet) until env is complete.

3. **Set all Scenario Lab env vars** on the new project (names in §6). Point `DATABASE_URL` / `DIRECT_URL` only at Lab Neon. Set `APP_URL` to the intended Lab host (may use the `*.vercel.app` URL initially).

4. **Configure Clerk TEST** allowed origins / redirects for that host (§7).

5. **Confirm Lab DB readiness from a trusted machine** (no Vercel deploy yet):  
   `pnpm scenario-lab:verify-database` — identity + migrations; venue seed already applied if LAB1 seed docs are current.

6. **Resolve code blockers** in §11 (especially `distDir` gating if first build fails; and decide how to push 46 commits safely).

7. **Push `main` only when ready for both projects to rebuild**, or temporarily disable Production deploys on the **existing** project for that push window, then re-enable after health check.

8. **Trigger / allow the first Scenario Lab Production deployment.** Confirm build succeeds.

9. **Run the remote browser verification plan** (§12).

10. **Do not** start LAB1-C, HOLD, booking conflict scenarios, or customer-production cutover from this deploy.

---

## 11. Explicit blockers requiring resolution before deployment

| # | Blocker | Owner action |
| --- | --- | --- |
| B1 | **46 unpushed commits** on local `main` vs `origin/main` | Decide push window; expect existing Vercel project to redeploy. |
| B2 | **Existing Vercel project env not verified in this audit** (dashboard not accessible from repo) | Manually confirm Lab flags off and non-Lab DB URLs before push. |
| B3 | **Second Vercel project does not exist yet** | Create manually; do not reuse the existing project. |
| B4 | **Clerk allowed origins for the future Lab domain** not configured | Add Lab host to Clerk TEST before expecting sign-in. |
| B5 | **Custom `distDir` on Lab builds** | Verify first Vercel build with `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test`, or land a small pre-deploy fix to skip custom `distDir` when `VERCEL=1`. |
| B6 | **`APP_URL` unknown until Lab host is assigned** | Set after first Vercel URL or custom domain is chosen; update Clerk redirects to match. |
| B7 | **No deploy authorization in this task** | Explicit human decision required to push and to enable Production deploy. |

Non-blockers (already done locally for Lab Neon, per prior LAB1 docs):

- Dedicated Neon Scenario Lab branch exists  
- Migrations baselined (30 applied)  
- Identity sentinel provisioned  
- Synthetic venue seed available / applied (per seed verification docs)  
- Server-side Lab authorization + nav soft probe implemented  

---

## 12. Manual Vercel setup checklist

- [ ] Verify existing MagicCRM Vercel project: no Lab DB URLs; `SCENARIO_LAB_ENABLED` not `true`; kind ≠ `scenario_lab_test`
- [ ] Create new Vercel project from the same GitHub repo; distinct name
- [ ] Leave Production auto-deploy off until env + Clerk are ready (recommended)
- [ ] Set all required env vars (§6) on the **new** project only
- [ ] Leave `QSTASH_TOKEN`, Stripe, and (initially) `OPENAI_API_KEY` unset
- [ ] Set `APP_URL` to the Lab https origin
- [ ] Add Lab origin to Clerk TEST redirect URLs / allowed origins
- [ ] Confirm allowlisted users can activate `SCENARIO_LAB_ORG_ID` in Clerk
- [ ] Re-verify Lab Neon identity from a trusted machine (`pnpm scenario-lab:verify-database`)
- [ ] Decide push strategy for the 46 local commits (existing project will rebuild)
- [ ] Enable / trigger first Lab Production deploy
- [ ] Confirm build logs show successful Next.js compile and `/scenario-lab` route
- [ ] Enable Deployment Protection if the Lab host should stay private
- [ ] Run §13 verification
- [ ] Document Production URL in an ops note (not secrets)

---

## 13. Verification plan — first remote browser test

Perform only after the Lab Vercel deployment is live and Clerk domains are configured.

### Positive path (allowlisted admin A, trusted org active)

1. Open `APP_URL` /sign-in on the **Lab** host (not the existing MagicCRM host).
2. Sign in with allowlisted admin A; set active org to `SCENARIO_LAB_ORG_ID`.
3. From `/app`, confirm **Scenario Lab** appears under Settings (desktop) and More → Settings (mobile).
4. Open `/scenario-lab` via the nav entry; confirm Lab dashboard loads (safe DB label, not secrets).
5. Optional smoke: create a Lab run and stage a synthetic inquiry (no LAB1-C expansion).

### Second allowlisted admin

6. Repeat sign-in as admin B with the trusted org; confirm nav + `/scenario-lab` succeed.

### Negative path

7. Wrong active org → no Scenario Lab nav; direct `/scenario-lab` → 404.  
8. Non-allowlisted user (if available) → 404 / no nav.  
9. On the **existing** MagicCRM deployment: `/scenario-lab` → 404; no Scenario Lab nav.  
10. Confirm Lab pages never display connection strings, tokens, or secret keys.

### Outbound sanity

11. Confirm Vercel Lab env has no QStash/Stripe/live mail providers.  
12. Avoid Team invites to real customer emails during the first test.

---

## 14. Stop

This audit does **not**:

- Push to GitHub  
- Deploy either Vercel project  
- Modify existing Vercel project settings  
- Change database schemas or data  
- Start LAB1-C  

Next authorized step (human decision): resolve blockers B1–B7, then perform the manual checklist and first remote browser test.
