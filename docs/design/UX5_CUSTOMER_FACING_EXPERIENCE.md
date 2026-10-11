# UX5 — Customer-Facing Experience

**Status:** Complete for public shell, intake presentation, proposal pricing UI, conversation polish, and public status surfaces.  
**FULL INTEGRATION NOT RUN.**  
**STOP after UX5** — do not start UX6 or UX8 from this document alone.

---

## 1. Existing public journey map

| Route | Components | Outcome |
|---|---|---|
| `/inquire/[organizationSlug]` | `PublicCustomerShell` → `PublicInquiryView` → `PublicIntakeWizard` | Creates inquiry; redirects to `/plan/{token}` |
| `/plan/[token]` | `PublicCustomerShell` → `PublicEventPlanView` | Tier compare / select / Book Now |
| `/conversation/[token]` | Shell → **redirect** to `/plan/{token}` | Chat UI exists but is not a live destination |

Business contracts (slug resolution, tokens, actions, pricing cents) unchanged.

---

## 2. New visual system decisions

- Reuse UX2 Effortless Precision tokens (navy mark, action blue, canvas, semantic status).
- Source Sans 3 only.
- Soft public atmosphere via restrained canvas gradient (disabled under reduced motion).
- Platform brand (`MagicCRM`) stays in the shell mark; host org name is secondary (`data-public-host`) from trusted server resolution.
- Customer surfaces use Card/Button patterns and shared focus rings — not employee admin density.

---

## 3. Public shell changes

- Optional `organizationName` host line beside MagicCRM brand.
- Inquire/plan pages compose the shell so org names can be passed (layouts are pass-through).
- Safe-area padding on non-contained shells.
- `data-public-shell` for tests/contracts.

---

## 4. Intake presentation changes (logic unchanged)

- Progress pills with `aria-current` (no Step N of 11).
- Progress + Start over stack on narrow viewports (`flex-col` → `sm:row`).
- Larger tap targets (`min-h-12` choice cards / primary actions).
- Control radius/focus tokens.
- Clearer header copy: answers help recommend; nothing reserved yet.
- Reliable section focus via double `requestAnimationFrame` (`focusPlannerSection`).
- Questionnaire sequence, fields, validation, and payload **unchanged**.

---

## 5. Proposal selection and pricing presentation

- Shared `PriceBreakdown` (`src/components/ui/price-breakdown.tsx`) — server cents only.
- Unresolved totals → “Pricing to confirm” + honest disclaimer.
- Deposit line only when `pricingComplete` + authoritative preview cents.
- Explicit: MagicCRM does not collect payment on this page.
- Selection copy: choosing a package does not guarantee inventory.
- Empty plans use a calm status card (`data-public-status`).

---

## 6. Conversation improvements

- Clearer timeline, sender distinction, break-word wrapping.
- Empty state when no messages.
- Sticky composer with larger textarea/send, `aria-busy` / status for sending.
- Safe-area padding under composer.

Note: `/conversation/[token]` still redirects to plan; components remain ready for a future live route.

---

## 7. Tenant branding behavior

| Signal | Source |
|---|---|
| Platform brand | Shell default `MagicCRM` |
| Host name | `customerFacingOrganizationName(...)` from trusted loaders |
| Logo / accent schema | **Not invented** — global tokens only |

No Generations special-casing. Semantic warning/error/success remain global.

---

## 8. Accessibility changes

- One H1 per public view.
- Progress `aria-current="step"`.
- Choice cards keep `aria-pressed` + “Selected” text.
- Contact fields retain `aria-invalid` / `role="alert"`.
- Conversation composer labeled; pending announced via `role="status"`.
- Reduced-motion: disable shell blur/gradient atmosphere.
- Inquire/plan `not-found` pages with calm, non-technical copy.

---

## 9. Responsive verification results

**Static/code-based only** — no authenticated browser screenshots in UX5.

Checked by construction: progress stacking, full-width mobile primaries, proposal card radius, composer safe-area, shell gutters.

Not verified visually at 320–1440 in a real browser.

---

## 10. Files changed (primary)

- `src/components/layout/public-customer-shell.tsx`
- `src/components/layout/public-inquiry-view.tsx`
- `src/components/layout/public-intake-wizard.tsx`
- `src/components/layout/public-event-plan-view.tsx`
- `src/components/layout/public-conversation-view.tsx`
- `src/components/layout/public-conversation-form.tsx`
- `src/components/layout/public-status-panel.tsx`
- `src/components/ui/price-breakdown.tsx`
- `src/app/inquire/[organizationSlug]/page.tsx`, `layout.tsx`, `not-found.tsx`
- `src/app/plan/[token]/page.tsx`, `layout.tsx`, `not-found.tsx`
- `src/app/globals.css`
- Tests: shell, price-breakdown, status-panel, intake, plan view updates

---

## 11. Tests added / updated

- Shell brand vs host fallback
- `PriceBreakdown` resolved/unresolved
- Public status panel (no internal IDs)
- Intake progress presentation + Start over target size
- Intake long edit/review test: removed 15s timeout; `fireEvent` helpers + post-commit focus effect; dedicated focus test
- Plan “Recommended” / inventory-not-reserved confirmation copy

---

## 12. Validation results

Recorded after implementation:

| Check | Result |
|---|---|
| `corepack pnpm lint` | Pass |
| `corepack pnpm typecheck` | Pass |
| `corepack pnpm test:unit` | Pass (576 tests) |
| Focused public integration | Not run in UX5 (presentation-only); spot-check public inquiry write boundary before merge |
| `corepack pnpm build` | Pass |

**Browser verification:** Static/code review only — no real-browser screenshots or keyboard-occlusion checks in UX5. Playwright public smoke belongs in UX7.

**Intake test flake:** Long compatibility test no longer relies on a raised timeout. Progress/edit path uses `fireEvent`; section focus runs post-commit via `useEffect`; focus is covered by a short dedicated test.

Full integration: **not run**.

---

## 13. Remaining limitations

- Conversation route still redirects to plan.
- No tenant logo/accent config.
- Pending-booking panels still mention deposit as a venue next step (honest; not checkout).
- Real-browser mobile keyboard occlusion not verified.
- Intake question flow not optimized (see UX8).

---

## 14. UX8 intake optimization backlog

Do **not** implement in UX5. Deeper questionnaire/CRM handoff work.

| Issue | Evidence | Status |
|---|---|---|
| Six progressive stages still feel long for simple parties | Code: `PLANNER_STAGES` + progressive unlock | code-confirmed |
| No Back control — recovery via Review edit only | Code + unit test asserts no Back button | code-confirmed |
| Attraction multi-select + Continue adds a step | Code: experience stage | code-confirmed |
| Guest-count digits-only may confuse international users | Code: `replace(/\D/g)` | code-confirmed |
| Date + 12h selects are multi-control heavy on phones | Code: Hour/Minute/AM-PM group | code-confirmed |
| Budget bands vs “not a quote” still needs clearer education | Copy present; comprehension unknown | requiring user research |
| Lost progress on refresh (no autosave) | No persistence beyond submit | code-confirmed |
| Contained `h-dvh` + iOS keyboard occlusion risk | Shell `contained` + UX1 note | requiring user research / visual confirm |
| Conditional questions (skip food/space for some event types) | Not implemented | requiring user research |
| CRM field mapping / abandonment analytics | Out of scope today | requiring user research |
| Activity catalog overwhelm for large attraction lists | Depends on tenant catalog size | requiring user research |
| Error recovery after failed submit (toast only) | Code: `notify.error` | code-confirmed |

---

## UX6 handoff

1. Remaining staff modules (settings/catalog polish) can reuse public token patterns lightly.
2. Do not start UX8 questionnaire redesign until UX5 is accepted.
3. Playwright public smoke belongs in UX7.
