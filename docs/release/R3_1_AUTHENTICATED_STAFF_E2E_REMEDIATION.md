# R3.1 — Authenticated Staff Playwright Failure Triage & Remediation

**Status:** Authenticated staff suite green for observation mode (mutations opt-in remain skipped by design).  
**Not a production-readiness approval. Do not deploy from this document alone.**  
**STOP after R3.1.**

---

## 1. Original run (before remediation)

| Metric | Count |
|---|---|
| Passed | 14 |
| Failed | 8 |
| Skipped | 2 |
| Total | 24 |
| Exit code | 1 |

---

## 2. Original eight failures — root causes

| # | Spec | Symptom | Classification | Root cause |
|---|---|---|---|---|
| 1 | `staff.a11y.spec.ts` `/app` | `color-contrast` serious | **Application defect** | Active mobile **More** label `#0070e0` on `#e6f1fc` (4.17:1) |
| 2 | `staff.a11y.spec.ts` inquiry detail | `color-contrast` serious | **Application defect** | `text-primary` `#0070e0` on canvas `#f5f7fb` (4.45:1); funnel `text-foreground/55` → `#747983` (4.07:1); incomplete stages `text-foreground/45` → `#8c9098` (2.98:1); later also warning badge `#9a6708` on tint (3.95:1) once readiness panels rendered |
| 3 | `staff.confirmation.spec.ts` | missing `#confirmation-readiness` | **Unsuitable fixture** | Fixture created plans but never selected one; panels only render in Live Agent workspace (`if (selectedPlan)`) |
| 4 | `staff.guarded-failure.spec.ts` | missing readiness panels | **Unsuitable fixture** | Same as #3 |
| 5 | `staff.hold-readiness.spec.ts` | missing `#hold-readiness` | **Unsuitable fixture** | Same as #3 — not a missing SBF implementation |
| 6 | `staff.responsive.spec.ts` 390px More | matched hidden text | **Stale / incorrect assertion** | `getByText(...).first()` resolved `<span class="sr-only">Catalog</span>` (sidebar) instead of More dialog content |
| 7 | `staff.responsive.spec.ts` inquiry @390 | missing readiness panels | **Unsuitable fixture** | Same as #3 |
| 8 | `staff.smoke.spec.ts` mobile More | matched hidden text | **Stale / incorrect assertion** | Same as #6 |

No permission, tenant-context, timing, or domain-guard bypass issues were required to clear these failures.

---

## 3. Application fixes vs test-only fixes

### Application / design tokens

| Change | Why |
|---|---|
| Darken `--action-600` / `BRAND_PALETTE.action` `#0070E0` → `#005BB5` | AA normal-text margin on canvas and active nav tint; white-on-action remains ≥ 4.5:1 |
| Darken `--warning` / `BRAND_PALETTE.warning` `#9A6708` → `#7A5206` | AA on warning badge tint (`status-badge-warning`) |
| `InquiryFunnel` uses `text-muted-foreground` instead of `text-foreground/45` and `/55` | Opacity mixes failed AA; semantic muted token already passes (~5.5:1) |

### Fixture tooling

| Change | Why |
|---|---|
| `r3-create-staff-browser-fixture.ts` calls `selectPublicEventPlan` after plan generation | Staff HOLD/confirmation readiness UI requires a selected plan; still does **not** place HOLD, confirm booking, or collect payment |

### Test-only

| Change | Why |
|---|---|
| `tests/e2e/helpers/staff-mobile-nav.ts` + smoke/responsive updates | Assert inside `role=dialog` name **More**; Escape closes; focus returns to More |
| `brand-contrast.test.ts` / `ui-card-field.test.tsx` | Lock AA expectations for the darker action blue |
| `eslint.config.mjs` ignores `playwright-report/**`, `test-results/**` | Prevent linting generated Playwright artifacts |

### Explicitly not done

- No `suppressHydrationWarning` / axe rule disables
- No fake readiness states or domain-guard bypasses
- No weakening of HOLD vs confirmation separation
- Disabled control colors left intentionally softer than body text

---

## 4. Files changed

- `src/styles/tokens.css`
- `src/lib/ui/brand-palette.ts`
- `src/components/layout/inquiry-funnel.tsx`
- `scripts/r3-create-staff-browser-fixture.ts`
- `tests/e2e/helpers/staff-mobile-nav.ts` *(new)*
- `tests/e2e/helpers/staff-fixture.ts`
- `tests/e2e/staff.smoke.spec.ts`
- `tests/e2e/staff.responsive.spec.ts`
- `tests/unit/brand-contrast.test.ts`
- `tests/unit/ui-card-field.test.tsx`
- `eslint.config.mjs`
- `docs/release/R3_1_AUTHENTICATED_STAFF_E2E_REMEDIATION.md` *(this file)*

---

## 5. Accessibility before / after

| Pair | Before | After (approx.) | Target |
|---|---|---|---|
| Action `#0070e0` on canvas `#f5f7fb` | 4.45:1 | Action `#005bb5` on canvas ≈ **6.19:1** | ≥ 4.5:1 |
| Action on active More tint `#e6f1fc` | 4.17:1 | ≈ **5.80:1** | ≥ 4.5:1 |
| Funnel timestamp / incomplete (`/55`, `/45`) | 4.07 / 2.98:1 | `muted-foreground` `#5a6578` ≈ **5.49:1** | ≥ 4.5:1 |
| Warning badge `#9a6708` on tint | 3.95:1 | Warning `#7a5206` ≈ **5.62:1** | ≥ 4.5:1 |
| White on action (buttons) | 4.78:1 | ≈ **6.64:1** | ≥ 4.5:1 |

Axe after fix: `/app` and inquiry detail — **0 critical / 0 serious**.

---

## 6. Two skipped tests (intentional)

| Test | Skip reason |
|---|---|
| `staff.confirmation.spec.ts` › confirms booking only when UI allows and mutations are opted in | `Set PLAYWRIGHT_STAFF_MUTATIONS=1 to exercise Confirm booking` |
| `staff.hold-readiness.spec.ts` › places HOLD only when UI allows and mutations are opted in | `Set PLAYWRIGHT_STAFF_MUTATIONS=1 to exercise Place HOLD` |

These are **intentionally inapplicable** in default observation mode. They are not missing-fixture skips. Enabling mutations still requires a fixture that satisfies product guards (inventory, hours, permissions); do not invent readiness to force them green.

---

## 7. Validation matrix (this R3.1 run)

| Check | Result |
|---|---|
| `pnpm lint` | **PASSED** (0 errors; 1 pre-existing unused-var warning) |
| `pnpm typecheck` | **PASSED** |
| `pnpm test:unit` | **PASSED** — 608 tests |
| `pnpm build` | **PASSED** |
| `pnpm test:e2e:staff:fixture` | **PASSED** — inquiry with `selectedPlanId` |
| `pnpm test:e2e:staff` | **PASSED** — **22 passed, 2 skipped, 0 failed** |
| Booking/HOLD integration suite | **NOT RUN** — no server-side HOLD/confirm semantics changed |

Evidence screenshots from passing readiness/responsive scenarios land under `docs/release/r3-evidence/` when those tests run.

---

## 8. Remaining blockers (not R3.1 defects)

1. Mutation scenarios remain opt-in (`PLAYWRIGHT_STAFF_MUTATIONS=1`) and may still skip if inventory/hours/permissions block Place HOLD / Confirm booking.
2. Production ship gate remains **NO** until broader release criteria (beyond staff e2e observation) are met.
3. Historical design docs still mention `#0070E0` as the action hex; runtime tokens/palette are the source of truth.

---

## 9. Exact developer commands

```bash
# App + Clerk TEST storage already established
export PLAYWRIGHT_BASE_URL=http://localhost:3000
export PLAYWRIGHT_STORAGE_STATE="$PWD/playwright/.auth/staff.json"
export PLAYWRIGHT_STAFF_ORG_SLUG=magiccrm-test-center-b

corepack pnpm test:e2e:staff:fixture   # refresh selected-plan fixture when needed
corepack pnpm test:e2e:staff           # expect 22 passed, 2 skipped
```

**STOP.** Do not begin R4 automatically.
