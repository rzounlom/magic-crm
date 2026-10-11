# UX1 — Product Design Audit

**Status:** Complete (read-only).  
**Mode:** Documentation only — **no runtime/UI/business-logic changes**.  
**STOP after UX1.** Do not start UX2 from this document alone.

**Brand direction:** MagicCRM — *Effortless Precision*  
**References (principles only):** Airbnb-inspired composition/hierarchy; PayPal-inspired trustworthy blues. Do not copy proprietary assets.  
**Prior vision:** [`planning/architecture/design-north-star.md`](../../planning/architecture/design-north-star.md)  
**Current conventions:** [`planning/architecture/ui-conventions.md`](../../planning/architecture/ui-conventions.md)

**Visual verification:** Static code/CSS audit only. **No browser screenshots or viewport captures were taken in UX1.** Responsive and contrast claims that require pixels are marked *unverified visually*.

---

## 1. Route inventory (existing only)

### 1.1 Public / unauthenticated

| Path | Purpose | Role | Main components | Nav entry | Primary task | Layout | Responsive notes | Redesign priority |
|---|---|---|---|---|---|---|---|---|
| `/` | Marketing home | Anonymous | `SiteShell`, home page | Direct | Learn / sign in | Marketing header | Simple; *unverified visually* | P2 |
| `/sign-in/[[...sign-in]]` | Clerk sign-in | Anonymous → staff | Clerk | Site header | Authenticate | Clerk hosted UI | Theme via `clerk-appearance.ts` | P2 |
| `/sign-up/[[...sign-up]]` | Clerk sign-up | Anonymous | Clerk | Clerk links | Create account | Clerk | Same | P2 |
| `/accept-invitation` | Team invite acceptance | Invitee | Accept page | Email link | Join org | Minimal | *Unverified* | P2 |
| `/inquire/[organizationSlug]` | Customer intake wizard | Customer | `PublicCustomerShell`, `PublicInquiryView`, `PublicIntakeWizard` | Public URL / staff “Public inquiry” CTA | Submit inquiry | Contained `h-dvh` | Multi-step; progress row may wrap at 320px | **P0** (customer) |
| `/plan/[token]` | Proposal review / Book Now | Customer | `PublicEventPlanView` | Token URL | Compare tiers / request booking | Contained public | Desktop 3-up; `<lg` single-card selector (documented) | **P0** (customer) |
| `/conversation/[token]` | Customer messaging | Customer | `PublicConversationView` / form | Token URL | Continue chat | Public shell | Scroll + composer | P1 |

### 1.2 Authenticated employee (`EmployeeShell`)

| Path | Purpose | Permission (typical) | Main components | Nav | Primary task | Layout | UX issues | Priority |
|---|---|---|---|---|---|---|---|---|
| `/app` | Org/location/user status stub | Authenticated | `PageHeader` + `<dl>` | Logo | Context check | Narrow card | **Not an operational dashboard** | P1 |
| `/app/inquiries` | Inquiry queue | `crm.inquiries.view` | `LiveAgentInquiryQueue` | Modules | Triage leads | Sectioned lists | Dense sections; payment-neutral labels post-SBF3 | **P0** |
| `/app/inquiries/[id]` | Live agent workspace | view/manage + events.* | `LiveAgentWorkspace`, HOLD/confirm readiness, sticky actions | From queue | Plan → HOLD → confirm | Sticky guide + 2-col `lg` | Dual readiness panels; sticky vs header | **P0** |
| `/app/bookings` | Booking list | `events.view` | `BookingList`, filters | Modules | Find bookings | Filters + cards | Fixed search width `w-56` | P1 |
| `/app/bookings/new` | Manual booking start | create path | `EmployeeManualBookingForm` | Bookings CTA | Create inquiry/booking | Form page | Long form on mobile | P1 |
| `/app/bookings/[id]` | Booking detail | events.view | `BookingDetail` | List / redirect | Review confirmed/pending | Detail sections | Post-SBF3 confirm lands here | **P0** |
| `/app/schedule` | Master Schedule | `calendar.view` | `MasterScheduleBoard` | Modules | See occupancy | Desktop timeline + mobile list | Timeline `minWidth`; create dialog OK | **P0** |
| `/app/admin/resources` | Resource types | `inventory.manage` | Resource list/forms | Modules | Inventory setup | Admin list | Dense admin patterns | P1 |
| `/app/admin/resources/new` | Create type | inventory.manage | `ResourceTypeForm` | Resources | Add type | Form | — | P2 |
| `/app/admin/resources/[id]` | Edit type + units | inventory.manage | Forms + inventory | Resources | Configure units | Form | — | P1 |
| `/app/admin/team` | Staff directory | `users.view` | Team list + tabs | Modules | Manage people | Admin | — | P1 |
| `/app/admin/team/invite` | Invite | users.manage | Invite form | Team | Invite | Form | — | P2 |
| `/app/admin/team/invitations` | Pending invites | users.view | List | Team tabs | Track invites | List | — | P2 |
| `/app/admin/team/[userProfileId]` | Member detail | users.view | Member + groups | Team | Edit membership | Detail | — | P2 |
| `/app/admin/security-groups` | Groups | `security_groups.view` | Group list | Modules | Authorization | Admin | — | P1 |
| `/app/admin/security-groups/new` | Create group | manage | Form | Security | Create | Form | — | P2 |
| `/app/admin/security-groups/[id]` | Edit group perms | manage | Form | Security | Configure | Form | — | P1 |
| `/app/admin/ai/knowledge` | Sales knowledge | `ai.view` | Knowledge list | Modules | Catalog offerings | Admin | Acts as catalog UX today | **P0** (catalog stand-in) |
| `/app/admin/ai/knowledge/new` | Create item | ai.manage | `SalesKnowledgeForm` | Knowledge | Add offering | Form | Long forms | P1 |
| `/app/admin/ai/knowledge/[id]` | Edit + requirements | ai.manage | Form + requirements | Knowledge | Price/resource mapping | Form | Complex | P1 |

### 1.3 Absent or planned (permissions exist; no route)

| Surface | Evidence | Status |
|---|---|---|
| CRM contacts / customers | `PERMISSIONS.CRM_CUSTOMERS_*` in `src/types/permissions.ts`; no `/app/customers` | **Absent** |
| POS | `POS_*` permissions; no route | **Absent** |
| Payments / checkout UI | `PAYMENTS_*`; confirm is attestation-only (SBF3) | **Absent** |
| Reports / analytics | `REPORTS_VIEW`; no route | **Absent** |
| Waivers, communications automation UI | perms only | **Absent** |
| Integrations settings UI | perms only | **Absent** |
| Location settings admin UI | `LOCATIONS_*`; location only on `/app` stub + forms | **Incomplete** |
| Organization settings UI | `ORGANIZATION_SETTINGS_*` | **Incomplete** |
| Authenticated customer portal | Token/slug public only | **Absent** |
| Operating-hours policy admin UI | Engine exists (R2D); no staff settings screen found under `/app` | **Incomplete / planned** |
| Pricing promotions admin UI | Engine exists (R2A/R2B); no dedicated route found | **Incomplete** |
| Tax admin UI | Tax disabled (R2C); no collection UI | **Planned / inactive** |

---

## 2. Current design-system findings

### 2.1 Foundations that exist

| Area | Location | Observation |
|---|---|---|
| Tokens | `src/styles/tokens.css` | Teal-primary system (`#1b6b93`), soft gray canvas `#eef2f6`, gold accent `#b8893a` |
| Tailwind bridge | `src/app/globals.css` `@theme inline` | Maps tokens to Tailwind color/font/radius |
| Font | `src/app/layout.tsx` | **Source Sans 3 only** — no display pair |
| Radii / shadows | tokens + globals | Control/card/dialog/pill; light card + overlay shadows |
| Status badges | `.status-badge-*` + `Badge` | Neutral/info/success/warning/danger |
| Empty state | `.empty-state` + `EmptyState` | Dashed card pattern |
| Focus | globals | `outline: 2px solid var(--primary)` on controls/links |
| Reduced motion | globals | Only `.magiccrm-spinner` |
| Toasts | `AppToaster` + `notify` | Convention: title + text + icon |
| Destructive confirm | `ConfirmDialog` | Focus Cancel; Escape cancels |
| Page header | `PageHeader` | Eyebrow / title / description / actions |

### 2.2 Gap vs north-star exploration palette

| Role | North-star exploration | Current tokens |
|---|---|---|
| Deep navy | `#001C64` | Not used |
| Brand blue | `#003087` | Not used |
| Action blue | `#0070E0` | Not used |
| Soft canvas | `#F5F7FB` | Approximated by `#eef2f6` |
| Primary in product | — | Teal `#1b6b93` |

UX2 should reconcile: either migrate tokens toward navy/blue *Effortless Precision*, or formally adopt the current teal as MagicCRM primary. **Recommendation:** migrate toward navy/blue system (north star) while keeping semantic status colors distinct.

### 2.3 Inconsistencies (concrete)

| Issue | Evidence |
|---|---|
| No shared `Button` / `Card` | Primary class string repeated across live-agent, bookings, admin pages |
| Card radius drift | `rounded-md` vs `rounded-2xl` vs `rounded-xl` in layout components |
| Sticky guide offset fragile | `LiveAgentBookingActions` `sticky top-20` vs multi-row sticky header (`EmployeeHeaderBar`) |
| Docs stale | `ui-conventions.md` still says header scrolls away; code is sticky |
| Clerk hex duplication | `src/lib/auth/clerk-appearance.ts` hardcodes token hex |
| Raw rgb in CSS | Dialog backdrop / button inset in `globals.css` |
| Pending copy drift | SBF3 fixed many labels; `ui-conventions.md` still lists “Confirm Payment & Book” pending wording |
| Dual readiness panels | HOLD + Confirmation stacked on inquiry detail (functional, dense) |
| Location context missing in chrome | Only org switcher in header; location on `/app` stub |

### 2.4 Patterns to preserve

- Token-first color usage in most TSX (few hardcoded colors).
- Permission-gated module nav links.
- Public contained shell + progressive intake wizard.
- Schedule mobile list fallback (`md:hidden` list vs desktop timeline).
- `ConfirmDialog` focus management.
- `BlockingMutation` for page-critical actions.
- Event-local vs timestamp display helpers (ui-conventions).
- SBF1–SBF3 readiness panels and exception forms (domain-correct; need visual unification later).

---

## 3. Mobile findings (static; *unverified visually*)

Target widths to validate in UX7: 320 / 375 / 390 / 768 / 1024 / 1440.

| Risk | Severity | File evidence |
|---|---|---|
| Sticky booking guide vs tall 2-row header | **High** | `live-agent-booking-actions.tsx` `top-20`; `employee-header-bar.tsx` row wrap below `lg` |
| Shell `overflow-x-hidden` clips instead of scroll | Medium | `employee-shell.tsx` |
| Schedule desktop timeline min-width | Medium | `master-schedule-board.tsx` horizontal scroll (OK pattern) + short slot height |
| Notification popover `w-80` near right edge | Medium | `inquiry-notification-bell.tsx` |
| Booking list search `w-56` | Low–medium | `booking-list.tsx` |
| Intake progress + Start over single row | Medium at 320px | `public-intake-wizard.tsx` |
| Public inquiry CTA hidden `<md` | Medium | `employee-header-bar.tsx` |
| Module labels → icons `lg`–`xl` | Low | `module-nav-link.tsx` — discoverability risk |

**Recommendation:** mobile-specific patterns (bottom action bar for confirm, collapsible readiness, drawer filters) — not shrunk desktop.

---

## 4. Accessibility findings

### Verified in code

| Topic | Status | Evidence |
|---|---|---|
| ConfirmDialog focus / Escape / labelledby | Strong | `confirm-dialog.tsx` |
| Module nav aria-current / labels | Good | header + `module-nav-link.tsx` |
| Public intake labels / alerts | Good | `public-intake-wizard.tsx` |
| Focus-visible outlines | Present | `globals.css` |
| Reduced motion (spinner) | Partial | `globals.css` only |

### Likely / needs browser testing

| Topic | Likely issue | Evidence |
|---|---|---|
| Schedule detail dialog a11y | Missing labelledby; focus restore weaker | `master-schedule-board.tsx` |
| Staff notes textarea | No label | `live-agent-workspace.tsx` |
| Tailwind `animate-spin` / `pulse` | Not gated by reduced motion | public pending components |
| Conversation smooth scroll | Always smooth | `public-conversation-form.tsx` |
| Contrast of muted text / warning chips | *Unverified visually* | token mix formulas |
| Sticky dual layers + keyboard | Focus order under sticky chrome | inquiry detail |

**Target:** WCAG 2.2 AA for UX7 hardening.

---

## 5. Five journey audit summaries

Detailed transitions live in [`UX1_INFORMATION_ARCHITECTURE.md`](./UX1_INFORMATION_ARCHITECTURE.md). Snapshot:

| Journey | Exists end-to-end? | Top friction |
|---|---|---|
| A Front desk | Yes (SBF3) | Dense inquiry detail; dual panels; sticky overlap |
| B Event coordinator | Partial | No pipeline dashboard; messaging via conversation token |
| C Manager | Weak | `/app` stub; no revenue/reports UI |
| D Customer | Yes (intake → plan → conversation) | Branding limited; no payment; proposal good skeleton |
| E Tenant admin | Partial | Team/security/knowledge exist; settings/hours/promotions UI incomplete |

---

## 6. Business invariants (must not break in redesign)

- Engines vs org configuration; no Generations special-casing in shared UI.
- AI does not invent prices/availability.
- Confirm/HOLD revalidate server-side; exceptions purpose-specific.
- Tax disabled; no payment processor; no platform fee UI.
- Payment-neutral booking status language (SBF3).
- 24-hour proposal HOLD policy unchanged.

---

## 7. Browser tooling

| Tool | Present? |
|---|---|
| Playwright / Cypress / Storybook | **No** (`package.json` has no entries; no config files) |
| Vitest unit + integration | Yes |
| Visual regression | Absent |

Minimal adoption plan deferred to UX7 / roadmap — **do not install in UX1**.

---

## 8. Related documentation produced

- [`UX1_INFORMATION_ARCHITECTURE.md`](./UX1_INFORMATION_ARCHITECTURE.md)
- [`UX1_DESIGN_SYSTEM_BLUEPRINT.md`](./UX1_DESIGN_SYSTEM_BLUEPRINT.md)
- [`UX1_REDESIGN_ROADMAP.md`](./UX1_REDESIGN_ROADMAP.md)
