# Phase 12B — Final report for owner review

**Branch:** `phase-12b-employee-ux-redesign-proposal`  
**Baseline commit:** `e69d7f8`  
**Nature:** Design / planning only — **no Production runtime changes, no merge, no deploy**

---

## 1. Current-state UX findings

The authenticated employee app has a permission-aware UX3 shell and real operational modules, but feels like a **development utility**: overcrowded horizontal nav (ops + catalog + settings pills), a **Public Inquiry** CTA in primary chrome, a **location chip that looks clickable but is read-only**, and a Home page that is a **session directory** rather than a work dashboard. Module pages vary in density; inquiry queue is relatively strong; admin tools compete visually with front-desk work.

Full audit: [01-current-state-audit.md](./01-current-state-audit.md)

---

## 2. Full authenticated route inventory

**23** `/app` page routes across Home, Inquiries, Bookings, Schedule, Sales knowledge, Resources, Catalog sync, Operating hours, Team, and Security — each permission-gated independently of nav chrome.

Inventory: [02-route-inventory.md](./02-route-inventory.md)

---

## 3. Proposed navigation architecture

**Persistent desktop sidebar + compact top bar.**

- **Primary:** Home, Inquiries, Bookings, Schedule  
- **Tools:** Sales knowledge, Resources  
- **Settings:** Hours, Team, Security, Catalog sync  
- **Org:** customer-facing `organization.name` as ambient text — never slug as primary label  
- **Location:** discreet read-only text (no fake selector; switching not supported today)  
- **Public Inquiry:** overflow menu + Home secondary — access preserved  
- **Account / notifications:** top-bar bell + Clerk UserButton; Settings in sidebar  

Detail: [03-navigation-architecture.md](./03-navigation-architecture.md)

---

## 4. Proposed dashboard information hierarchy

Replace `/app` directory with:

1. **Needs attention** (actionable, permission-gated counts): awaiting staff review, pending confirmation, unread — deep-link to existing inquiry queue semantics  
2. **Today** (informational): upcoming bookings/schedule slice when permitted  
3. **Next steps** (≤3): open queue / schedule / public form  

Only metrics computable from existing authorized services. No invented KPIs. Draft-quote tile deferred until a reliable filter is confirmed.

Detail: [04-employee-dashboard.md](./04-employee-dashboard.md)

---

## 5. Desktop / mobile design concepts

- Desktop: sidebar + sparse top bar + attention/today dashboard  
- Mobile: compact top ambient context + bottom primary (Inquiries / Schedule / Bookings) + More  

**Mockups (concept only, not implemented):**

- [mockups/desktop-shell-dashboard.html](./mockups/desktop-shell-dashboard.html)  
- [mockups/mobile-shell-dashboard.html](./mockups/mobile-shell-dashboard.html)  

Screenshots (when captured): [screenshots/](./screenshots/)

---

## 6. Shared design-system recommendations

Calm ops workspace on existing Effortless Precision tokens + `src/components/ui` primitives. Shared page frame, StatusChip, EmptyState, AttentionTile, ListRow. No new heavy UI framework. Match public polish **quality**, not marketing layout.

Spec: [05-design-system.md](./05-design-system.md)

---

## 7. Permission and location-handling considerations

- Nav visibility continues via `loadEmployeeShellChrome` / `visibleNavIds` — **not** authorization  
- Pages keep server permission checks  
- Dashboard sections hide when the user lacks the underlying permission  
- Location remains **read-only** until a real authorized switch workflow exists  
- Multi-tenant: no Generations special-casing; labels from tenant data only  

---

## 8. Phased implementation roadmap

| Phase | Scope |
|---|---|
| **12B** | This proposal (complete) |
| **12C** | Shared shell (sidebar/top bar), overflow Public Inquiry, employee dashboard |
| **12D** | Inquiries visual frame |
| **12E** | Bookings + Schedule frame |
| **12F** | Knowledge + Resources |
| **12G** | Admin settings pages |

**Build first in 12C:** shell layout components, ambient org/location text, overflow menu, EmptyState/AttentionTile/StatusChip, dashboard loader reusing queue classifiers.

Roadmap: [06-page-principles-and-roadmap.md](./06-page-principles-and-roadmap.md)

---

## 9. Design artifacts and screenshot paths

| Artifact | Path |
|---|---|
| Package index | `planning/employee-ux/phase-12b/00-README.md` |
| Audit | `…/01-current-state-audit.md` |
| Routes | `…/02-route-inventory.md` |
| Navigation | `…/03-navigation-architecture.md` |
| Dashboard | `…/04-employee-dashboard.md` |
| Design system | `…/05-design-system.md` |
| Roadmap | `…/06-page-principles-and-roadmap.md` |
| Risks / decisions | `…/07-risks-and-owner-decisions.md` |
| Desktop mockup | `…/mockups/desktop-shell-dashboard.html` |
| Mobile mockup | `…/mockups/mobile-shell-dashboard.html` |
| Screenshots | `…/screenshots/` |

Authenticated live screenshots require a signed-in local session; synthetic mockup captures avoid customer PII.

---

## 10. Decisions requiring owner review

See [07-risks-and-owner-decisions.md](./07-risks-and-owner-decisions.md). Highest priority:

1. Approve **sidebar shell** direction?  
2. Confirm **primary vs Tools** split?  
3. Confirm **Public Inquiry** → overflow + Home secondary?  
4. Confirm **dashboard metric set** for 12C?  
5. Confirm **read-only location** until real switch exists?  
6. Which module polish after 12C: **Inquiries (12D)** or **Schedule (12E)** first?

---

## Success criteria (Phase 12B)

- Coherent, reviewable plan for the whole employee experience  
- Task-first IA; development clutter called out and redesigned on paper  
- Consistent visual foundation for future page work  
- **No Production functionality changes** until design direction is approved  

**Recommended next step after approval:** Phase 12C implementation branch for shell + homepage only.
