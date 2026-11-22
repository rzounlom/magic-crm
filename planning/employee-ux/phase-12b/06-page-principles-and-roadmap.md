# Phase 12B — Page principles & phased implementation roadmap

## Shared page principles (all internal pages)

For every authenticated page, define and keep consistent:

| Principle | Rule |
|---|---|
| Primary user goal | One sentence at top of design notes |
| Most important information | Above the fold; everything else progressive |
| Primary action | Single header CTA when applicable |
| Secondary actions | Overflow, text buttons, or deferred panels |
| Progressive disclosure | Tabs / “Show details” / nested routes — not infinite scroll of admin |
| Shared components | PageHeader, StatusChip, EmptyState, ListRow, FilterBar, ConfirmDialog |
| Responsive | Stack filters; keep primary CTA reachable; mobile bottom nav clearance |

**Do not implement full page redesigns in 12B.** These principles guide 12C+.

---

## Page-by-page redesign roadmap (foundation → polish)

### Phase 12C — Shell + Home (first shared components)

**Implement first (avoid repetitive redesign):**

1. `EmployeeAppShell` layout: sidebar + top bar slots  
2. `EmployeeSidebar` / `EmployeeTopBar` (permission-aware)  
3. Ambient `OrgLocationContext` (text-only)  
4. `AppOverflowMenu` (Public Inquiry, etc.)  
5. `EmptyState`, `StatusChip`, `AttentionTile`  
6. `loadEmployeeDashboard` + new `/app` dashboard UI  
7. Mobile bottom bar refinements (reuse + restyle)

**Pages touched:** layout chrome + `/app` only. Domain modules unchanged functionally.

### Phase 12D — Inquiries

| Page | Primary goal | Important info | Primary action | Progressive disclosure |
|---|---|---|---|---|
| Queue | Triage work | Priority groups / counts | Open inquiry | Filters, legacy views |
| Detail | Advance one sale | Status banner, customer, plan | Context-dependent (draft / approve / book) | Tabs for WP answers, activity, raw |

Preserve Event Planner / quote / booking logic; **visual frame only**.

### Phase 12E — Bookings + Schedule

| Page | Primary goal | Important info | Primary action |
|---|---|---|---|
| Bookings list | Find/manage bookings | Status + date + customer | New booking / open |
| Booking detail | Confirm truth of reservation | Status, schedule link | Edit / status transitions |
| Schedule | See venue occupancy | Day board + pending | Open booking/inquiry |

Watch sticky header + board height regressions.

### Phase 12F — Knowledge + Resources

Treat as **Tools**: quieter chrome active state under Tools; list/detail consistency with shared ListRow/PageHeader.

### Phase 12G — Administration

Hours, Team, Security, Catalog sync:

- Live under Settings IA
- Catalog sync: warning callouts, technical IDs OK inside admin
- Security matrices: keep dense but add sticky permission group headers / search if needed later

---

## Page principle cards (summary)

### Home `/app`

- Goal: Know what to do next  
- Info: Attention counts, today slice  
- Primary: Deep-link to highest-priority queue  
- Secondary: Schedule, Public Inquiry  
- Disclose: Full lists in modules  

### Inquiries

- Goal: Clear the queue / progress deals  
- Info: Priority, age, stage  
- Primary: Open / act on current step  
- Secondary: Notifications mark-read  

### Bookings

- Goal: Manage confirmed/pending events  
- Info: When, who, status  
- Primary: Create or open  

### Schedule

- Goal: Operational awareness for the day  
- Info: Occupancy + conflicts/pending  
- Primary: Inspect slot / pending item  

### Sales knowledge / Resources

- Goal: Maintain catalog support data  
- Info: Entry list completeness  
- Primary: Create/edit  

### Hours / Team / Security / Catalog sync

- Goal: Configure the tenant safely  
- Info: Current policy / membership / permissions / package  
- Primary: Save / invite / apply (with confirm)  

---

## Technical constraints before implementation

1. **Clerk components** — OrgSwitcher / UserButton sizing and theming constraints in top bar  
2. **Sticky + mobile bottom padding** — existing `employee-app` CSS must be updated carefully for sidebar  
3. **Permission chrome ≠ authorization** — pages must keep server checks  
4. **No location switch API** — UI must stay read-only  
5. **Dashboard counts** — must share queue classification helpers to avoid label drift vs `/app/inquiries`  
6. **Schedule performance** — don’t preload full board on Home; use thin booking list queries  
7. **Multi-tenant** — never special-case Generations; names/slugs from data only  
8. **Next.js app router** — shell likely stays in `app/app/layout.tsx` + layout components under `src/components/layout`  
9. **AGENTS.md / Next docs** — read current Next conventions before coding 12C  

---

## Suggested rollout sequence (owner-facing)

| Phase | Scope | Risk to Production domain logic |
|---|---|---|
| **12B** (this) | Audit + proposal artifacts | None |
| **12C** | Shell + nav + Home dashboard | Low (chrome + read aggregates) |
| **12D** | Inquiries visual frame | Low–medium (touch detail layout carefully) |
| **12E** | Bookings + Schedule frame | Medium (layout/sticky) |
| **12F** | Tools pages | Low |
| **12G** | Settings pages | Low |

Each phase: design branch → PR → review → merge. No drive-by Production changes.
