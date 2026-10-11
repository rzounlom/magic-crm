# UX2 — Design Foundation Implementation

**Status:** Complete for Effortless Precision tokens + shared Button/Card/Field + three pilot surfaces.  
**FULL INTEGRATION NOT RUN.**  
**STOP after UX2** — do not start UX3 from this document alone.

---

## 1. Final token table

| Token | Role | Value |
|---|---|---|
| `--navy-950` | Deep brand / mark | `#001C64` |
| `--brand-900` | Brand blue / eyebrows | `#003087` |
| `--action-600` / `--primary` | Primary action | `#0070E0` |
| `--action-700` / `--primary-hover` | Hover | `#005BB5` |
| `--action-800` | Pressed (available) | `#004A94` |
| `--canvas-50` / `--background` | Page canvas | `#F5F7FB` |
| `--surface` | Cards | `#FFFFFF` |
| `--ink-900` / `--foreground` | Primary text | `#0B1220` |
| `--ink-600` / `--muted-foreground` | Secondary text | `#5A6578` |
| `--line-200` / `--border` | Borders | `#D5DEEA` |
| `--line-100` / `--border-subtle` | Subtle borders | `#E8EEF6` |
| `--muted` | Chip / nav wells | `#E8EEF5` |
| `--success` | Confirmed / success | `#1F7A4D` |
| `--warning` | Pending / caution | `#9A6708` |
| `--destructive` | Danger | `#B42318` |
| `--info` | Informational (= action) | `#0070E0` |
| `--focus-ring` | Focus outline | `#0070E0` |
| `--accent` | Restrained gold accent | `#B8893A` |
| `--radius-control` | Controls | `0.75rem` (12px) |
| `--radius-card` | Cards | `1rem` (16px) |
| `--radius-dialog` | Dialogs | `1.25rem` (20px) |

**Compatibility:** Existing names (`--primary`, `--background`, …) retained so `bg-primary`, `text-muted-foreground`, etc. keep working. Values migrated from teal `#1B6B93`.

Shared TS sync: `src/lib/ui/brand-palette.ts` (Clerk + tests).

---

## 2. Contrast decisions and unresolved visual checks

- Action blue on white and white on action blue chosen for typical AA button contrast; **not** verified with a contrast meter in UX2.
- Status greens/ambers/reds kept independent so “confirmed” is never brand-blue alone (`Badge` / `bookingBadgeTone` unchanged).
- Muted text `#5A6578` on `#F5F7FB` — likely AA for body; *unverified visually*.
- Disabled colors intentionally lower contrast.

**Unresolved:** full WCAG matrix, dark mode (unsupported), iOS keyboard occlusion — defer UX7.

---

## 3. Typography scale

Source Sans 3 only (no second font in UX2).

| Role | Token / class | Size |
|---|---|---|
| Display / page title | `--text-display` / `.page-title` | 1.75rem |
| Section / card title | `--text-title-sm` / `CardTitle` | 1.125rem |
| Body | `--text-body` / `.page-description` | 0.9375rem |
| Label | `--text-label` | 0.8125rem |
| Caption | `--text-caption` / `.page-eyebrow` | 0.75rem |

Weights: 400 body, 600–650 titles, 700 eyebrows.

---

## 4. Spacing / radius / elevation

- 4px rhythm implied via Tailwind spacing utilities.
- Card padding presets: `sm` 16px, `md` 20px, `lg` 24px.
- Shadows: single restrained card + overlay (no glow stacks).
- Staff density preserved — no global padding inflation.

---

## 5. Component APIs

### `Button` / `ButtonLink` / `buttonClassName`

- Variants: `primary` | `secondary` | `ghost` | `destructive`
- Sizes: `sm` | `md` | `lg` (min-heights aim ≥36–48px)
- `loading` disables + `aria-busy` + pending label
- Native `type` supported (`button` default, `submit` allowed)

### `Card` / `CardTitle` / `CardDescription`

- Variants: `default` | `flat` | `elevated`
- Padding: `sm` | `md` | `lg`

### `Field` / `FieldInput` / `FieldTextarea` / `FieldSelect` / `controlClassName`

- Label association via `htmlFor` / `id`
- Hint + error (`role="alert"`, `aria-invalid`, `aria-describedby`)
- Client component (`useId`)

### Existing primitives

| Primitive | Change |
|---|---|
| `PageHeader` | Unchanged API; styles via tokenized `.page-*` |
| `Badge` | Unchanged semantics |
| `EmptyState` | `role="status"` + semibold title |
| `ConfirmDialog` | Untouched |
| `PendingSubmitButton` | Optional `variant` / `size` → Button styles |

---

## 6. Clerk appearance

`src/lib/auth/clerk-appearance.ts` imports `BRAND_PALETTE` — no competing teal hex. Auth/org/session behavior unchanged.

---

## 7. Pilot surfaces

| Surface | Migration |
|---|---|
| `/app` | `Card` for context `<dl>`; clearer description |
| `/app/inquiries` | `ButtonLink` planner CTA; view filters via `buttonClassName` |
| `/app/admin/resources` | `ButtonLink` add action in header; list rows wrap `Card` |

No booking engine, HOLD/confirm, or inquiry-detail coach changes.

---

## 8. Files changed

- `src/styles/tokens.css`
- `src/app/globals.css`
- `src/lib/ui/brand-palette.ts`, `cn.ts`
- `src/lib/auth/clerk-appearance.ts`
- `src/components/ui/button.tsx`, `card.tsx`, `field.tsx`
- `src/components/ui/pending-submit-button.tsx`, `empty-state.tsx`
- `src/app/app/page.tsx`, `inquiries/page.tsx`, `admin/resources/page.tsx`
- `tests/unit/ui-button.test.tsx`, `ui-card-field.test.tsx`
- `docs/design/UX2_DESIGN_FOUNDATION_IMPLEMENTATION.md`
- `planning/architecture/ui-conventions.md` (stale sticky/header + pending copy)

---

## 9–11. Tests and validation

- Unit: Button, Card, Field, Badge tones, brand palette (`tests/unit/ui-button.test.tsx`, `ui-card-field.test.tsx`)
- Intake wizard multi-step focus test given a 15s timeout (suite-load flake; behavior unchanged)
- Validation (2026-10-10):
  - `corepack pnpm lint` — pass
  - `corepack pnpm typecheck` — pass
  - `corepack pnpm test:unit` — 101 files / 551 tests pass
  - `corepack pnpm build` — pass
- Focused SBF integration: not required (no booking action changes)
- Full integration: **not run**

---

## 12. Responsive verification status

**Static/code-based only.** No browser screenshots or Playwright in UX2.

Checked by construction:

- Button min-heights for touch
- Filter chips wrap (`flex-wrap`)
- Card full-width in lists
- No new fixed min-widths on pilots

Not verified in a real browser at 320–1440.

---

## 13. Known limitations

- Most app buttons still use ad-hoc classes (intentional gradual migration).
- Inquiry sticky coach vs header offset remains UX3.
- No Field adoption on complex admin forms yet.
- Contrast not instrumented.
- Gold `--accent` retained but lightly used.

---

## 14. UX3 handoff

1. Introduce `--header-offset` and wire sticky booking coach.
2. Implement IA navigation (Bookings & Events grouping, mobile More, location chip).
3. Continue Button/Card adoption in shell chrome only first.
4. Do not redesign inquiry detail booking flow until UX4.
