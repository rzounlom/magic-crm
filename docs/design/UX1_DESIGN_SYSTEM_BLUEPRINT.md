# UX1 — Design System Blueprint

**Status:** Specification only — **do not implement in UX1**.  
**Tagline:** MagicCRM — *Effortless Precision*  
**References:** Airbnb-inspired hierarchy/space; PayPal-inspired trustworthy blues — principles only, no proprietary assets.  
**Stack constraint:** Next.js App Router, React, TypeScript strict, Tailwind — prefer tokens + primitives over new UI libraries (UX2).

---

## 1. Product personality

| Attribute | Meaning in UI |
|---|---|
| Effortless | Obvious primary action; progressive disclosure; forgiving pending states |
| Precision | Exact times, statuses, and money figures; no decorative ambiguity |
| Trustworthy | Navy/blue professional surfaces; clear confirmations; semantic status colors |
| Venue-native | Dense enough for front desk; premium enough for customer proposals |

---

## 2. Foundations

### 2.1 Color — proposed MagicCRM platform tokens

Exploration values from north star, refined into roles. Final hex may adjust after contrast audit in UX2/UX7.

| Token | Role | Candidate | Notes |
|---|---|---|---|
| `--navy-950` | Deep brand / headers | `#001C64` | Shell accents, focus rings optional |
| `--brand-900` | Brand blue | `#003087` | Wordmark, key headings |
| `--action-600` | Primary action | `#0070E0` | Buttons, links |
| `--action-700` | Primary hover | darken action | |
| `--canvas-50` | Page background | `#F5F7FB` | Soft canvas |
| `--surface-0` | Cards / dialogs | `#FFFFFF` | |
| `--ink-900` | Primary text | near `#0B1220` | Replace `#142033` after contrast check |
| `--ink-600` | Secondary text | muted | |
| `--line-200` | Borders | cool gray | |

**Semantic (must remain distinct from brand blues):**

| Token | Use |
|---|---|
| `--success` | Confirmed, available |
| `--warning` | Pending confirmation, HOLD expiring, hours exception needed |
| `--destructive` | Cancel, revoke, errors |
| `--info` | Neutral informational (may lean action-blue lightly) |

**Do not** use brand blue alone to mean success or error.

**Migration from current teal** (`tokens.css` `#1b6b93`): UX2 replaces `--primary` mapping; Clerk appearance must read CSS variables or shared TS token map (eliminate hex duplication in `clerk-appearance.ts`).

### 2.2 Typography

| Role | Proposal | Current |
|---|---|---|
| UI / body | Source Sans 3 (keep) or similar humanist sans | Source Sans 3 |
| Display / page titles | Optional second family (e.g. tighter geometric or soft serif) — **choose in UX2**, one pairing only | Same as body |
| Scale | 12 / 14 / 16 / 18 / 24 / 32 / 40 | Ad hoc `text-sm` / `text-3xl` |
| Weight | 400 body, 600 labels, 650–700 titles | Partial via `.page-title` |

Rules:

- One H1 per page (`PageHeader`).
- Customer proposals may use larger display sizes; staff tools stay 14–16px dense.

### 2.3 Spacing scale

Use 4px base: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.

| Context | Default |
|---|---|
| Control padding | 12–16 |
| Card padding | 16–24 |
| Section gap | 24–32 |
| Page gutter | 16 → 24 → 32 (`px-4 sm:px-6 lg:px-8` already close) |

### 2.4 Radius, elevation, borders

| Token | Proposal | Aligns with |
|---|---|---|
| `--radius-control` | 12px | current 0.75rem |
| `--radius-card` | 16px | current 1rem |
| `--radius-dialog` | 18–20px | current |
| `--radius-pill` | full | nav chips |
| Shadow card | soft, single layer | avoid multi-glow |
| Border | 1px `--line-200` | |

Avoid: purple glow, stacked multi-shadows, default “AI purple” aesthetics (per product design rules).

### 2.5 Breakpoints

| Name | Width | Use |
|---|---|---|
| xs | 320 | Stress |
| sm | 375–390 | Phone default |
| md | 768 | Tablet / schedule switch |
| lg | 1024 | Two-column staff |
| xl | 1440 | Wide schedule |

Prefer Tailwind defaults; document any custom in UX2.

### 2.6 Motion

| Principle | Rule |
|---|---|
| Purposeful | 150–250ms for UI; page transitions optional |
| Reduced motion | Disable non-essential animation; honor `prefers-reduced-motion` for spinner, pulse, smooth scroll |
| Presence | Skeleton shimmer OK if reduced-motion falls back to static |

### 2.7 Focus

- Visible 2px ring using `--action-600` or `--navy-950`.
- Never remove outlines without replacement.
- Dialogs: trap focus; restore opener (pattern in `ConfirmDialog`).

### 2.8 Density modes

| Mode | Where |
|---|---|
| Comfortable | Customer proposal, marketing |
| Compact | Schedule grid, security permissions, inquiry queue |

Toggle later if needed; start with context-specific density, not a global user setting.

---

## 3. Component inventory (to build in UX2+)

### 3.1 App shell

| Component | Responsibility |
|---|---|
| `AppShell` | Replaces ad hoc `EmployeeShell` layout concerns |
| `AppHeader` / `MobileBottomNav` | IA from UX1 IA doc |
| `ContextChip` | Org + location |
| `PageHeader` | Already exists — extend slots |
| `ActionBar` | Sticky primary/secondary actions (booking coach) |

### 3.2 Actions & inputs

| Component | Notes |
|---|---|
| `Button` | variants: primary, secondary, ghost, destructive, sizes; loading |
| `IconButton` | 44px min touch |
| `TextField` / `TextArea` / `Select` | label, hint, error |
| `Checkbox` / `Radio` / `Switch` | |
| `DateField` / `TimeField` | event-local display rules unchanged |
| `SearchField` | full-width on mobile |
| `FilterChip` / `FilterBar` | replace local FilterButton copies |
| `PendingSubmitButton` | keep; style via Button |

### 3.3 Surfaces

| Component | Notes |
|---|---|
| `Card` | elevation optional |
| `Section` | one job per section |
| `DataList` / `Table` | table desktop; list mobile |
| `Dialog` / `Drawer` | ConfirmDialog remains pattern leader |
| `Toast` | via `notify` only |
| `Badge` / `StatusPill` | extend existing |
| `EmptyState` / `Skeleton` / `InlineError` | |
| `Stepper` | booking journey steps |
| `Timeline` | conversation / activity |
| `Calendar` primitives | schedule board refactor later |
| `BookingSummary` | totals, deposit preview, inclusions |
| `ProposalCompare` | Good / Recommended / Premium |
| `PriceBreakdown` | engine figures only — no client math |
| `ReadinessPanel` | unify HOLD + confirm |

### 3.4 Behavior matrix (every interactive)

| State | Required |
|---|---|
| Default | |
| Hover (pointer devices) | |
| Focus-visible | |
| Active | |
| Disabled | `not-allowed` cursor |
| Loading | disable + pending label |
| Error | text + aria |

Forms: field-level errors; toast for mutation outcomes (existing convention).

Destructive: `ConfirmDialog`; Cancel default focus.

Async: `BlockingMutation` for page-critical; button pending for light edits.

Optimistic UI: avoid for occupancy/confirm/HOLD — wait for server (invariant).

Permission-denied: hide nav when possible; show `SecurityStatusPanel` pattern when deep-linked.

---

## 4. Tenant branding boundaries

| Surface | MagicCRM platform | Tenant may customize | Must not change |
|---|---|---|---|
| Employee app shell | Logo mark, navy/action system, components | Org name via Clerk; future logo slot | Semantic status colors, focus rings |
| Customer intake / proposal | Layout system, components | Logo, display name, optional accent | Error/success/warning semantics; contrast floor |
| Email / future comms | Templates structure | Logo + accent | Legal/trust critical styles |
| White-label (future) | Optional remove MagicCRM wordmark on customer pages only | Domain/brand pack | Employee app remains MagicCRM-identified |

Rules:

- Generations (or any tenant) **never** hardcoded in shared components (`source-architecture` invariant).
- Tenant accent applies to decorative chrome and primary CTAs on **customer** surfaces only, with contrast checks.
- Employee app primary actions stay on platform action blue unless accessibility requires adjustment.
- No schema/settings changes in UX1; settings UX lands in UX6.

---

## 5. Staff booking screen blueprints

Domain behavior remains SBF1–SBF3. UI must not invent availability or prices.

### 5.1 Inquiry list — `/app/inquiries` (exists)

| Aspect | Blueprint |
|---|---|
| Hierarchy | PageHeader → filters/search → sectioned queues (Ready / Pending confirmation / Active…) |
| Primary | Open inquiry |
| Secondary | Public intake, notifications |
| Status | Badges; payment-neutral pending |
| Mobile | Card rows; sticky filter sheet |
| States | Empty per section; loading skeletons |

### 5.2 Inquiry detail / planner — `/app/inquiries/[id]` (exists)

| Aspect | Blueprint |
|---|---|
| Hierarchy | Identity + assignment → **Booking coach** (steps + primary CTA) → plan editor → resources → readiness → activity |
| Primary | Context-sensitive: Start Working / Check availability / Place HOLD / Confirm booking |
| Secondary | Save pending, release HOLD, message, archive, schedule link |
| Status | Inquiry + HOLD + booking chips distinct |
| Mobile | Coach as bottom ActionBar; panels as accordion; single column |
| States | Assigned-to-other warning; permission denied; readiness blockers |
| A11y | One H1; labelled notes; dialogs per ConfirmDialog |

**Unify** HOLD readiness + confirmation readiness into one `ReadinessPanel` with purpose tabs (UX4) — logic stays separate server-side.

### 5.3 Event planner (embedded; exists as `AgentWorkingPlanForm`)

| Aspect | Blueprint |
|---|---|
| Hierarchy | Date/time/guests → activities → dining/space → itinerary → price summary (engine) |
| Primary | Save working plan |
| Secondary | Reset to selection; check availability |
| Mobile | Step sections; sticky save |
| Invariant | Save does not create occupancy |

### 5.4 Proposal review — staff snapshot + customer `/plan/[token]`

| Aspect | Blueprint |
|---|---|
| Staff | Read-only selected vs working comparison |
| Customer | Tier selector + one detail card (`<lg`); three-up desktop |
| Primary customer | Book Now / Submit (existing) |
| Price | Breakdown component; inclusions list |
| Absent | In-app payment checkout |

### 5.5 HOLD readiness & exceptions (exists)

| Aspect | Blueprint |
|---|---|
| Hierarchy | Window fingerprint → blockers → exception authorize/revoke → Place HOLD |
| Primary | Place HOLD when `holdAttemptAllowed` |
| Secondary | Release / update / extend / expire |
| Status | Active HOLD + expiry countdown |
| Mobile | Full-width actions; confirm sheets |
| Invariant | PLACE_HOLD ≠ CONFIRM_BOOKING |

### 5.6 Confirmation readiness (exists)

| Aspect | Blueprint |
|---|---|
| Hierarchy | Same coach section as HOLD with purpose CONFIRM |
| Primary | Confirm booking |
| Copy | Payment-neutral; external attestation note only |
| Redirect | Booking detail (SBF3) |

### 5.7 Booking detail — `/app/bookings/[id]` (exists)

| Aspect | Blueprint |
|---|---|
| Hierarchy | Status hero → event summary → resources → financial preview (no processor) → activity |
| Primary | Open schedule; cancel if allowed |
| Mobile | Stacked sections |
| States | Confirmed / pending confirmation / cancelled |

### 5.8 Staff calendar — `/app/schedule` (exists)

| Aspect | Blueprint |
|---|---|
| Hierarchy | Day controls + filters → timeline (md+) / agenda list (mobile) → detail dialog |
| Primary | Inspect occupancy; create event dialog |
| Mobile | Agenda-first (already); improve hit targets |
| A11y | Dialog labelledby + focus restore (gap today) |

### 5.9 Screens that do not exist (mark planned)

| Screen | Phase hint |
|---|---|
| Operational Overview dashboard | UX3/UX4 |
| Customer CRM profile | UX6 |
| POS / payments | UX6 (after processor policy) |
| Hours / promotions settings | UX6 |
| Unified Booking coach as standalone route | Optional UX4 |

---

## 6. Iconography

- Prefer one open icon set (e.g. Lucide) adopted in UX2 — **not installed in UX1**.
- 16 / 20 / 24 sizes; 44px hit area for icon-only controls.
- Never status-by-icon-color alone — pair with text.

---

## 7. Quality bar for any redesigned screen

- Passes lint/typecheck; no hydration layout thrash.
- Keyboard complete for primary task.
- 375px usable without horizontal page scroll.
- Tokens only (no one-off hex in feature files).
- Engine invariants untouched.
- Empty / loading / error / success defined.
