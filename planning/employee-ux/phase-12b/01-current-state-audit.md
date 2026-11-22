# Phase 12B — Current-state UX audit

## Executive finding

The employee app has a **real permission-aware shell** (UX3) and solid operational modules, but the overall experience still reads as a **developer console**: crowded horizontal nav, technical session framing on Home, a prominent Public Inquiry control that breaks staff flow, a location chip that looks interactive but is not, and page-to-page inconsistency in density and hierarchy.

Public inquire / landing now feel intentional. The authenticated workspace does not yet share that calm.

---

## Shell & navigation

### What works

- Central nav map in `src/lib/ui/employee-navigation.ts` with permission gating via `loadEmployeeShellChrome()`
- Mobile bottom bar + More sheet (Inquiries / Schedule / Bookings + overflow)
- Sticky header with backdrop blur; shared Effortless Precision tokens
- Notification bell for unread inquiries (permission-gated, 15s poll)
- Clerk org switcher and UserButton for multi-org / account / sign-out

### Problems

1. **Horizontal module nav is overcrowded** — three pill clusters (Bookings & Events / Catalog / Settings) compete in one sticky strip; Overview is absent from desktop nav; Hours + Catalog sync were added later and deepen the clutter.
2. **Public Inquiry is first-class chrome** — bordered button next to notifications; visually equals core ops destinations; opens new tab but sits in the primary action zone.
3. **Context chip looks like a control** — bordered surface with org + location; comment in code confirms it is **not** a location switcher. “Main Location” (or any seeded location name) appears clickable to staff.
4. **Org identity is split awkwardly** — context chip shows DB `organization.name`; Clerk switcher shows Clerk org; brand mark always says MagicCRM. Slug is not in the chip today (good), but catalog-sync still surfaces slug/ID in admin (acceptable for admin-only pages).
5. **No persistent spatial model** — every page restarts under a dense top bar; no left rail for primary destinations; active state is easy to miss among pills.

---

## Homepage `/app`

### Current concept

Welcome + “Session context” card (org/location) + button piles of permitted modules + Public inquiry CTA.

### Problems

- Reads as a **directory / debug panel**, not “what needs attention today”
- Duplicates navigation already in the header
- No inquiry queue counts, draft-quote attention, or today’s schedule summary
- Language (“Resolved from trusted Clerk organization…”) is engineering-facing

---

## Module-level patterns (cross-cutting)

| Pattern | Issue |
|---|---|
| Page headers | Inconsistent eyebrow/title/description density |
| Lists / queues | Inquiry queue is relatively strong; other lists vary |
| Admin forms | Functional but visually heavier than public polish |
| Progressive disclosure | Inquiry detail tabs help; other pages dump more at once |
| Empty states | Present in places; not a shared system |
| Secondary actions | Public Inquiry / sync / invite compete with primary work |
| Technical copy | Slugs, IDs, “session context”, permission-debug tone |

---

## Module snapshots

### Inquiries (`/app/inquiries`, `/app/inquiries/[id]`)

- **Purpose:** Front-desk CRM — queue + staff review / quote / booking coach
- **Users:** Anyone with `crm.inquiries.view` (+ deeper actions by permission)
- **Strengths:** Queue grouping, WP staff-review labels, notification awareness
- **Weaknesses:** Detail page density; chrome noise above the real work; READY TO BOOK legacy edge cases already mitigated for WP

### Bookings

- **Purpose:** List / create / detail bookings
- **Users:** `events.view` (+ manage for edits)
- **Weaknesses:** Feels secondary to inquiries; shell doesn’t elevate “today’s events”

### Schedule

- **Purpose:** Master schedule board + pending bookings
- **Users:** `calendar.view`
- **Strengths:** Domain-rich board
- **Weaknesses:** Needs breathing room; chrome height vs sticky elements historically fragile

### Sales knowledge / Resources / Catalog sync

- **Purpose:** Catalog & AI sales config; inventory; tenant catalog apply
- **Users:** `ai.view`, `inventory.manage`, `catalog.manage`
- **Weaknesses:** Admin tools live in the same visual band as front-desk ops; Catalog sync is powerful and rare — should not sit next to Inquiries

### Operating hours / Team / Security

- **Purpose:** Location hours policies; invites; permission groups
- **Users:** `locations.manage`, `users.view`, `security_groups.view`
- **Weaknesses:** Settings mixed into horizontal ops nav; Hours labeled short (“Hours”) in a crowded strip

---

## Common patterns to standardize

1. **Primary destinations** (daily work) vs **admin destinations** (configure the venue)
2. **One primary CTA per page**; secondary actions in overflow / page menus
3. **Read-only context** styled as text, never as faux buttons
4. **Dashboard cards** that deep-link into filtered lists — not duplicate nav
5. Shared **empty / loading / error** blocks
6. Consistent **page frame**: title row → optional filters → primary content → secondary panels

---

## Quality benchmark (already shipped)

Public inquire form and marketing landing demonstrate:

- Clear hierarchy, calm spacing, intentional cards
- Customer-facing org name as hero identity
- Restraint on technical chrome

Employee redesign should match that intentionality without copying marketing gradients into ops screens.
