# LAB1-BV2 — First real Scenario Lab browser walkthrough

**Status:** Complete — **STOP** (no deploy; no LAB1-C)  
**Date:** 2026-10-17  
**Baseline:** Seeded Scenario Lab Neon (`LAB1_SCENARIO_LAB_SEED_APPLY_VERIFICATION.md`)

## Executive answer

| Question | Result |
| --- | --- |
| Can Scenario Lab run locally against the dedicated Neon branch? | **YES** — `pnpm scenario-lab:dev` on `:3010` |
| Authorized admin dashboard verified in a real browser? | **YES** — Playwright + staff Clerk TEST storage |
| First real inquiry staged end-to-end? | **YES** — create run → public intake submit → linked inquiry → staff workspace |
| Outbound customer notification sent? | **NO** — zero `communication_events` for the linked inquiry |
| DEV / integration TEST modified? | **NO** |

---

## 1. Exact local startup command

```bash
pnpm scenario-lab:dev
# → http://localhost:3010
```

Implementation: `scripts/dev-scenario-lab.ts` + `package.json` script `scenario-lab:dev`.

Behavior:

1. Loads `.env.scenario-lab.local` via isolated loader (refuses DEV / integration TEST identities).
2. Verifies endpoint `ep-lucky-hall-av5j542n`, sentinel label `Scenario Lab TEST`, Clerk TEST keys, exactly two allowlisted users, 30 finished migrations.
3. Spawns `next dev --port 3010` with lab env primed in the **process environment** so Next’s automatic `.env` / `.env.local` merge cannot override already-set keys.
4. Sets `APP_URL=http://localhost:3010`.
5. Uses `distDir: .next-scenario-lab` when `MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test` so a second Next lock does not collide with normal `pnpm dev` on `:3000`.
6. Does not modify the normal `pnpm dev` command.
7. Does not print connection strings, Clerk secrets, or the identity token.

Optional port override: `SCENARIO_LAB_PORT=3011 pnpm scenario-lab:dev`.

---

## 2. Confirmed runtime environment

| Item | Value |
| --- | --- |
| Base URL | `http://localhost:3010` |
| Endpoint identity | `ep-lucky-hall-av5j542n.c-11.us-east-1.aws.neon.tech/neondb` |
| Deployment kind | `scenario_lab_test` |
| DB label | Scenario Lab TEST |
| Clerk | TEST (`sk_test_` / `pk_test_`) |
| Org slug | `magiccrm-scenario-lab` |
| Venue | MagicCRM Scenario Lab Center |
| Migrations | 30 applied / 0 pending |
| Differs from DEV / TEST | yes |

---

## 3. Browser tests actually executed

### Automated Playwright (real Chromium against live lab app)

```bash
SCENARIO_LAB_E2E=1 PLAYWRIGHT_BASE_URL=http://localhost:3010 \
  pnpm exec playwright test tests/e2e/scenario-lab.smoke.spec.ts --project=chromium-desktop
```

**Result: 2/2 passed**

| Test | Mode | Result |
| --- | --- | --- |
| Signed-out `/scenario-lab` → 404 | Browser, no storage | Pass |
| Create run → open intake → submit → staff workspace | Browser, staff Clerk storage | Pass |

Artifacts: `docs/release/lab1bv2-evidence/`

- `dashboard-chromium-desktop.png`
- `run-ready-chromium-desktop.png`
- `public-intake-chromium-desktop.png`
- `after-submit-chromium-desktop.png`
- `run-linked-chromium-desktop.png`
- `staff-workspace-chromium-desktop.png`
- `last-walkthrough.json`

### Direct database checks (post-walkthrough)

| Check | Result |
| --- | --- |
| Run status | `completed` |
| Owned entity | `inquiry` |
| Inquiry tenant | `magiccrm-scenario-lab` org only |
| Customer email | `@example.com` synthetic |
| `communication_events` for inquiry | **0** (no outbound send recorded) |
| Lab identity vs DEV/TEST | still isolated |
| Migrations | still 30 finished |

### Manual browser steps required?

**Not required for this phase** — Playwright completed the authorized path with existing `playwright/.auth/staff.json` (allowlisted Clerk TEST admin + trusted org).

If storage expires, regenerate with `pnpm test:e2e:staff:auth`, then:

1. `pnpm scenario-lab:dev`
2. Open `http://localhost:3010/sign-in`
3. Sign in as an allowlisted admin; active org = trusted TEST org
4. Open `http://localhost:3010/scenario-lab`
5. Create inquiry scenario → Open public inquiry form → submit → return to run → Open staff inquiry workspace

---

## 4. Scenario run / inquiry results (latest successful walkthrough)

From `docs/release/lab1bv2-evidence/last-walkthrough.json`:

| Field | Value |
| --- | --- |
| Run ID | `mfdok45ug3oxebnlv9mrvw5j` |
| Run URL | `http://localhost:3010/scenario-lab/runs/mfdok45ug3oxebnlv9mrvw5j` |
| Staff inquiry path | `/app/inquiries/w19cnryd795fy0lbjxrmk8so` |
| Inquiry status | `AWAITING_CUSTOMER` |
| Synthetic customer | `scenario.lab.*@example.com` |

Ownership: `scenario_lab_owned_entities` links the inquiry to the run within the Scenario Lab tenant only.

---

## 5. Security observations

| Check | Evidence |
| --- | --- |
| Signed-out private dashboard | Browser: HTTP **404** |
| Public intake ≠ admin | Forged `?lab=` shows no Scenario Lab admin chrome / no prefill banner |
| Refresh preserves run + linked inquiry | Browser reload on run detail |
| Notification suppression only for claimable lab token | DB: **0** communication events for linked inquiry; prior LAB1-BV unit/integration cover forged-token non-suppression |
| Second allowlisted admin | Not separately browser-tested this phase; both users are seeded Administrators (LAB1 seed verification). Staff fixture used one allowlisted user successfully. |
| Unauthorized user | Signed-out path verified; wrong-org/user covered by existing integration auth matrix |
| No DEV/TEST writes | Identity isolation + lab-only counts |

HOLDs / bookings / cancellations / conflicts were **not** created (by design).

---

## 6. Code / config changes in this phase

| Path | Role |
| --- | --- |
| `scripts/dev-scenario-lab.ts` | Fail-closed Scenario Lab Next launcher |
| `package.json` → `scenario-lab:dev` | Entry point |
| `next.config.ts` | Separate `.next-scenario-lab` distDir for lab kind |
| `.gitignore` | Ignore `.next-scenario-lab/` |
| `tests/e2e/scenario-lab.smoke.spec.ts` | Full LAB1-BV2 walkthrough (gated by `SCENARIO_LAB_E2E=1`) |

Normal `pnpm dev` unchanged.

---

## 7. Automated validation (non-browser)

| Command | Result |
| --- | --- |
| `pnpm exec tsc --noEmit` | pass |
| `pnpm test:unit` | pass (643) |
| `pnpm test:integration` scenario-lab auth + inquiry staging | pass (20) |
| `pnpm build` | pass |
| Playwright Scenario Lab e2e | pass (2) |

---

## 8. Blockers / defects

| Item | Notes |
| --- | --- |
| Next dual-dev lock | Resolved via `.next-scenario-lab` distDir — required so lab can run beside DEV on `:3000` |
| Timeline copy vs assertion | “Awaiting inquiry submission” remains as an expected-future timeline row after completion; tests now scope assertions to the Linked inquiry region |
| Second-admin interactive browser | Not re-run as a second Playwright storage state this phase |

No authorization bypasses. No Vercel deploy. No LAB1-C.

---

## Verdict

The first real Scenario Lab browser walkthrough is **verified** against the dedicated Neon `scenario_lab` branch: authorized dashboard, synthetic venue ready, public inquiry created through the real intake pathway, run ownership linked, staff workspace opened, and no outbound customer notification recorded.
