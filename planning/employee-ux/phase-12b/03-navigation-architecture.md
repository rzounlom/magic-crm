# Phase 12B — Proposed navigation architecture

## Goals

- Reduce chrome clutter so employees see **work destinations**, not every admin tool
- Scale as modules grow without another horizontal pill strip
- Keep permission-aware visibility
- Stop fake interactivity (location chip)
- Demote Public Inquiry without removing access
- Separate **daily ops** from **administration**

## Recommendation: persistent desktop sidebar + compact top bar

```
┌────────────┬──────────────────────────────────────────────────────────┐
│ Brand      │  [Org name · Location]              🔔  ⋮  [Account]     │
│            ├──────────────────────────────────────────────────────────┤
│ PRIMARY    │                                                          │
│  Home      │                     Page content                         │
│  Inquiries │                                                          │
│  Bookings  │                                                          │
│  Schedule  │                                                          │
│            │                                                          │
│ TOOLS      │                                                          │
│  Knowledge │                                                          │
│  Resources │                                                          │
│            │                                                          │
│ ─────────  │                                                          │
│ Settings ▸ │                                                          │
│ (Hours,    │                                                          │
│  Team,     │                                                          │
│  Security, │                                                          │
│  Catalog)  │                                                          │
└────────────┴──────────────────────────────────────────────────────────┘
```

### Why sidebar

- Vertical space scales better than horizontal groups
- Clear active state (full-width rail highlight)
- Natural home for nested Settings without competing with Inquiries
- Matches “business app” mental model vs marketing top-nav

### Compact top bar (desktop)

Left: optional collapse control + page title breadcrumb (optional later)  
Center/right (sparse):

| Element | Treatment |
|---|---|
| Organization name | Plain text (customer-facing business name from DB); **never** slug as primary label |
| Location | Discreet secondary text when single location; **not** bordered/chip-button style |
| Notifications | Bell only (existing inquiry unread) |
| Overflow menu `⋮` | Public Inquiry (new tab), optional “Copy public link”, link to Settings |
| Account | Clerk UserButton (profile / sign-out) |
| Org switcher | Move into UserButton area or overflow if multi-org; avoid competing with org name label |

**Remove** from primary chrome: Public Inquiry button, faux location chip border, module pill clusters.

---

## Primary destinations (evaluate & recommend)

| Destination | Keep as primary? | Rationale |
|---|---|---|
| **Home** | Yes | Becomes operational dashboard (Phase 12C) |
| **Inquiries** | Yes | Core front-desk work |
| **Bookings** | Yes | Confirmed / managed events |
| **Schedule** | Yes | Day-of operational view |
| **Sales knowledge** | Secondary (“Tools”) | Config/catalog support — not every-hour for most roles |
| **Resources** | Secondary (“Tools”) | Inventory admin — not primary front-desk |

Rationale: Home / Inquiries / Bookings / Schedule answer “what’s happening and what needs action.” Knowledge and Resources are configuration/support tools — still important, but not peer to the inquiry queue for typical staff.

---

## Secondary / administrative grouping

### Tools (permission-gated)

- Sales knowledge → `/app/admin/ai/knowledge`
- Resources → `/app/admin/resources`

### Settings (collapsed section or `/app/settings` hub later)

- Operating hours
- Team
- Security groups
- Catalog sync (**last** — rare, high impact)

Settings items remain deep-linked; chrome only shows what `loadEmployeeShellChrome` permits.

Optional Phase 12C+: a lightweight Settings index page listing permitted admin destinations (reduces sidebar length for power users).

---

## Organization & location

### Organization label

- Prefer **organization.name** (customer-facing business name)
- Do **not** show slug in chrome
- Clerk org switcher remains for multi-org users but should not replace the business name as the ambient label
- MagicCRM brand mark stays product identity; business name is tenant context

### Location

| Situation | Treatment |
|---|---|
| Single authorized/default location | Plain text: `Main Location` (or real name) under org name — **no border, no hover affordance** |
| Multiple locations **with** authorized switch API | Real `<select>` / menu wired to server action |
| Multiple locations **without** switch workflow (today) | Same as single: show **active/default** location as read-only text; do not imply switching |

**Current code:** switching is out of scope (`employee-context-chip.tsx`). Proposal honors that — **no fake controls**.

---

## Public Inquiry relocation

Preserve authorized staff access (`publicInquiryHref` when chrome provides it).

**Proposed placements (pick one primary + optional secondary):**

1. **Overflow / “More” menu** in top bar (desktop) — recommended default  
2. **Home dashboard** secondary card: “Customer inquiry form” with Open / Copy link  
3. **Mobile More sheet** — keep access; remove from sticky primary chrome if present  
4. Optional: Settings → “Public intake” for admins who manage the link

Do **not** delete functionality. Do **not** keep it as a bordered primary navbar CTA.

---

## Account, notifications, settings, sign-out

| Concern | Location |
|---|---|
| Notifications | Top bar bell (existing) |
| Account / profile / sign-out | Clerk UserButton (existing) |
| Organization context | Ambient text in top bar (name) + Clerk switcher for multi-org |
| App settings (hours/team/security/catalog) | Sidebar Settings section |
| Public Inquiry | Overflow menu + Home secondary |

Avoid stacking: org chip + Public Inquiry + notifications + org switcher + user — that is today’s overcrowding.

---

## Mobile navigation

Retain bottom bar pattern with refinements:

| Slot | Items |
|---|---|
| Primary (3) | Inquiries · Schedule · Bookings (permission-filtered; reorder if fewer) |
| Home | Accessible via brand tap or More |
| More sheet | Home, Tools, Settings items, Public Inquiry, account hints |

Active indication: filled icon/label on bottom bar; sidebar unused on small screens (drawer optional later).

---

## Active-page indication

- Sidebar: solid background + left accent bar + semibold label  
- Mobile: existing primary slot highlight  
- Nested routes (`/app/inquiries/[id]`): parent **Inquiries** remains active (current `isEmployeeNavActive` prefix logic — keep)

---

## Permission awareness

Continue server-side chrome filtering:

- Only render nav items for `visibleNavIds`
- Empty Tools/Settings sections collapse entirely
- Users with only Inquiries see a short primary list — success condition, not a bug
