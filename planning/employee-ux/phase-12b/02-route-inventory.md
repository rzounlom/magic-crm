# Phase 12B — Authenticated route inventory

All routes under `/app` (employee shell via `src/app/app/layout.tsx`). Authorization is enforced in page/services; nav visibility is a separate chrome filter and **must not** be treated as security.

## Summary

| Area | Routes | Primary permission(s) |
|---|---|---|
| Home | 1 | Authenticated shell (no module permission) |
| Inquiries | 2 | `crm.inquiries.view` (+ action-specific) |
| Bookings | 3 | `events.view` / manage |
| Schedule | 1 | `calendar.view` |
| Sales knowledge | 3 | `ai.view` |
| Resources | 3 | `inventory.manage` |
| Catalog sync | 1 | `catalog.manage` |
| Operating hours | 2 | `locations.manage` |
| Team | 4 | `users.view` (+ invite manage) |
| Security groups | 3 | `security_groups.view` / manage |

**Total page routes discovered:** 23

---

## Detail inventory

### Overview

| Route | Purpose | Intended user | Primary actions | Current UX issues |
|---|---|---|---|---|
| `/app` | Session overview + module directory | Any signed-in employee with tenant context | Jump to modules; open Public Inquiry | Dev-style session card; duplicates nav; no work queue |

### Inquiries

| Route | Purpose | Intended user | Primary actions | Current UX issues |
|---|---|---|---|---|
| `/app/inquiries` | Inquiry queue (all / open views) | Staff with inquiry view | Open inquiry; scan priority groups | Stronger than most modules; still under crowded shell |
| `/app/inquiries/[id]` | Staff workspace for one inquiry | Same + deeper action permissions | Review WP data, draft/edit quote, approve, coach booking | Dense; many panels; chrome noise above work |

### Bookings

| Route | Purpose | Intended user | Primary actions | Current UX issues |
|---|---|---|---|---|
| `/app/bookings` | Booking list + filters | Events viewers | Search/filter; open; create | Functional list UI; weak “today” framing |
| `/app/bookings/new` | Create booking | Events managers | Submit booking form | Form density vs polished public forms |
| `/app/bookings/[id]` | Booking detail | Events viewers/managers | View/edit status & details | Inconsistent with inquiry detail patterns |

### Schedule

| Route | Purpose | Intended user | Primary actions | Current UX issues |
|---|---|---|---|---|
| `/app/schedule` | Master schedule + pending bookings | Calendar viewers | Scan day/board; open conflicts/pending | Sticky chrome + board height; needs calm frame |

### Sales knowledge (AI catalog config)

| Route | Purpose | Intended user | Primary actions | Current UX issues |
|---|---|---|---|---|
| `/app/admin/ai/knowledge` | List knowledge entries | AI viewers | Browse/create | Lives in primary horizontal strip as ops peer |
| `/app/admin/ai/knowledge/new` | Create entry | AI managers | Save | Admin form styling |
| `/app/admin/ai/knowledge/[id]` | Edit entry | AI managers | Update/delete | Same |

### Resources (inventory)

| Route | Purpose | Intended user | Primary actions | Current UX issues |
|---|---|---|---|---|
| `/app/admin/resources` | Resource list | Inventory managers | Browse/create | Admin in ops chrome |
| `/app/admin/resources/new` | Create resource | Inventory managers | Save | — |
| `/app/admin/resources/[id]` | Edit resource | Inventory managers | Update | — |

### Catalog sync

| Route | Purpose | Intended user | Primary actions | Current UX issues |
|---|---|---|---|---|
| `/app/admin/catalog-sync` | Apply/inspect tenant catalog packages | Catalog managers | Preview/apply sync | Rare/high-impact; too prominent in nav; may show technical IDs (admin-acceptable if framed) |

### Operating hours

| Route | Purpose | Intended user | Primary actions | Current UX issues |
|---|---|---|---|---|
| `/app/admin/operating-hours` | Location hours index | Location managers | Pick location | Short nav label “Hours”; settings mixed with ops |
| `/app/admin/operating-hours/[locationId]` | Edit hours policies | Location managers | Save policies | Domain-correct; visual polish lag |

### Team

| Route | Purpose | Intended user | Primary actions | Current UX issues |
|---|---|---|---|---|
| `/app/admin/team` | Team roster | Users viewers | Open member; invite | Settings IA |
| `/app/admin/team/[userProfileId]` | Member detail / groups | Users managers | Assign groups | — |
| `/app/admin/team/invite` | Invite flow | Users managers | Send invite | — |
| `/app/admin/team/invitations` | Pending invitations | Users managers | Resend/revoke | — |

### Security

| Route | Purpose | Intended user | Primary actions | Current UX issues |
|---|---|---|---|---|
| `/app/admin/security-groups` | Groups list | Security viewers | Open/create | Settings IA |
| `/app/admin/security-groups/new` | Create group | Security managers | Define permissions | Technical permission matrices (expected) |
| `/app/admin/security-groups/[id]` | Edit group | Security managers | Update permissions | Dense matrices need clear hierarchy |

---

## Adjacent authenticated surfaces (not `/app` pages)

| Surface | Notes |
|---|---|
| Public inquiry `/inquire/[slug]` | Customer-facing; linked from employee chrome via `PublicInquiryLink` |
| Clerk org switcher / UserButton | Account, org switch, sign-out |
| Inquiry notification control | Unread inquiries for permitted users |

## Nav ↔ permission map (chrome only)

From `EMPLOYEE_NAV_ITEMS`:

| Nav id | Permission |
|---|---|
| overview | always (shell) |
| inquiries | `crm.inquiries.view` |
| bookings | `events.view` |
| schedule | `calendar.view` |
| salesKnowledge | `ai.view` |
| resources | `inventory.manage` |
| catalogSync | `catalog.manage` |
| operatingHours | `locations.manage` |
| team | `users.view` |
| security | `security_groups.view` |

**Do not assume every user sees every route.** Front-desk staff may only see Overview + Inquiries (+ Schedule/Bookings). Admins see catalog/settings clusters.

## Location switching

**Not supported in employee chrome today.** `EmployeeContextChip` is explicitly read-only. Default location comes from request context. Proposal: never fake a selector until a real authorized switch workflow exists.
