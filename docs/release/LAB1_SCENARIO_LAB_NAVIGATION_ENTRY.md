# LAB1 — Scenario Lab Navigation Entry

**Status:** Complete — **STOP** (navigation convenience only; no LAB1-C / HOLD / booking scenarios).  
**Date:** 2026-10-17  
**Scope:** Discoverable **Scenario Lab** link for authorized administrators inside an existing Scenario Lab deployment.

---

## 1. Placement

| Surface | Location | Notes |
| --- | --- | --- |
| Desktop header | **Settings** group (with Team / Security) | Same pill styling as other module links |
| Mobile | **More → Settings** | Not in the primary Inquiries / Schedule / Bookings bar |
| Overview quick links | Settings group when chrome marks the id visible | Same `visibleNavIds` source as the shell |

- **Label:** Scenario Lab  
- **Optional badge:** `TEST` (display-only; `aria-hidden`)  
- **Icon:** Flask / testing path in `ModuleNavLink`  
- **Destination:** `/scenario-lab` (same-origin; never hardcoded localhost)

Primary customer workflow tabs are unchanged.

---

## 2. Authorization

Visibility is **not** a client env flag and **not** a single permission key alone.

Shell chrome calls `hasScenarioLabAccess()`, a soft probe that reuses the full LAB1-A gate `requireScenarioLabAccess`:

1. Deployment kind is `scenario_lab_test`
2. `SCENARIO_LAB_ENABLED=true`
3. Database identity verification succeeds
4. Authenticated Clerk user is one of the two allowlisted IDs
5. Active Clerk organization matches `SCENARIO_LAB_ORG_ID`
6. User has `organization.settings.manage`

Fail closed → entry omitted. Allowlist, tokens, and credentials stay server-only.

The navigation entry is convenience only. `/scenario-lab` still uses `loadScenarioLabAccessOrNotFound()` → `notFound()` (404) for unauthorized direct access.

---

## 3. Files changed

| Path | Role |
| --- | --- |
| `src/server/scenario-lab/load-scenario-lab-access.ts` | `hasScenarioLabAccess()` soft probe |
| `src/components/layout/employee-shell-chrome.ts` | Adds `scenarioLab` to `visibleNavIds` when probe passes |
| `src/lib/ui/employee-navigation.ts` | Catalog entry (Settings / More, badge `TEST`) |
| `src/components/ui/module-nav-link.tsx` | Flask icon + optional badge |
| `src/components/layout/employee-header-bar.tsx` | Passes badge |
| `src/components/layout/employee-mobile-nav.tsx` | Passes badge |
| `tests/unit/employee-navigation.test.tsx` | Catalog + mobile visibility |
| `tests/unit/employee-header-bar.test.tsx` | Desktop Settings visibility |
| `tests/unit/employee-shell-chrome.test.ts` | Wiring to LAB1-A probe |
| `tests/integration/scenario-lab-authorization.test.ts` | Soft-probe matrix |

---

## 4. Test results

Recorded after implementation validation (2026-10-17):

| Suite | Result |
| --- | --- |
| `pnpm lint` | Pass (0 errors; pre-existing unused-var warning in `scripts/r9-capture-mobile-nav-evidence.mjs`) |
| `pnpm typecheck` | Pass |
| `pnpm test:unit` | Pass — 123 files / 649 tests |
| `pnpm test:integration tests/integration/scenario-lab-authorization.test.ts` | Pass — 15/15 (hard gate + soft-probe matrix) |
| `pnpm build` | Pass |

Also ignored `.next-scenario-lab/**` in `eslint.config.mjs` so dual-dev build output is not linted.

Coverage matrix:

| Case | Expected |
| --- | --- |
| Allowlisted admin A | Soft probe `true` → nav visible when chrome includes id |
| Allowlisted admin B | Soft probe `true` |
| Wrong Clerk organization | Soft probe `false` → no entry |
| Non-allowlisted user | Soft probe `false` |
| `local_development` / `customer_production` | Soft probe `false` |
| Feature disabled | Soft probe `false` |
| Desktop Settings + mobile More | Render `/scenario-lab` only when id is in `visibleNavIds` |
| Unauthorized `/scenario-lab` | Still 404 via existing page loader |

---

## 5. Limitations

- Entry appears only in the employee shell (`/app` and related authenticated routes that load chrome). The Scenario Lab pages themselves are outside that shell by design.
- Soft probe runs on chrome load; when Scenario Lab is disabled (normal DEV/prod), config parse fails closed before DB identity I/O.
- Does not change the Scenario Lab scenario engine, HOLD/booking/cancellation flows, or any deployment target.
- Does not alter DEV, integration TEST, or production database contents as part of this change.

---

## 6. Stop

Navigation improvement only. No Vercel deploy. No LAB1-C.
