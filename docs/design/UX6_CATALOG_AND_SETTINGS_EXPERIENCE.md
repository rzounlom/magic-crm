# UX6 — Catalog & Settings Experience

**Status:** Complete for existing Catalog and Settings admin surfaces.  
**FULL INTEGRATION NOT RUN.**  
**STOP after UX6** — do not start UX7 or UX8 from this document alone.

---

## 1. Audited routes

| Route | Role | Gate (service/action) |
|---|---|---|
| `/app/admin/ai/knowledge` | Sales knowledge list | `AI_VIEW` / manage CTA `AI_MANAGE` |
| `/app/admin/ai/knowledge/new` | Create offering fact | `AI_MANAGE` (action) |
| `/app/admin/ai/knowledge/[id]` | Edit / view-only | `AI_VIEW` load; save `AI_MANAGE` |
| `/app/admin/resources` | Resource type list | `INVENTORY_MANAGE` |
| `/app/admin/resources/new` | Create type | action-gated |
| `/app/admin/resources/[id]` | Type + units + knowledge links | action-gated |
| `/app/admin/team` | Employee directory | `USERS_VIEW` / invite `USERS_MANAGE` |
| `/app/admin/team/invite` | Invitation form | `USERS_MANAGE` |
| `/app/admin/team/invitations` | Pending invitations | view + manage actions |
| `/app/admin/team/[userProfileId]` | Member groups | view; group edits `SECURITY_GROUPS_MANAGE` |
| `/app/admin/security-groups` | Group list | `SECURITY_GROUPS_VIEW` / manage CTAs |
| `/app/admin/security-groups/new` | Create group | `SECURITY_GROUPS_MANAGE` |
| `/app/admin/security-groups/[id]` | Details, permissions, members | view / manage |

Presentation-only changes. FormData names, actions, and permission semantics unchanged.

---

## 2. Before / after design structure

**Before:** Mixed “Admin” eyebrows, raw links for CTAs, unlabeled dense inputs, hand-rolled status pills, long security checkbox lists, view-only knowledge still showed Save.

**After:** Catalog / Settings IA chrome, Card list rows, Field-labeled forms in section cards, Badge status, FormActionBar save/cancel hierarchy, scrollable permission matrix grouped by module, read-only knowledge when `!AI_MANAGE`.

---

## 3. Catalog improvements (Sales knowledge)

- Title aligned with UX3 nav: **Sales knowledge**
- Eyebrow `Catalog`; `ButtonLink` Add; Card rows + type/inactive Badges
- Form sections: Offering · Pricing & capacity · Notes
- Honest price-text hint (not checkout / tax)
- Read-only presentation when manage permission is absent

---

## 4. Resource inventory improvements

- List: Catalog eyebrow, Configured / Configuration required Badges
- Detail: PageHeader, section headers, Card-based create/bulk/row editors
- Mobile-friendlier resource rows (stacked grids vs cramped `sm:grid-cols-6`)
- Knowledge requirement section uses shared Field controls

Inventory rules, bulk max 40, and requirement quantity rules unchanged.

---

## 5. Team management improvements

- Settings eyebrow; segmented Employees / Pending invitations tabs (`ButtonLink` + `aria-current`)
- Directory cards with group Badges (including “No security groups”)
- Invite form: Field email, AdminChoiceRow group checkboxes (none pre-selected)
- Invitations: status Badges; destructive/secondary PendingSubmit variants
- Member detail: PageHeader identity, Card group rows, Field select to add

Clerk invitation / membership behavior unchanged.

---

## 6. Security group improvements

- Settings eyebrow; Create via ButtonLink; Badge for Administrators / Default / Custom
- Detail: PageHeader + badges; Field details form
- Permission matrix: module groups, sticky module labels, scroll region (`data-permission-matrix`), selected row affordance + Required badge for locked admin keys, exact `entry.key` shown
- Add member: Field picker + stacked mobile layout
- Delete custom group in explicit Danger zone

No permission model simplification; locked Administrator permissions still force-submitted via hidden inputs.

---

## 7. Shared components adopted

| Component | Path |
|---|---|
| AdminBackLink, AdminSectionHeader, AdminFormSection, FormActionBar, AdminChoiceRow | `src/components/layout/admin-form-chrome.tsx` |
| Button / ButtonLink (`aria-current` support) | `src/components/ui/button.tsx` |
| Field*, Badge, Card, PageHeader, EmptyState, PendingSubmitButton `variant` | existing UX2 |

---

## 8. Navigation consistency

- URLs unchanged; UX3 Catalog / Settings groups remain source of truth (`employee-navigation.ts`)
- No POS / Payments / tax / hours entry points added
- Back links use AdminBackLink to list pages

---

## 9. Responsive checks

**Static / code-contract verification only** (no real-browser screenshots in UX6):

- List cards stack with wrap-friendly badge columns
- Resource rows use `sm`/`lg` grids instead of 6-column phone cram
- Permission matrix scrolls inside its region (`max-h` + `overflow-y-auto`); page chrome stays within gutters
- Team tabs + Invite wrap; invitation actions wrap
- Add-member picker stacks on narrow widths

Target widths 320–1440 noted; Playwright smoke deferred to UX7.

---

## 10. Accessibility changes

- One H1 via PageHeader per page
- Field labels / hints / checkbox legends
- Permission rows: description `aria-describedby`, Required text badge (not color-only)
- Team tabs `aria-current="page"`
- Focus rings via shared control classes
- Touch-friendly min heights on checkboxes/actions
- ConfirmDialog retained for destructive team/security actions

---

## 11. Files changed (primary)

- `src/components/layout/admin-form-chrome.tsx` (new)
- `sales-knowledge-form.tsx`, `resource-type-form.tsx`, `resource-inventory-forms.tsx`, `knowledge-requirement-form.tsx`
- `team-section-tabs.tsx`, `employee-member-picker.tsx`
- All 13 admin route pages under `src/app/app/admin/**`
- `src/components/ui/button.tsx` (`aria-current` on ButtonLink)
- `planning/architecture/ui-conventions.md`
- Unit tests listed below

---

## 12. Tests added

- `tests/unit/admin-form-chrome.test.tsx`
- `tests/unit/sales-knowledge-form.test.tsx`
- `tests/unit/team-section-tabs.test.tsx`
- `tests/unit/admin-catalog-settings-presentation.test.tsx`

Domain/integration tests not weakened. Focused integration for action wiring: not required (no payload changes).

---

## 13. Validation results

Recorded after implementation:

| Check | Result |
|---|---|
| `corepack pnpm lint` | Pass |
| `corepack pnpm typecheck` | Pass |
| `corepack pnpm test:unit` | Pass (588 tests) |
| Focused integration | Not run — no server-action contract changes |
| `corepack pnpm build` | Pass |

**Browser verification:** Static/code-contract only — no real-browser screenshots in UX6.

Full integration: **not run**.

---

## 14. Known limitations

- Real-browser responsive / keyboard matrix verification not executed
- Invitation dates still use `toLocaleDateString` (display-only; not booking wall-clock)
- No tenant logo/branding schema
- Sales knowledge remains AI knowledge store — not a full product catalog engine
- POS / payments / reports / hours / tax / promotions settings intentionally absent

---

## 15. UX7 handoff

1. Playwright public + admin smoke (keyboard, permission matrix overflow, mobile More menu)
2. Broader a11y pass across employee shell
3. Optional timezone-aware invitation timestamps if product prioritizes

Do not start UX7 automatically from this phase.

---

## 16. Product capabilities intentionally not implemented

- POS
- Payments / platform fees
- Reporting dashboard
- Customer CRM module
- Operating-hours settings
- Promotions settings
- Tax settings / tax activation
- Tenant branding schema
- Public intake redesign (UX8)
- Pricing / inventory / HOLD / confirmation engine changes
