# LAB1 — Scenario Lab Dedicated Git Branch Strategy

**Status:** Audit complete — **STOP** (no branch create, no push, no cherry-pick, no Vercel/DB changes, no deploy).  
**Date:** 2026-10-18  
**Proposed branch:** `scenario-lab-deploy`  
**Related:** `docs/release/LAB1_SCENARIO_LAB_VERCEL_DEPLOYMENT_READINESS.md`

---

## Recommendation (short)

**Do not cherry-pick the eight Scenario Lab commits onto `origin/main`.**

**Do** create `scenario-lab-deploy` from the fully tested **local `main` tip** (`9bf20e3`), push **only that branch**, and point a new Vercel project’s Production Branch at `scenario-lab-deploy`.

That publishes the Lab commit *objects* on GitHub under a non-`main` ref without advancing `origin/main`, so the existing MagicCRM Production deploy (Production Branch = `main`) should not redeploy—**if** Preview builds of other branches are blocked on the existing project (see §6).

Cherry-picking fewer commits is **not** safer: Lab Neon already matches the **30-migration** local tip, and Lab code depends on pre-Lab schema/types/shell/intake work that is also unpushed.

---

## 1. Git divergence and working-tree status

| Item | Value |
| --- | --- |
| Current branch | `main` |
| Local tip (`HEAD`) | `9bf20e3` — *feat: add Scenario Lab navigation entry and enhance UI components* (2026-10-17) |
| `origin/main` tip | `21991fa` — *feat: enhance public intake wizard…* (2026-10-10) |
| GitHub `refs/heads/main` (`git ls-remote`) | **Same as `origin/main`** (`21991fa`) — remote is current relative to the local tracking ref |
| Divergence | `origin/main...HEAD` = **0 behind / 46 ahead** |
| Ancestor check | `origin/main` is an ancestor of `HEAD` (linear history; no divergent remote tip) |
| Working tree | Clean except **one untracked** file: `docs/release/LAB1_SCENARIO_LAB_VERCEL_DEPLOYMENT_READINESS.md` |
| Uncommitted Scenario Lab application code | **None** (Lab nav/auth/scripts are already in `9bf20e3` and parents) |
| Untracked after this audit | Also this strategy doc once written |

### Local-only commits (chronological, oldest → newest)

| # | Hash | Date | Subject |
| --- | --- | --- | --- |
| 1 | `ff52911` | 2026-10-10 | feat: add product experience grants and enhance inquiry validation |
| 2 | `846aca7` | 2026-10-10 | feat: introduce pricing promotions model and enhance pricing logic |
| 3 | `e2c4561` | 2026-10-10 | feat: add preflight scripts for pricing promotions and scenarios |
| 4 | `a4c6789` | 2026-10-10 | test: add unit test for availability status handling in PublicEventPlanView |
| 5 | `674f061` | 2026-10-10 | test: improve unit tests for public event plan view and availability status |
| 6 | `9809a98` | 2026-10-10 | feat: add tax management models and integrate tax configuration into event planning |
| 7 | `3e7e143` | 2026-10-10 | test: add unit tests for tax calculation scenarios and tenant date/time handling |
| 8 | `c2e3338` | 2026-10-10 | feat: add operating hours management models and enhance booking validation |
| 9 | `473d935` | 2026-10-10 | feat: implement operating hours staff exceptions and enhance booking validation |
| 10 | `071b6c4` | 2026-10-10 | refactor: enhance hours exception handling and booking validation |
| 11 | `d0f7dd8` | 2026-10-10 | feat: integrate confirmation readiness into inquiry detail and booking actions |
| 12 | `b8395bf` | 2026-10-10 | feat: implement staff proposal HOLD operations and readiness workflow |
| 13 | `7906012` | 2026-10-10 | feat: document SBF3 end-to-end staff booking journey and operational workflow |
| 14 | `a0bf2c3` | 2026-10-10 | feat: introduce UX1 design documentation and roadmap |
| 15 | `c73cdbf` | 2026-10-10 | feat: enhance employee shell navigation and UI components |
| 16 | `efa9304` | 2026-10-10 | feat: enhance staff booking experience with new UI components and readiness logic |
| 17 | `a99f8af` | 2026-10-10 | feat: enhance public customer experience with new UI components and layout adjustments |
| 18 | `e099f42` | 2026-10-10 | feat: enhance admin UI components and layout for improved user experience |
| 19 | `c53e08a` | 2026-10-10 | feat: integrate Playwright for end-to-end testing and enhance UI conventions |
| 20 | `9d453ee` | 2026-10-10 | feat: overhaul customer intake experience with new journey and draft persistence |
| 21 | `bdc996a` | 2026-10-10 | feat: enhance public intake journey with new tests and UI adjustments |
| 22 | `56d1277` | 2026-10-10 | feat: enhance public intake journey with new tests and UI adjustments |
| 23 | `049ee49` | 2026-10-10 | feat: implement marketing homepage with new design and functionality |
| 24 | `c972fbd` | 2026-10-11 | chore: update .gitignore to exclude Playwright fixture files |
| 25 | `a12087d` | 2026-10-11 | chore: update .gitignore to exclude Playwright fixture files |
| 26 | `93069a8` | 2026-10-11 | feat: update UX screenshots and enhance marketing hero styles |
| 27 | `085bcfd` | 2026-10-11 | feat: implement authenticated staff scenarios and enhance Playwright testing infrastructure |
| 28 | `6909321` | 2026-10-11 | feat: implement AUTH1 authentication transition and enhance loading experience |
| 29 | `a61f8f7` | 2026-10-11 | refactor: update Playwright staff authentication bootstrap… |
| 30 | `f96d673` | 2026-10-11 | feat: enhance Playwright testing and accessibility for authenticated staff scenarios |
| 31 | `01be1c2` | 2026-10-11 | feat: add R4 visual QA documentation and enhance Playwright testing… |
| 32 | `674a2ea` | 2026-10-11 | feat: add R5 venue lifecycle verification and enhance Playwright testing |
| 33 | `0b449eb` | 2026-10-11 | feat: add R6 navigation evidence capture script to Playwright testing |
| 34 | `19d0ca5` | 2026-10-11 | feat: introduce R6 mutation consistency and workflow hardening documentation |
| 35 | `1f0c0c9` | 2026-10-17 | feat: enhance booking detail and inquiry workspace components |
| 36 | `5cdcf20` | 2026-10-17 | feat: enhance booking detail and inquiry workspace components |
| 37 | `eb0b3f9` | 2026-10-17 | chore: update multiple evidence screenshots and enhance booking confirmation tests |
| 38 | `391b235` | 2026-10-17 | feat: enhance configuration and testing for improved user experience (R9) |
| 39 | `304bc76` | 2026-10-17 | feat: implement Scenario Lab foundation with security and environment configurations |
| 40 | `49717ad` | 2026-10-17 | feat: update Scenario Lab with new run lifecycle and public intake features |
| 41 | `f2a5cb1` | 2026-10-17 | feat: update Scenario Lab with correlation token validation and new documentation |
| 42 | `952f7bb` | 2026-10-17 | feat: introduce Scenario Lab environment configuration and verification scripts |
| 43 | `723c922` | 2026-10-17 | feat: add seed command for Scenario Lab database |
| 44 | `691b5e3` | 2026-10-17 | feat: enhance Scenario Lab with new data validation and UI improvements |
| 45 | `7047fd4` | 2026-10-17 | feat: add support for Scenario Lab with separate build directory and new development command |
| 46 | `9bf20e3` | 2026-10-17 | feat: add Scenario Lab navigation entry and enhance UI components |

**Aggregate delta `origin/main..HEAD`:** ~642 files, +75k / −2.7k lines; **8** new Prisma migrations (22 → 30).

---

## 2. Commit dependency map

### Classification key

| Tag | Meaning |
| --- | --- |
| **LAB** | Required Scenario Lab functionality |
| **SHARED** | Required shared application infrastructure for Lab UX/runtime |
| **ENGINE** | Required security/auth/DB/migration/booking-engine dependency (Lab Neon / seed / full app surface) |
| **OMIT-OK** | Unrelated to Lab runtime; safe to omit *in theory*, but hard to omit via cherry-pick |
| **UNCERTAIN** | Needs investigation if a surgical extract is attempted |

### A. Scenario Lab commits (39–46) — all **LAB** (required)

| Hash | Role |
| --- | --- |
| `304bc76` | LAB1-A foundation: config parse, env guard, authorize, `/scenario-lab` page, identity provisioner, foundation migration + Prisma models, authz tests |
| `49717ad` | LAB1-B: run lifecycle migration/models, dashboard/run UI, actions, claim path, public intake correlation wiring |
| `f2a5cb1` | LAB1-BV: claimable-token hardening, inquiry-service coupling, e2e smoke, staging tests, BV docs |
| `952f7bb` | Isolated Lab env loader, verify/migrate scripts, `.env.scenario-lab.example`, prisma.config Lab path |
| `723c922` | `package.json` `scenario-lab:seed` script only (implementation lands in `691b5e3`) |
| `691b5e3` | Synthetic venue seed service/constants/tests + seed/apply/baseline/identity docs |
| `7047fd4` | `scenario-lab:dev`, `next.config` Lab `distDir`, BV2 docs/evidence, e2e expansion |
| `9bf20e3` | Nav entry + `hasScenarioLabAccess` soft probe + header/mobile/tests + nav doc |

Also required for a complete Lab **documentation** set on the branch (not runtime): commit the currently untracked readiness doc(s) in a follow-up commit before push if desired.

### B. Pre-Lab unpushed commits (1–38) — dependency on Lab

| Range / commits | Classification | Why Lab needs them |
| --- | --- | --- |
| `ff52911` … `473d935` (grants, pricing, tax, operating hours + migrations) | **ENGINE** | Lab Neon baseline includes these migrations. Seed imports `@/types/operating-hours`. Prisma schema on Lab tip is a single chain; omitting them desyncs code vs Lab DB (30 migrations). |
| `071b6c4` … `b8395bf` (hours refactor, confirmation readiness, HOLD) | **ENGINE** / app surface | Lab deploys the **full** MagicCRM app (`/app`, booking, HOLD). Not Lab-template code, but part of the tested tip the Lab DB/schema expects. |
| `c73cdbf` (+ later shell tweaks) | **SHARED** | Introduces `employee-navigation` / shell chrome. **Missing on `origin/main`.** Lab nav (`9bf20e3`) cannot apply cleanly without it. |
| `9d453ee` … `56d1277` (public intake overhaul) | **SHARED** | Lab stages real public inquiries through the intake wizard + correlation hidden field (`49717ad` / `f2a5cb1`). |
| `6909321` (AUTH1) + Clerk/staff shell polish | **SHARED** | Sign-in/loading behavior used by staff Lab sessions. |
| `391b235` (R9) | **SHARED** (partial) | `devIndicators: false` and metadata/`APP_URL` consistency; R9 is the declared baseline before Scenario Lab. Evidence/logs are **OMIT-OK** for runtime. |
| UX docs, screenshots, Playwright R3–R6 evidence, marketing homepage polish | **OMIT-OK** for Lab *runtime* | Harmless if included via full-tip branch; painful to exclude surgically. |
| Duplicate gitignore commits `c972fbd` / `a12087d` | **OMIT-OK** | Noise; included automatically if branching from tip. |

### C. Code dependency evidence (not just messages)

- `origin/main` has **no** `src/lib/ui/employee-navigation.ts` and **no** `scenario-lab` paths.
- Lab seed **imports** `OPERATING_HOURS_VERIFICATION_STATUSES` — requires operating-hours work (`c2e3338` / `473d935`).
- Lab run service uses `listPublicPlannerCatalog` / intake journey helpers rewritten in UX intake commits.
- Lab inquiry claim path patches `inquiry-service.ts`, which also changed heavily in pre-Lab intake commits → cherry-pick conflict risk.
- Lab Neon identity/baseline docs assert **30** applied migrations; `origin/main` has **22**. Deploying a cherry-picked Lab-only tree against the existing Lab Neon would be a schema/code mismatch.

### D. Uncommitted Lab work

| Path | Status |
| --- | --- |
| Application Scenario Lab sources | Committed through `9bf20e3` |
| `docs/release/LAB1_SCENARIO_LAB_VERCEL_DEPLOYMENT_READINESS.md` | **Untracked** (include before push if you want it on the deploy branch) |
| This strategy doc | **New / untracked** after write |

---

## 3. Cherry-pick feasibility

### Exact cherry-pick list (if forced) — **not recommended**

```text
304bc76 49717ad f2a5cb1 952f7bb 723c922 691b5e3 7047fd4 9bf20e3
```

Onto: `origin/main` (`21991fa`).

### Why this fails a “complete, coherent application” test

| Issue | Detail |
| --- | --- |
| Shared-file conflicts | Read-only `git merge-tree` of `304bc76` onto `origin/main` already reports multiple “changed in both” paths (`package.json`, `prisma/schema.prisma`, vitest helpers, etc.). Lab later commits also edit `inquiry-service` / public intake heavily touched pre-Lab. |
| Prisma migration gap | Cherry-pick would add Lab migrations (2) without the six intermediate migrations already applied on Lab Neon → history/code/DB inconsistency. |
| Missing shell infra | Nav entry depends on employee navigation catalog introduced in `c73cdbf`, absent on `origin/main`. |
| Seed / types | Seed needs operating-hours types and catalog/resource models aligned with post-`origin/main` schema. |
| Security risk of “fewer commits” | Easy to drop claimable-token hardening (`f2a5cb1`) or nav soft-probe wiring while keeping a half-ported `/scenario-lab` page. |
| R9 / UX coupling | Lab tip was validated on the R9+UX stack; extracting Lab alone reintroduces an untested hybrid on old intake/shell. |

**Verdict:** Cherry-pick is **unsafe / overly complex**. Safer alternative below.

---

## 4. Risks and omissions

| Risk | If cherry-pick | If branch-from-local-tip |
| --- | --- | --- |
| Lab Neon schema mismatch | **High** | Low (matches 30-migration tip) |
| Broken employee nav / shell | **High** | Low |
| Broken public inquiry staging | **High** | Low |
| Accidentally omit security hardening | **High** | Low (full tip) |
| Existing Production (`main`) redeploys | Avoided if `main` not pushed | Avoided if only `scenario-lab-deploy` is pushed |
| Existing project **Preview** builds Lab branch with **wrong env/DB** | **High** unless filtered | **High** unless filtered (same) |
| Shipping HOLD/booking/UX work to Lab host | N/A / incomplete | Intentional: Lab hosts full app; still fail-closed for Lab routes |
| Large branch vs `main` | Smaller but broken | Large (~46 commits) but coherent |

**Omitted from runtime necessity but present on tip:** marketing screenshots, Playwright evidence binaries, R9 logs — acceptable baggage for isolation strategy.

---

## 5. Recommended branch creation strategy

1. Keep local `main` as-is (do **not** push `main`).
2. Optionally commit untracked Lab docs onto local `main` first (readiness + this strategy), or commit them on the deploy branch after creation — human choice.
3. Create branch from current tip:

   ```bash
   git branch scenario-lab-deploy HEAD
   # or: git switch -c scenario-lab-deploy
   ```

4. Push **only**:

   ```bash
   git push -u origin scenario-lab-deploy
   ```

5. Leave `origin/main` at `21991fa` until an explicit, separate decision to promote Lab/shared work to production `main`.

**What “not pushing the 46 commits on main” means here:** those commits **will** exist on GitHub as ancestors of `scenario-lab-deploy`, but the **`main` ref will not move**, so Production-from-`main` should not rebuild.

---

## 6. Vercel branch / deployment filtering plan

### New project: `magiccrm-scenario-lab`

| Setting | Value |
| --- | --- |
| Git repository | Same (`rzounlom/magic-crm`) |
| Production Branch | **`scenario-lab-deploy`** |
| Auto-deploy Production | On (after env ready) |
| Preview deployments | Prefer **disabled**, or Ignored Build Step so only `scenario-lab-deploy` builds |
| Env | Dedicated Scenario Lab Neon + Clerk TEST + two-user allowlist + `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test` + `SCENARIO_LAB_ENABLED=true` (names only; see readiness doc) |
| Ignored Build Step (recommended) | Skip unless `VERCEL_GIT_COMMIT_REF=scenario-lab-deploy` |

Example Ignored Build Step (Vercel: exit **1** = skip build, exit **0** = continue):

```bash
if [ "$VERCEL_GIT_COMMIT_REF" != "scenario-lab-deploy" ]; then
  echo "Skipping build for branch $VERCEL_GIT_COMMIT_REF"
  exit 1
fi
exit 0
```

### Existing MagicCRM Vercel project (production)

| Setting | Required posture |
| --- | --- |
| Production Branch | Remains **`main`** |
| Do not change Production Branch to Lab | Critical |
| Preview deployments | **Must not** build `scenario-lab-deploy` with production/DEV env, or must no-op |
| Ignored Build Step (recommended) | Build only when ref is `main` |

Example for existing project:

```bash
if [ "$VERCEL_GIT_COMMIT_REF" != "main" ]; then
  echo "Skipping non-main branch $VERCEL_GIT_COMMIT_REF"
  exit 1
fi
exit 0
```

### Manual verification in Vercel (cannot be done from repo)

- [ ] Existing project Production Branch = `main`
- [ ] Existing project Preview policy / Ignored Build Step confirmed
- [ ] New project Production Branch = `scenario-lab-deploy`
- [ ] New project env isolated (Lab Neon, not DEV/TEST/prod)
- [ ] New project does not list `main` as Production
- [ ] Deployment Protection enabled on Lab host if privacy required
- [ ] Clerk TEST allowed origins include Lab host

No `.vercel/project.json` or `vercel.json` in-repo today — all filtering is dashboard-side.

---

## 7. Validation requirements before pushing

Run on the tip that will become `scenario-lab-deploy` (local `main` / future branch tip):

| Check | Purpose |
| --- | --- |
| `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` | Tip still green |
| `pnpm build` | Next production build OK (note Lab `distDir` when kind is set — see readiness doc) |
| Targeted Lab integration | `pnpm test:integration tests/integration/scenario-lab-authorization.test.ts` (and seed/staging suites if time) |
| `pnpm scenario-lab:verify-database` | Lab Neon identity + migration count still 30 / matching tip |
| Confirm no secrets in commits | No `.env.scenario-lab.local` staged |
| Confirm Vercel filters (§6) | **Before** first push of `scenario-lab-deploy` |
| Optional: commit untracked readiness docs | So Lab ops docs travel with the branch |

Do **not** run migrate/seed against DEV/TEST/prod as part of this push.

---

## 8. Step-by-step execution plan (requires explicit approval)

**Do not execute until the user explicitly approves.**

1. **Approve strategy** — branch-from-tip; reject Lab-only cherry-pick.
2. **Configure existing Vercel project** — Ignored Build Step / Preview policy so non-`main` branches do not deploy (especially `scenario-lab-deploy`).
3. **Create new Vercel project** `magiccrm-scenario-lab` — connect same repo; Production Branch `scenario-lab-deploy`; set Lab env vars; Ignored Build Step for other branches; do not deploy yet if auto-deploy can wait until first push.
4. **Clerk TEST** — add future Lab host to allowed origins / redirects.
5. **Optional local commits** — add untracked Lab docs to the tip.
6. **Create branch** — `git branch scenario-lab-deploy HEAD` (or switch -c).
7. **Validate** — §7 commands on that tip.
8. **Push only the branch** — `git push -u origin scenario-lab-deploy` (**not** `git push origin main`).
9. **Confirm** — GitHub: `main` still `21991fa`; `scenario-lab-deploy` at tip. Existing project: no new Production deployment. New project: Production deploy from Lab branch only.
10. **First remote browser test** — per readiness doc §13.
11. **STOP** — no LAB1-C; no merge to `main` unless separately approved.

---

## 9. Stop

This audit did **not**:

- Create or switch branches  
- Cherry-pick, merge, rebase, or rewrite history  
- Push to GitHub  
- Modify Vercel  
- Modify any database  
- Deploy  

**Recommendation stands:** `scenario-lab-deploy` from local tip + Vercel Production Branch isolation + Preview/Ignored Build Step hardening on the existing project.
