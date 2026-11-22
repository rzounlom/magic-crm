# Phase 12J — Automated employee E2E regression coverage

**Date:** 2026-11-22  
**Branch:** `phase-12j-employee-e2e-regression`  
**PR:** https://github.com/rzounlom/magic-crm/pull/28 (**MERGED**)  
**Merge commit:** `ad9a181`  
**Recommendation:** **Released** — test infrastructure only; no business-rule changes.

---

## 1. Authentication reuse (Phase 12I)

Unchanged:

| Command | Purpose |
|---|---|
| `pnpm test:e2e:provision` | Synthetic Test Center B identities |
| `pnpm test:e2e:auth` | Clerk ticket sessions → `playwright/.clerk/*` |
| `pnpm test:e2e:quote` | Quote acceptance (Admin / Event Sales / Front Desk) |

Roles reused: Administrator, Event Sales, Front Desk. No new users. `http://localhost:3000` only.

---

## 2. E2E test inventory

| Spec | Tags | Coverage |
|---|---|---|
| `employee-nav.by-role.spec.ts` | `@phase-12j` `@employee-nav` | Nav visibility + permitted routes + denied URL bypass per role |
| `employee-home-queue.spec.ts` | `@phase-12j` `@employee-home` | Attention deep-links (no hardcoded counts), Active/Archived, card → detail → back |
| `employee-wp-workflow.spec.ts` | `@phase-12j` `@employee-wp` | WP staff-review wording, tabs, draft survival; no READY TO BOOK; delivery blocked |
| `employee-live-agent.spec.ts` | `@phase-12j` `@employee-la` | LA booking coach; HOLD ≠ confirm readiness; Start Working ≠ Confirm; read-only |
| `employee-responsive-a11y.spec.ts` | `@phase-12j` `@employee-responsive` | Viewports 375–1920 overflow; More sheet; 10px card gap; tab keyboard; hydration |
| Quote suite (12I) | `@quote` | Dollar precision / override / restricted — **reused, not duplicated** |

Playwright projects: `employee-admin`, `employee-event-sales`, `employee-front-desk` (depend on `setup-auth`).

---

## 3. Role coverage matrix

| Surface | Administrator | Event Sales | Front Desk |
|---|---|---|---|
| Home | yes | yes | yes |
| Inquiries (+ queue/detail) | yes | yes | denied (nav + direct URL) |
| Bookings / Schedule | yes | yes | yes |
| Sales knowledge | yes | yes | denied |
| Resources / Hours / Team / Security / Catalog sync | yes | denied | denied |
| WP quote workflow | via `@quote` + `@employee-wp` | `@employee-wp` + `@quote` | inquiry denied (`@quote-front-desk`) |
| Live Agent readiness (read-only) | `@employee-la` | — | — |

Permissions templates unchanged.

---

## 4. Synthetic fixture strategy

| Fixture | Source | Notes |
|---|---|---|
| Identities | `pnpm test:e2e:provision` | gitignored |
| WP inquiry | `phase-10g-wp-inquiry.json` | Test Center B only |
| LA selected plan | `pnpm test:e2e:staff:fixture` → `staff-inquiry.json` | No HOLD/confirm mutations |
| Auth storage | `pnpm test:e2e:auth` | gitignored `.clerk/` |

Never Production. Never Generations. `PLAYWRIGHT_STAFF_MUTATIONS` must stay unset for LA suite.

---

## 5. Commands

```bash
export PLAYWRIGHT_BASE_URL=http://localhost:3000
pnpm test:e2e:provision && pnpm test:e2e:auth
pnpm test:e2e:staff:fixture   # refresh LA fixture when needed
pnpm test:e2e:employee        # Phase 12J
pnpm test:e2e:quote           # Phase 12I
pnpm test:e2e:regression      # quote + employee
```

CI: inject Clerk TEST secrets + DEV DB; never commit `.env.e2e` / `.clerk/` / `.fixtures/`.

---

## 6. Responsive results

Target widths: 375, 430, 768, 1024, 1440, 1920 — assert no document horizontal overflow on Home + Inquiries; mobile More open/Escape/focus restore; inquiry card list `gap` = 10px; inquiry tabs keyboard-focusable; no hydration mismatch console on `/app`.

---

## 7. Known gaps

- Unread attention depends on notification-driven data; tile followed only when dashboard renders it (no invented counts).
- LA READY TO BOOK banner may be omitted on unassigned coach UI; suite asserts customer selection + booking coach + distinct HOLD/confirm readiness instead of banner-only.
- HOLD/confirm **mutations** remain opt-in legacy `@staff-hold` / `@staff-confirm` (not Phase 12J).
- Full axe suite still under existing `@staff-a11y` (not re-run as gate here beyond keyboard/label smoke).

---

## 8. Quality gates

| Gate | Passed | Failed | Skipped |
|---|---|---|---|
| Typecheck | PASS | 0 | — |
| Lint | PASS (0 errors) | 0 | — |
| Unit | **1010** | 0 | 1 |
| Build | PASS | 0 | — |
| Quote E2E (`test:e2e:quote`) | **7** | 0 | 0 |
| Employee E2E (`test:e2e:employee`) | **35** | 0 | **29** (cross-role project filters) |

No failure-hiding retries beyond Playwright config defaults.

---

## 9. Safeguards

Unchanged: WP pricing baseline, `finalLivePriceRevalidation: pending`, `canDeliver: false`, 25% deposit, VERIFIED hours, permissions, quote delivery restrictions, HOLD/confirm separation. No Scenario Lab. No Preview dependency. No Production writes / live email / payments.

---

## 10. PR status

| Step | Status |
|---|---|
| PR #28 | **MERGED** (`ad9a181`) |
| Vercel Production | **Ready** (`magic-qg1edv8pd…`, alias `magic-crm-eta.vercel.app`) |
| Read-only smoke | `/` 200, `/sign-in` 200, `/app` 307 — no customer-data writes |
