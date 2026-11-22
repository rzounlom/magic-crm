# Phase 12B — Shared internal design-system specification

## Direction

**Calm, modern, professional workspace.** Clarity over decoration. Intentionally built — not a collage of admin widgets.

Benchmark polish from public inquire/landing, but use **ops-appropriate** surfaces: flatter, denser where needed, fewer marketing gradients.

Reuse existing infrastructure:

- `src/styles/tokens.css` (Effortless Precision tokens)
- `src/components/ui/*` primitives (Button, Card, PageHeader, ModuleNavLink, …)
- `globals.css` employee header utilities — evolve, don’t replace wholesale

**Do not** introduce a large UI framework (no MUI/Chakra/Ant redesign). Extend tokens + primitives.

---

## Foundations

### Color & surfaces

| Role | Guidance |
|---|---|
| App background | Soft neutral (`--background` / muted wash) — not flat pure white everywhere |
| Surfaces | `--surface` / `--surface-elevated` for panels |
| Borders | Prefer `--border-subtle`; reserve strong borders for interactive controls |
| Primary actions | Existing `--primary` — one strong CTA per view |
| Danger | Existing destructive tokens for irreversible admin |
| Status | Semantic chips (success / warning / info / muted) — shared component |

Avoid purple glow / cream-serif marketing tropes in the employee shell. Keep product identity consistent with current MagicCRM mark.

### Typography

Reuse scale from tokens:

| Token | Use |
|---|---|
| `--text-display` | Rare — dashboard greeting only |
| `--text-title` / `--text-title-sm` | Page titles / section titles |
| `--text-body` / `--text-body-lg` | Body |
| `--text-label` / `--text-caption` | Meta, status, org/location ambient |

Hierarchy: **one** page title; section titles secondary; avoid stacked eyebrows + titles + subtitles + helper paragraphs on every admin page.

### Spacing & width

| Concern | Spec |
|---|---|
| Content max width | Default `max-w-5xl`–`max-w-6xl` for forms/lists; schedule/board may use `max-w-[90rem]` |
| Page padding | `px-4 sm:px-6 lg:px-8` aligned with shell |
| Vertical rhythm | 8px base; section gaps 24–32px; avoid 8px card stacks |
| Sidebar width | ~240–264px desktop; collapsible later |

### Radius & elevation

- Controls: `--radius-control`
- Panels: modest radius; **less** card-shadow stacking
- Elevation: one level for floating menus/sheets; content panels mostly flat with border/subtle bg

---

## Page structure (shared template)

```
[Shell: sidebar + top bar]
  PageHeader — title, optional description, primary action slot
  Optional filter/toolbar row
  Primary content region
  Optional secondary column / disclosure
```

Rules:

- Primary action lives in the header action slot (right)
- Secondary actions in overflow or inline text buttons
- No second competing “hero” CTA below the fold for the same job

---

## Component patterns

### Navigation

- Sidebar `NavItem`: icon optional, label, active state, badge slot (e.g. unread)
- Top bar ambient context (text)
- Mobile bottom bar + More sheet (refine existing)

### Cards & surfaces

- Cards for **interactive clusters** or distinct tasks — not wrapping every paragraph
- Dashboard attention tiles: light surface + count + label + chevron; not heavy shadows

### Tables & lists

- Prefer list rows with clear primary text + meta + status chip
- Dense tables OK for admin matrices (security permissions)
- Row hover / focus rings for keyboard users

### Status indicators

Shared `StatusChip` vocabulary aligned with inquiry/booking labels already in `inquiry-workflow-labels` — visual only; do not rename domain statuses casually.

### Actions

| Kind | Pattern |
|---|---|
| Primary | Solid button |
| Secondary | Outline / soft |
| Tertiary | Text / ghost |
| Destructive | Explicit confirm pattern (existing) |

### Empty / loading / error

| State | Pattern |
|---|---|
| Empty | Short title + one sentence + optional CTA |
| Loading | Skeleton rows matching list density (prefer over spinners for lists) |
| Error | Inline alert with retry when safe; no stack traces |

---

## Responsive behavior

| Breakpoint | Shell |
|---|---|
| `< lg` | No persistent sidebar; bottom nav + More |
| `≥ lg` | Persistent sidebar + compact top bar |
| Touch | 44px min targets on primary nav |

Schedule boards: horizontal scroll containment already used — preserve; don’t trap focus.

---

## Accessibility

- Active nav announced (`aria-current="page"`)
- Don’t rely on color alone for status
- Focus visible on all interactive shell controls
- Read-only context must not be in the tab order as a button
- Notification badge has accessible name including count
- Reduced motion: respect `prefers-reduced-motion` for shell transitions

---

## Motion

Subtle only:

- Sidebar active indicator transition
- Sheet/drawer enter
- Optional dashboard number fade-in

No decorative particle / glow effects in ops UI.

---

## Relationship to public design

| Public | Employee |
|---|---|
| Expressive marketing / form hero | Sparse workspace |
| Brand-forward first viewport | Task-forward first viewport |
| Larger display type | Title + body focused |
| Same token family | Same token family |
