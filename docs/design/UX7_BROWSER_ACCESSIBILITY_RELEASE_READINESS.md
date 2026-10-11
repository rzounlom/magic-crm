# UX7 — Browser, Accessibility & Release Readiness

**Status:** Verification harness established; public browser smoke **executed and passed**; high-severity public not-found a11y defect **fixed**.  
**STOP after UX7** — do not start UX8 from this document alone.

---

## 1. Verification environment

| Item | Value |
|---|---|
| App | Local `next dev` on `http://localhost:3000` |
| Public host used | `magiccrm-test-center-b` (DEV DB tenant; read-only smoke) |
| Unit/contrast | Vitest + jsdom |
| Browser automation | Playwright 1.64 + Chromium (desktop 1440 / mobile 390) |
| Cursor browser | Used for interactive intake/proposal inspection + screenshots |
| Integration DB | `.env.test` with `MAGICCRM_DATABASE_ROLE=test` (host ≠ development) |

Secrets were not committed. Staff Clerk storage state was **not** provided.

---

## 2. Browser tooling setup

Added:

- `playwright.config.ts`
- `tests/e2e/*.smoke.spec.ts`
- `tests/e2e/README.md`
- Scripts: `test:e2e`, `test:e2e:public`, `test:e2e:install`
- Contrast unit: `tests/unit/brand-contrast.test.ts`
- `@playwright/test`, `@axe-core/playwright` (axe wired for future; public smoke uses Playwright assertions)

Authenticated staff e2e requires `PLAYWRIGHT_STORAGE_STATE` (see `tests/e2e/README.md`). Without it, staff specs **skip**.

---

## 3. Route and viewport coverage matrix

| Surface | 320 | 375 | 390 | 768 | 1024 | 1440 | Method |
|---|---|---|---|---|---|---|---|
| Public intake `/inquire/[slug]` | measured | — | measured + smoke | — | — | smoke | Cursor browser + Playwright |
| Invalid plan token | — | — | smoke | — | — | smoke + browser | Playwright + Cursor |
| Marketing `/` | — | — | smoke | — | — | smoke | Playwright |
| `/app` unauth redirect | — | — | smoke | — | — | smoke | Playwright |
| Staff shell / Booking Coach / schedule | — | — | — | — | — | — | **Blocked** (no Clerk storage state) |
| Catalog / Settings admin | — | — | — | — | — | — | **Blocked** (auth) |
| Public proposal valid token | — | — | — | — | — | — | **Blocked** (no safe non-mutating fixture token) |

---

## 4. Screenshots / artifact locations

| Artifact | Location |
|---|---|
| Intake ~390 (Cursor) | Cursor screenshot cache (`ux7-intake-390.png` / related) |
| Playwright failures (if any) | `test-results/playwright/` (gitignored) |
| Playwright HTML report | `playwright-report/` (gitignored) |

Committed doc artifacts under `docs/design/artifacts/` may be added when promoting screenshots out of the local cache.

---

## 5. Responsive defects found

| Finding | Severity | Classification |
|---|---|---|
| Intake at 390: `overflowX = 0`; choice targets ≥44px; progress wraps | OK | Verified |
| Contained planner max-w-3xl leaves side canvas on desktop | Low | By design (not a defect) |
| Turbopack HMR panic during long-lived `next dev` after package install | Medium (dev-only) | Environment; restart recovered |
| Invalid plan/inquire status used **h2** as page title (no H1) | High (a11y) | **Fixed** |
| Staff mobile More / Booking Coach clearance | Unknown | Auth blocked |
| Valid proposal tier matrix | Unknown | No safe token |

---

## 6. Defects fixed

### D1 — Public status pages missing H1

- **Reproduction:** `/plan/invalid-token-ux7-smoke` → a11y tree showed heading level 2 only; Playwright expected H1 and failed.
- **Root cause:** `PublicStatusPanel` used `CardTitle` (`h2`).
- **Change:** `PublicStatusPanel` now renders `<h1>`; card centered with `mx-auto`.
- **Test:** `tests/unit/public-status-panel.test.tsx` asserts `<h1`; Playwright public-token smoke expects H1.
- **Verification:** Browser snapshot shows level 1; public e2e **12/12 passed**.

---

## 7. Remaining responsive defects

- None high-severity demonstrated on public intake at 320/390 after measurement.
- Staff mobile action-bar vs bottom-nav clearance: **not browser-verified** (auth blocked).
- Permission matrix overflow: **not browser-verified** (auth blocked).

---

## 8. Accessibility audit results

| Check | Result |
|---|---|
| Automated axe suite | **Not run** as a gate (`@axe-core/playwright` installed; not yet wired into smoke) |
| Public intake headings / progress `aria-current` | Observed OK in browser |
| Public invalid token H1 | Fixed |
| Keyboard full pass (dialogs, schedule) | **Not run** (staff auth blocked) |
| Full WCAG 2.2 AA claim | **Not claimed** |

---

## 9. Contrast measurement table

Measured from `BRAND_PALETTE` / token hex (WCAG relative luminance):

| Pair | Ratio | Threshold applied | Result |
|---|---|---|---|
| Ink on canvas | 17.46:1 | 4.5:1 | Pass |
| Ink on surface | 18.72:1 | 4.5:1 | Pass |
| Muted on canvas | 5.49:1 | 4.5:1 | Pass |
| Muted on surface | 5.89:1 | 4.5:1 | Pass |
| White on action | 4.78:1 | 4.5:1 | Pass |
| Action on white (link/UI) | 4.78:1 | 3:1 UI | Pass |
| Success on white | 5.32:1 | 4.5:1 | Pass |
| Warning on white | 4.86:1 | 4.5:1 | Pass |
| Danger on white | 6.57:1 | 4.5:1 | Pass |
| Navy on white | 15.55:1 | 4.5:1 | Pass |
| Disabled fg/bg | 2.62:1 | Documented inactive | Acceptable exception |

Automated: `tests/unit/brand-contrast.test.ts` — **Passed**.

---

## 10. Public intake visual findings (UX8 baseline)

Observed (code + browser):

| Issue | Evidence | UX7 action |
|---|---|---|
| Six stages still feel long | Progress list + progressive unlock | UX8 |
| No Back control | No Back button; recovery via Review edit | UX8 |
| Org name repeated (eyebrow + H1) | Browser snapshot | UX8 copy polish |
| Slug-derived Title Case (“Magiccrm…”) | Host display | Research / display helper |
| Date/time 3-control cost | Prior UX5 backlog; not deeply re-exercised after submit-safe stop | UX8 |
| No draft persistence | Refresh loses answers | UX8 |
| Smoke stops before submit | By design (no production writes) | Keep |

---

## 11. Staff booking mobile findings

**Blocked** — no `PLAYWRIGHT_STORAGE_STATE`. Unit/docs from UX4 remain the last verified source for Booking Coach offsets.

---

## 12. Permission and tenant regression results

| Check | Result |
|---|---|
| Public slug resolves only matching org | Browser load of `magiccrm-test-center-b` OK; unknown slugs 404 |
| Cross-tenant UI leak in smoke | Not observed |
| Sales knowledge view vs manage | Unit/presentation from UX6; not re-browsered |
| Integration permission suites | See §13–14 |

---

## 13. Focused integration results

Isolation confirmed before run:

`role=test` host `ep-sparkling-bird-…` ≠ development `ep-bold-art-…`.

| Attempt | Result |
|---|---|
| `team-invitations.test.ts` (first focused batch) | **Failed** — 2 tests failed (`keeps queued groups…`, `reconciles already-revoked…`); remainder of batch incomplete |
| Core subset (`security-groups` + `staff-booking-journey` + `public-inquiry-write-boundary`) | **Incomplete** — Neon TEST branch latency: >12 minutes still inside `security-groups` alone; stopped to avoid unbounded run |

Failures were **not** caused by UX7 UI changes (no domain edits). Treat as a release-gate follow-up on the TEST DB / invitation suite.

---

## 14. Full integration results or blockers

Full `pnpm test:integration`: **Not run**.

**Blocker:** Focused suite did not finish cleanly within a reasonable wall-clock window on the isolated Neon TEST branch. Isolation guard is healthy; execution throughput is the issue. Re-run full suite separately before merge/deploy.

---

## 15. Browser smoke results

| Suite | Result |
|---|---|
| `PLAYWRIGHT_PUBLIC_ORG_SLUG=… pnpm test:e2e:public` | **Passed** (12/12: desktop + mobile) |
| Staff e2e | **Not run** (skipped without storage state) |
| Axe gate | **Not run** |

---

## 16. Files changed

- `playwright.config.ts`, `tests/e2e/**`, `package.json`, `.gitignore`
- `src/components/layout/public-status-panel.tsx`
- `tests/unit/public-status-panel.test.tsx`, `tests/unit/brand-contrast.test.ts`
- `docs/design/UX7_BROWSER_ACCESSIBILITY_RELEASE_READINESS.md`
- `planning/architecture/ui-conventions.md` (pointer)

---

## 17. Validation results

| Check | Status |
|---|---|
| `corepack pnpm lint` | **Passed** |
| `corepack pnpm typecheck` | **Passed** |
| `corepack pnpm test:unit` | **Passed** (591) |
| `corepack pnpm build` | **Passed** |
| Public Playwright smoke | **Passed** (12/12) |
| Staff Playwright smoke | **Blocked** (auth) |
| Focused integration | **Failed / Incomplete** (see §13) |
| Full integration | **Not run** |
| Axe | **Not run** |

---

## 18. Known limitations

- No authenticated staff browser coverage in this phase.
- No valid public proposal token fixture for non-mutating proposal smoke.
- `@axe-core/playwright` dependency present but not enforced in CI.
- Dev Turbopack can panic after long HMR sessions; restart `next dev`.
- Screenshots primarily in local Cursor/Playwright caches unless promoted.

---

## 19. Production-readiness assessment

**Not production-ready solely on UX7.**

Ready for next engineering gate only after:

1. Focused + full integration green on isolated TEST DB  
2. Authenticated staff mobile smoke (Booking Coach / More / schedule dialogs)  
3. Optional axe wiring on public + one staff path  

Public intake/token smoke and contrast math are in good shape for UX8 planning.

---

## 20. Prioritized UX8 intake optimization brief

| Priority | User problem | Evidence | Severity | Mobile impact | Scope | Dependencies |
|---|---|---|---|---|---|---|
| P0 | Too many stages / no Back | Code `PLANNER_STAGES`; browser progress wrap | High | High | Wizard UX + progressive disclosure | Preserve payload contract |
| P0 | Lost progress on refresh | No persistence | High | High | Draft/local persistence design | Privacy; no CRM autosave invent |
| P1 | Date/time three-control cost | UX5 backlog + form structure | High | High | Combined datetime control | Venue-local time rules |
| P1 | Attraction multi-select step cost | Experience stage Continue | Medium | Medium | Conditional skip / smarter defaults | Catalog size; required mixes |
| P1 | Guest-count digits-only ambiguity | `replace(/\D/g)` | Medium | Medium | Input affordances / copy | Validation contract |
| P2 | Org name / Title Case polish | Browser H1 | Low | Low | Display helper | No Generations special-case |
| P2 | Failed submit recovery beyond toast | `notify.error` | Medium | Medium | Inline recovery UX | Server action errors |
| P2 | CRM field mapping clarity | Handoff docs incomplete | Medium | n/a | Mapping review | Product + CRM |

Do **not** invent abandonment metrics. Do **not** implement UX8 in this phase.
