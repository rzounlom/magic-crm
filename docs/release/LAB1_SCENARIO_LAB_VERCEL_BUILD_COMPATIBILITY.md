# LAB1 — Scenario Lab Vercel Build Compatibility

**Status:** Complete — **STOP** (fix committed on `scenario-lab-deploy` only; **no push**, **no deploy**).  
**Date:** 2026-10-18  
**Branch:** `scenario-lab-deploy`

---

## 1. Problem

`next.config.ts` previously set `distDir: ".next-scenario-lab"` whenever `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test`. That is correct for local dual-dev (`pnpm scenario-lab:dev` on :3010 beside `pnpm dev`), but unsafe for Vercel Lab builds, which expect the standard Next.js output directory (`.next`).

---

## 2. Code change

| Path | Change |
| --- | --- |
| `src/lib/build/next-dist-dir.ts` | Pure `resolveNextDistDir(env)` helper |
| `next.config.ts` | Uses the helper for `distDir` |
| `tests/unit/next-dist-dir.test.ts` | Regression coverage for local Lab / Vercel / ordinary DEV |
| `scripts/dev-scenario-lab.ts` | Unchanged — still sets `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test` without `VERCEL` |

### Selection rules

| Condition | `distDir` |
| --- | --- |
| `VERCEL=1` or `VERCEL=true` (any deployment kind) | default (`.next`) |
| Local + `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test` (no Vercel) | `.next-scenario-lab` |
| Ordinary local / `local_development` / `customer_production` | default (`.next`) |

Signal: Vercel’s documented server/build env var `VERCEL`. No `NEXT_PUBLIC_*` client flag. Authorization, DB identity, and deployment-kind guards are untouched.

---

## 3. Validation results

| Check | Result |
| --- | --- |
| `pnpm lint` | Pass (0 errors; 1 pre-existing warning) |
| `pnpm typecheck` | Pass |
| `pnpm test:unit` (includes new distDir tests) | Pass — **124** files / **653** tests |
| Production build with Lab flags + `VERCEL=1` | Pass |
| Build output directory | **`.next`** (`BUILD_ID` present) |
| `.next-scenario-lab/BUILD_ID` from this build | **Absent** |
| Secret-like strings in `.next` (`sk_*`, `postgresql://`) | **0** file hits |
| Tracked secrets | None (`.env.scenario-lab.local` remains gitignored) |
| Database migrate / seed / data changes | **Not run** |

Build command used for Lab+Vercel simulation:

```bash
MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test \
SCENARIO_LAB_ENABLED=true \
VERCEL=1 \
pnpm build
```

(`pnpm build` = `prisma generate && next build` — no migrate.)

---

## 4. Branch / commit

| Item | Value |
| --- | --- |
| Branch | `scenario-lab-deploy` |
| Tip before fix | `9bf20e37be0e9693d1c93f2b8da4e485c17fda37` |
| Tip after commit | See git log after commit (this document committed with the fix) |
| `main` modified | **No** |
| Pushed | **No** |
| Deployed | **No** |

---

## 5. Remaining notes

- Local `pnpm scenario-lab:dev` continues to isolate under `.next-scenario-lab`.
- First remote Lab deploy on Vercel should still confirm the platform consumes `.next` (expected with this fix).
- Unrelated untracked strategy/readiness/validation docs were **not** included in this commit unless listed in the commit itself.
