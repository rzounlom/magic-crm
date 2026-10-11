# UX1 — Redesign Roadmap

**Status:** Planning only. Authorize each phase explicitly.  
**Do not auto-start UX2.**  
**Business invariants:** engines vs org config; no Generations special-case; no pricing/tax/payment/HOLD policy changes via UI work.

Aligned with [`planning/architecture/design-north-star.md`](../../planning/architecture/design-north-star.md), expanded using repository evidence from UX1 audit.

---

## Dependency rationale (adjusted sequence)

Suggested user sequence UX2→UX7 is sound. Adjustments from repo evidence:

1. **Tokens + Button/Card first (UX2)** — highest leverage against class-string drift.
2. **Shell/nav before booking polish (UX3)** — sticky header/coach conflict is structural.
3. **Staff booking next (UX4)** — SBF3 workflow is the revenue path.
4. **Customer surfaces (UX5)** — intake/plan already strong skeletons.
5. **Remaining modules (UX6)** — many surfaces absent; avoid inventing POS/payments UI until policy exists.
6. **Hardening (UX7)** — add Playwright minimally; a11y + visual regression.

North-star’s older “UX6 = mobile/a11y” maps to **UX7** here so POS/settings get a dedicated phase.

---

## Phase UX2 — Design tokens and shared component foundation

| | |
|---|---|
| **Targets** | `src/styles/tokens.css`, `globals.css`, `clerk-appearance.ts`, new `src/components/ui/{button,card,field,...}` |
| **Changes** | Adopt *Effortless Precision* token map; Button/Card/Field/FilterChip; map Tailwind `@theme`; eliminate hex drift |
| **Dependencies** | UX1 docs |
| **Invariants** | No booking/pricing logic changes |
| **Testing** | lint, typecheck, unit (Badge/Button), visual spot-check |
| **Acceptance** | Primary CTA uses shared Button on ≥3 pilot pages; tokens document contrast intent |
| **Complexity** | M |
| **Risks** | Clerk theme mismatch; teal→navy brand shift surprise for current users |

---

## Phase UX3 — Global app shell and responsive navigation

| | |
|---|---|
| **Targets** | `EmployeeShell`, `EmployeeHeaderBar`, module nav links, `/app` Overview |
| **Changes** | IA areas (Overview / Bookings & Events / Catalog / Settings); mobile bottom nav or More menu; ContextChip org+location; fix sticky stacking tokens (`--header-offset`) |
| **Dependencies** | UX2 tokens/components |
| **Invariants** | Permission gates unchanged; location display must use trusted context |
| **Testing** | unit nav visibility; manual 375/1024; keyboard tab through header |
| **Acceptance** | Front-desk modules reachable in ≤2 taps on 375px; public intake reachable on mobile; header/coach no overlap recipe |
| **Complexity** | M–L |
| **Risks** | Over-nesting admin; Clerk switcher width |

---

## Phase UX4 — Staff booking and CRM workflows

| | |
|---|---|
| **Targets** | Inquiries list/detail, readiness panels, booking list/detail, schedule board chrome (not engine) |
| **Changes** | Unified Booking coach + ActionBar; ReadinessPanel; densify without losing SBF3 semantics; schedule dialog a11y; label consistency |
| **Dependencies** | UX2, UX3 (`--header-offset`) |
| **Invariants** | HOLD optional; purpose-specific exceptions; confirm revalidates; no client pricing |
| **Testing** | existing SBF unit/integration; focused journey tests; keyboard confirm path |
| **Acceptance** | Front-desk Journey A completable on 375px; dual-panel confusion removed; schedule dialog labelled |
| **Complexity** | L |
| **Risks** | Regressing sticky confirm; accidental logic edits |

---

## Phase UX5 — Customer-facing inquiry / proposal experience

| | |
|---|---|
| **Targets** | `/inquire/[slug]`, `/plan/[token]`, `/conversation/[token]`, `PublicCustomerShell` |
| **Changes** | Tenant logo/accent slots (config-driven later); ProposalCompare/PriceBreakdown polish; motion/a11y fixes |
| **Dependencies** | UX2; optional branding settings fields only if already present — else visual slots with fallbacks |
| **Invariants** | No checkout; no tax activation; org display via `customerFacingOrganizationName` |
| **Testing** | public intake unit tests; manual mobile wizard; reduced-motion |
| **Acceptance** | 320–390px intake without overflow; proposal tier switch clear; brand boundaries respected |
| **Complexity** | M |
| **Risks** | Contained `h-dvh` keyboard occlusion on iOS (*verify in browser*) |

---

## Phase UX6 — POS, catalog, reporting, settings, remaining surfaces

| | |
|---|---|
| **Targets** | Rename/group Knowledge+Resources as Catalog; Team/Security under Settings; **new** screens only when product-ready: hours admin, promotions admin, customers, reports stubs |
| **Changes** | IA completion; do **not** fake POS/payments — ship placeholder “Not configured” only if product asks |
| **Dependencies** | UX2–UX3; product decisions on processor/fee/tax |
| **Invariants** | Tax disabled; no fee; no Generations hardcode |
| **Testing** | permission matrix tests; settings forms unit |
| **Acceptance** | Admin tasks discoverable; no dead nav to missing POS unless explicitly stubbed |
| **Complexity** | L (variable) |
| **Risks** | Scope creep into unpaid product surface area |

---

## Phase UX7 — Mobile, accessibility, and visual regression hardening

| | |
|---|---|
| **Targets** | All redesigned surfaces |
| **Changes** | Add minimal Playwright (or equivalent) smoke; axe checks; screenshot baselines for inquiry/plan/schedule; reduced-motion pass |
| **Dependencies** | UX4–UX5 primarily |
| **Invariants** | No business rule changes |
| **Testing** | See § Testing strategy |
| **Acceptance** | WCAG 2.2 AA on critical paths; 320/375/768/1440 smoke green; no horizontal page overflow on Journey A/D |
| **Complexity** | M |
| **Risks** | Flaky visual diffs; Neon/test env coupling |

---

## Testing and quality strategy (future phases)

| Layer | Already present | UX recommendation |
|---|---|---|
| lint / typecheck | Yes | Keep gate |
| unit (Vitest) | Yes | Expand for new UI primitives |
| focused integration | Yes (SBF/journey) | Re-run on booking UI changes; not full suite every UX PR |
| component tests | Partial (jsdom) | Button/Dialog/Readiness |
| Browser smoke | **Absent** | UX7: Playwright minimal — sign-in optional via storage state; public intake + staff inquiry happy path |
| Screenshots | Absent | Playwright screenshots on 375 + 1440 |
| a11y | Manual/code | axe-core in Playwright; keyboard scripts |
| Multi-tenant | Integration helpers | Keep org isolation tests when touching shell/context |

**Minimal Playwright adoption (UX7, not UX1):**

1. Add `playwright` + config; CI job optional at first.
2. Two specs: public intake smoke; staff inquiry open (authenticated fixture).
3. No full CRM suite until shell stabilizes.

---

## Relative effort overview

| Phase | Relative | Can parallelize? |
|---|---|---|
| UX2 | M | Foundation — blocks others |
| UX3 | M–L | After UX2 |
| UX4 | L | After UX3 offset tokens |
| UX5 | M | After UX2; parallel to late UX4 carefully |
| UX6 | L | After UX3 IA |
| UX7 | M | Continuous once UX4 lands |

Prefer vertical slices (one staff page fully tokenized) over big-bang rewrites.

---

## Out of scope for all UX phases unless product authorizes separately

- Payment processor selection / checkout
- Platform subscription or 1% fee UI
- Tax activation
- Operating-hours seed for Generations
- Booking engine, pricing, promotions, inventory rule changes
- Broad DB status enum renames

---

## Handoff checklist from UX1

- [x] Surfaces inventoried  
- [x] Inconsistencies file-referenced  
- [x] IA proposed  
- [x] Mobile/a11y risks listed (static)  
- [x] Design system specified  
- [x] Staff booking blueprints  
- [x] Tenant branding boundaries  
- [x] Phases prioritized  
- [x] No runtime changes in UX1  
