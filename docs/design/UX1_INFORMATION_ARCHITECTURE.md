# UX1 — Information Architecture

**Status:** Complete (read-only recommendations).  
**Companion:** [`UX1_PRODUCT_DESIGN_AUDIT.md`](./UX1_PRODUCT_DESIGN_AUDIT.md)

---

## 1. How navigation works today

### 1.1 Global employee chrome

Source: `src/components/layout/employee-shell.tsx`, `employee-header-bar.tsx`.

```
[ MagicCRM ]  [ Inquiries | Bookings | Schedule | Resources | Team | Security | AI Knowledge ]
              [ Public inquiry (md+) | Notifications | Org switcher | User ]
```

| Element | Behavior |
|---|---|
| Brand | → `/app` |
| Module nav | Horizontal pill cluster; permission-gated Suspense links; horizontal scroll on small screens |
| Public inquiry | Opens tenant public intake; hidden below `md` |
| Org context | Clerk `OrganizationSwitcher` |
| Location context | **Not in chrome** (only `/app` stub + in-form defaults) |
| Sticky | Header `sticky top-0 z-30` (ui-conventions doc is stale) |

### 1.2 Permission → nav mapping (actual)

| Nav label | Permission | Path |
|---|---|---|
| Inquiries | `crm.inquiries.view` | `/app/inquiries` |
| Bookings | `events.view` | `/app/bookings` |
| Schedule | `calendar.view` | `/app/schedule` |
| Resources | `inventory.manage` | `/app/admin/resources` |
| Team | `users.view` | `/app/admin/team` |
| Security | `security_groups.view` | `/app/admin/security-groups` |
| AI Knowledge | `ai.view` | `/app/admin/ai/knowledge` |

Permissions exist without nav for customers, POS, payments, reports, locations settings, org settings (`src/types/permissions.ts`).

### 1.3 Customer navigation

No authenticated portal. Journeys are deep-linked:

- Intake: `/inquire/{slug}`
- Proposal: `/plan/{token}`
- Conversation: `/conversation/{token}`

Brand mark shows organization-facing name where wired (`customerFacingOrganizationName`); shell default brand string is `"MagicCRM"` (`public-customer-shell.tsx`).

### 1.4 Deep links & return paths (actual)

| From | To | Mechanism |
|---|---|---|
| Inquiry queue | Inquiry detail | Row link |
| Confirm success | Booking detail | `redirectTo` (SBF3) |
| Inquiry / booking | Schedule | Query `?date=&type=&start=` |
| Schedule | Booking | Record links |
| Booking list filters | Same page | Query filter |
| Admin lists | Detail / new | Standard links |

Breadcrumbs: **absent** as a system. Back links are ad hoc (“Back to inquiries”).

Workflow progress: sticky step list on inquiry detail only (`live-agent-next-step.ts`: Review → Availability → HOLD optional → Confirm).

---

## 2. Current IA problems

1. **Flat module bar** mixes operations (Inquiries/Bookings/Schedule) with administration (Team/Security/Knowledge) — cognitive load on mobile.
2. **No Overview** — `/app` is a provisioning status card, not a dashboard.
3. **Catalog lives under “AI Knowledge”** — accurate technically, misleading for managers configuring products.
4. **Location invisible** — multi-location tenants cannot see active location in chrome.
5. **Public inquiry CTA disappears on small phones** — front desk loses a common action.
6. **Settings surfaces missing** — hours, promotions, tax, org/location settings have no home.
7. **No Customers module** despite CRM permissions — contacts are inquiry-attached only.
8. **Handoffs are page-local** — dual readiness panels on inquiry detail instead of a progressive coach.

---

## 3. Proposed information architecture (hypothesis)

Labels are proposals, not final copy.

### 3.1 Primary areas

| Area | Purpose | Near-term contents (existing) | Later |
|---|---|---|---|
| **Overview** | Situational awareness | Redesigned `/app`: today’s schedule snippet, open inquiries counts, pending confirmations | Revenue/widgets when reports exist |
| **Customers** | People & relationships | *Planned* — inquiries remain entry until CRM ships | Contacts, history, waivers |
| **Bookings & Events** | Core ops | Inquiries, Bookings, Schedule, inquiry detail planner | Unified event pipeline |
| **Sales** | Front-of-house commerce | *Absent* | POS, payments (processor-agnostic) |
| **Catalog** | What you sell & invent | AI Knowledge + Resources (rename/group) | Promotions, packages UI |
| **Reporting** | Insight | *Absent* | Reports permission surfaces |
| **Settings** | Tenant config | Team, Security (+ future org/location/hours) | Integrations, tax, branding |

### 3.2 Navigation model

**Desktop**

- Left or top **primary** areas (max ~5–6).
- Secondary tabs inside Bookings & Events: Inquiries | Bookings | Schedule.
- Admin (Team, Security) under Settings.
- Knowledge + Resources under Catalog.

**Mobile**

- Bottom bar: Inquiries | Schedule | Bookings | More.
- More → Catalog, Settings, Overview, Public intake link.
- Sticky **page action bar** for confirm/HOLD (replaces fragile `top-20` guide).

**Context chip (always visible, compact)**

```
{Organization} · {Location} ▾
```

- Org switch remains Clerk-backed.
- Location selector uses trusted server default + explicit switch when multi-location lands (no schema change in UX1).

### 3.3 Keep high-frequency actions shallow

| Action | Max depth |
|---|---|
| Open inquiry | 1 click from Inquiries |
| Confirm booking | On inquiry detail (primary) |
| View today’s schedule | 1 click |
| Start public intake | Always reachable (including mobile More) |
| Check resource conflict | Schedule or rooms panel |

Do not bury confirm behind Settings or multi-step wizards.

---

## 4. Journey maps (actual screens)

### Journey A — Front desk employee

| Step | Existing screen | Transition | Friction |
|---|---|---|---|
| Find customer / inquiry | `/app/inquiries` | Open row | No true customer search module |
| Assign / review | `/app/inquiries/[id]` Start Working | Sticky CTA | Dense page |
| Plan event | `AgentWorkingPlanForm` | Save plan | Long form; no occupancy on save (good) |
| Availability | Rooms and lanes | Check Availability | Advisory only — copy must stay honest |
| Proposal | Selected plan snapshot + public plan | Customer selects externally | Staff may not see customer view side-by-side |
| Optional HOLD | HOLD readiness + Place HOLD | Exception if needed | Dual panels |
| Confirm | Confirmation readiness + Confirm booking | Redirect booking detail | Sticky overlap mobile |
| View booking | `/app/bookings/[id]` + Schedule | Links | OK |

**Missing capability (not design):** in-app payment collection.

### Journey B — Event coordinator

| Step | Existing | Gap |
|---|---|---|
| Pipeline | Inquiry queue sections | No Kanban / stage board |
| Revise proposal | Working plan form | OK |
| Resources | Rooms panel + Schedule | Context switching |
| Communicate | Conversation token / employee conversation | Split staff vs customer UIs |
| Confirm / release | Confirm + Release HOLD | HOLD optional; coverage advisory (SBF3) |

### Journey C — Manager

| Step | Existing | Gap |
|---|---|---|
| Dashboard | `/app` stub | **No** upcoming events / revenue widgets |
| Upcoming events | Schedule + Bookings filters | Usable but not summarized |
| Configuration | Team, Security, Knowledge, Resources | Hours/promotions/settings incomplete |
| Authorization | Security groups | Dense permission matrix |

### Journey D — Customer

| Step | Existing | Gap |
|---|---|---|
| Submit inquiry | `/inquire/[slug]` wizard | Strong skeleton |
| Review options | `/plan/[token]` | Good/Recommended/Premium pattern |
| Prices / inclusions | Plan cards | Engine-driven; UI clarity TBD |
| Respond | Conversation | No account portal |
| Booking status | Limited public messaging | No “my bookings” portal; payment N/A |

### Journey E — Tenant administrator

| Step | Existing | Gap |
|---|---|---|
| Org/location setup | Provisioning + `/app` display | No settings editor UI |
| Staff | Team + invitations | OK |
| Catalog/pricing | AI Knowledge forms | Misnamed; promotions UI absent |
| Permissions | Security groups | OK |
| Hours / tax / payments | Engines/docs only | **No admin UI** for hours; tax inactive; payments undecided |

---

## 5. Cross-module handoffs (proposed)

```
Overview ──▶ Inquiries (open) ──▶ Inquiry detail (plan/HOLD/confirm)
                 │                        │
                 │                        ├─▶ Booking detail
                 │                        └─▶ Schedule (date deep link)
Bookings ──▶ Booking detail ──▶ Schedule
Catalog (Knowledge) ──▶ Resource requirements ──▶ Resources inventory
Settings (Team/Security) ──▶ (future) Hours / Branding / Locations
```

Handoff rules:

- Always preserve inquiry/booking IDs in URLs.
- After confirm, land on booking detail (already done).
- Schedule deep links keep `date`, `type`, `start` query params.
- Readiness panels should become one progressive “Booking coach” (UX4), not two permanent stacks.

---

## 6. Terminology recommendations (UI copy only)

| Avoid implying | Prefer |
|---|---|
| Pending payment (unless processor paid) | Pending confirmation (SBF3) |
| AI Knowledge (for managers) | Catalog / Sales offerings (nav label) |
| Confirm Payment & Book | Confirm booking (SBF3) |
| Legacy hold | Proposal HOLD / Active HOLD |

Do not rename DB enums in UX phases.

---

## 7. IA acceptance for later phases

UX3 (shell) is successful when:

- Primary areas are role-filtered and scannable on 375px.
- Location + organization context visible without eating the viewport.
- Bookings & Events secondary nav is one tap from any booking surface.
- Admin tools are under Settings/Catalog, not competing with front-desk modules.
- Public intake remains reachable on mobile.
