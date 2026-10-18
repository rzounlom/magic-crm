# LAB1 — Scenario Lab Deploy Branch Validation

**Status:** Complete — **STOP** (local branch created and validated; **no push**, **no deploy**).  
**Date:** 2026-10-18  
**Strategy:** `docs/release/LAB1_SCENARIO_LAB_DEDICATED_BRANCH_STRATEGY.md`  
**Readiness:** `docs/release/LAB1_SCENARIO_LAB_VERCEL_DEPLOYMENT_READINESS.md`

---

## 1. Preconditions

| Check | Result |
| --- | --- |
| Local `main` tip | **`9bf20e37be0e9693d1c93f2b8da4e485c17fda37`** — matches audited tip |
| `origin/main` | **`21991faee1f6e1fa9985e7d862ea025cc14bb966`** — matches audited baseline |
| GitHub `refs/heads/main` | Same as `origin/main` (`21991fa`) |
| Existing Vercel `magic-crm` skips `scenario-lab-deploy` builds | **Operator-reported only** — this validation did **not** independently verify the Vercel dashboard |
| Working tree | Clean aside from known untracked docs (see §2) |
| Secret files tracked/staged | **None.** Tracked env files are examples only (`.env.example`, `.env.test.example`, `.env.scenario-lab.example`). `.env.scenario-lab.local` / `.env` / `.env.local` are gitignored |

No material local precondition failure. Proceeded with local branch creation.

---

## 2. Branch creation

| Item | Value |
| --- | --- |
| Branch name | `scenario-lab-deploy` |
| Created from | Local `main` tip / `HEAD` at create time |
| Branch tip SHA | **`9bf20e37be0e9693d1c93f2b8da4e485c17fda37`** |
| Subject | feat: add Scenario Lab navigation entry and enhance UI components |
| Method | `git branch scenario-lab-deploy HEAD` then `git switch scenario-lab-deploy` |
| Cherry-pick / rebase / merge / history rewrite | **Not used** |
| Local `main` tip after create | Still **`9bf20e3`** (preserved) |
| `origin/main` after create | Still **`21991fa`** (unchanged; no fetch/push of `main`) |

Uncommitted / untracked work preserved (not discarded):

- `docs/release/LAB1_SCENARIO_LAB_DEDICATED_BRANCH_STRATEGY.md` (untracked)
- `docs/release/LAB1_SCENARIO_LAB_VERCEL_DEPLOYMENT_READINESS.md` (untracked)
- This validation doc (untracked after write)

---

## 3. Presence checks (on branch tip)

| Asset | Present on `HEAD` |
| --- | --- |
| `/scenario-lab` page | Yes |
| Authorize + environment guard + config | Yes |
| `hasScenarioLabAccess` / access loader | Yes |
| Lab foundation + run lifecycle migrations | Yes |
| Total Prisma migrations on tip | **30** |
| Seed scripts (`seed-scenario-lab-venue`, env loader, verify/migrate) | Yes |
| `scenario-lab:dev` + `next.config` Lab `distDir` | Yes |
| Navigation entry (`scenarioLab` in employee navigation) | Yes |
| Navigation deliverable doc | Yes |

---

## 4. Validation results

| Suite | Result |
| --- | --- |
| `pnpm lint` | Pass — 0 errors (1 pre-existing warning in `scripts/r9-capture-mobile-nav-evidence.mjs`) |
| `pnpm typecheck` | Pass |
| `pnpm test:unit` | Pass — **123** files / **649** tests |
| `pnpm test:integration tests/integration/scenario-lab-authorization.test.ts` | Pass — **15/15** |
| `pnpm build` | Pass — routes include `ƒ /scenario-lab` and `ƒ /scenario-lab/runs/[runId]` |

### `.gitignore` / secrets

| Pattern / path | Status |
| --- | --- |
| `.env`, `.env*.local`, `.env.test` | Ignored |
| `.env.scenario-lab.local` | Ignored via `.env*.local` |
| `.next-scenario-lab/` | Ignored |
| Example env files | Tracked intentionally (no secrets) |

### `distDir` / Vercel build note

`next.config.ts` sets `distDir: ".next-scenario-lab"` when `MAGICCRM_DEPLOYMENT_KIND === "scenario_lab_test"` at config evaluation time.

| Build context | Expected output directory |
| --- | --- |
| This validation `pnpm build` (Lab kind **unset** in the build process env) | Default **`.next`** |
| Vercel Lab project with `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test` at **build** time | **`.next-scenario-lab`** |

This remains a **soft blocker** for first remote deploy: confirm Vercel’s Next.js builder accepts the custom `distDir`, or gate custom `distDir` to non-Vercel / local-only before relying on Production.

---

## 5. Explicit non-actions

| Action | Performed? |
| --- | --- |
| Push to GitHub | **No** |
| Create/modify Vercel projects | **No** |
| Database changes | **No** |
| Deploy | **No** |

---

## 6. Remaining blockers before deploying this branch

| # | Blocker | Notes |
| --- | --- | --- |
| B1 | **Remote branch already exists** | `origin/refs/heads/scenario-lab-deploy` currently points at **`21991fa`** (same as `origin/main`), **not** local tip `9bf20e3`. First update of the remote branch will need an intentional push strategy (fast-forward is impossible from `21991fa` → `9bf20e3` if that remote tip is not an ancestor of the Lab tip in the way Git expects for a simple FF from that ref—actually local tip **contains** `21991fa` as ancestor, so a normal `git push origin scenario-lab-deploy` should **fast-forward** the remote from `21991fa` to `9bf20e3`). Confirm before push. |
| B2 | Existing Vercel Preview / Ignored Build Step | Operator-reported skip for `magic-crm`; reconfirm dashboard so pushing this branch does not Preview-deploy against the wrong env. |
| B3 | New Vercel project `magiccrm-scenario-lab` | Not created in this task; Production Branch must be `scenario-lab-deploy` with Lab env only. |
| B4 | Clerk TEST allowed origins | Lab host must be allowlisted before remote sign-in works. |
| B5 | Custom `distDir` on Lab Vercel builds | Verify first Lab Production build (§4). |
| B6 | Untracked ops docs | Readiness/strategy/validation markdown are local-only until committed (optional before push). |
| B7 | Explicit human approval to push | Required; not granted by this task. |

---

## 7. Git status snapshot (end of validation)

```text
On branch scenario-lab-deploy
Tip: 9bf20e37be0e9693d1c93f2b8da4e485c17fda37

Untracked (known docs only):
  docs/release/LAB1_SCENARIO_LAB_DEDICATED_BRANCH_STRATEGY.md
  docs/release/LAB1_SCENARIO_LAB_VERCEL_DEPLOYMENT_READINESS.md
  docs/release/LAB1_SCENARIO_LAB_DEPLOY_BRANCH_VALIDATION.md

origin/main: 21991faee1f6e1fa9985e7d862ea025cc14bb966 (unchanged)
Push/deploy: none
```

---

## 8. Stop

Local `scenario-lab-deploy` exists at **`9bf20e3`**, validated (lint / typecheck / unit / Lab authorization integration / build).  

**No push. No Vercel changes. No database changes. No deployment.**
