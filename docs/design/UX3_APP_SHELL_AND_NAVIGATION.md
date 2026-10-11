# UX3 — App Shell and Navigation

**Status:** Complete for Effortless Precision employee shell + responsive navigation.  
**FULL INTEGRATION NOT RUN.**  
**STOP after UX3** — do not start UX4 from this document alone.

---

## 1. Previous navigation map

Flat sticky header (`EmployeeHeaderBar`):

```
[MagicCRM] [Inquiries | Bookings | Schedule | Resources | Team | Security | AI Knowledge]
           [Public Inquiry (md+) | Notifications | Org switcher | User]
```

- Permission-gated Suspense nav links (one server component each).
- Horizontal scroll on small screens; Public Inquiry hidden below `md`.
- No location context in chrome.
- Inquiry booking coach used `sticky top-20` against a variable-height header.

---

## 2. New navigation hierarchy

Central map: `src/lib/ui/employee-navigation.ts`.

| Area | Items | Routes |
|---|---|---|
| Overview | Overview | `/app` |
| Bookings & Events | Inquiries, Schedule, Bookings | `/app/inquiries`, `/app/schedule`, `/app/bookings` |
| Catalog | Sales knowledge, Resources | `/app/admin/ai/knowledge`, `/app/admin/resources` |
| Settings | Team, Security | `/app/admin/team`, `/app/admin/security-groups` |

Not shown until screens exist: Customers, POS, Payments, Reporting.

Route URLs unchanged. “AI Knowledge” label → **Sales knowledge**.

---

## 3. Desktop layout architecture

- Compact **top** shell only (no sidebar + redundant top bar).
- Fixed-height sticky header (`--header-height` / `--header-offset`).
- Desktop (`lg+`) module nav: grouped pill clusters (Bookings & Events / Catalog / Settings).
- Brand → Overview; org switcher + notifications + account preserved.
- Read-only **context chip** (organization name + location name).
- Public Inquiry remains in the header from `md` up.
- Main content max width unchanged (`max-w-[90rem]`) for schedule/planner width.

---

## 4. Mobile navigation behavior

- Desktop module row hidden below `lg`.
- Fixed bottom bar: **Inquiries · Schedule · Bookings · More** (permission-filtered).
- **More** dialog: Overview, Catalog, Settings, Public inquiry (new tab).
- Safe-area padding on the bottom bar and More sheet.
- Main content padded with `--mobile-nav-offset`.
- Touch targets ≥ ~44px via min-heights on bottom links.

---

## 5. Permission mapping

| Nav id | Permission | Notes |
|---|---|---|
| overview | _(none)_ | Available whenever shell loads |
| inquiries | `crm.inquiries.view` | |
| bookings | `events.view` | |
| schedule | `calendar.view` | |
| salesKnowledge | `ai.view` | |
| resources | `inventory.manage` | |
| team | `users.view` | |
| security | `security_groups.view` | |
| publicInquiry | path resolution | Tenant public intake path; not a permission key |

Resolution: `loadEmployeeShellChrome()` (React `cache` per request).  
Hiding a link is **not** authorization — routes still enforce `requirePermission` / policies.

---

## 6. Organization / location context

- Organization identity: Clerk `OrganizationSwitcher` + server-resolved organization name on the context chip.
- Location: trusted `RequestContext.locationId` (`userProfile.defaultLocationId`) → location name, or “No location set”.
- Read-only — no new location switcher or persistence.
- Org switch uses `afterSelectOrganizationUrl="/app"` so chrome reloads for the new tenant (no client-cached prior location).

---

## 7. Sticky header and booking action solution

| Token | Role |
|---|---|
| `--header-height` | Stable header band (3.5rem mobile / 4rem `lg+`) |
| `--header-offset` | Sticky `top` for page action coaches |
| `--mobile-nav-offset` | Bottom clearance (0 on `lg+`) |

`LiveAgentBookingActions` now uses `top-[var(--header-offset)]` (removed `top-20`).

**Remaining UX4 work:** dedicated mobile booking action bar so the coach does not compete with the bottom nav on small viewports during long confirm flows.

---

## 8. `/app` changes

Overview (not a metrics dashboard):

- Welcome + session context (org / location)
- Permission-aware quick links by IA group
- Public inquiry secondary action when available
- No invented revenue/counts/analytics

---

## 9. Accessibility decisions

- `nav` landmarks: Modules (desktop), Primary (mobile)
- `aria-current="page"` on active module links
- More uses `<dialog>` with Escape, backdrop click, Close, focus move to Close on open and restore to More on close
- Group labels via `role="group"` + `aria-label` (sr-only text)
- Active state uses color **and** background (not color-only)
- Reduced-motion: disable backdrop blur on shell chrome

---

## 10. Responsive verification results

**Static/code-based only** in UX3 (no authenticated browser screenshots in this phase).

Checked by construction:

- Fixed header height tokens
- Bottom nav + safe-area
- Main padding via `--mobile-nav-offset`
- Public inquiry in More on phones
- Desktop groups at `lg+`

Not verified in a real browser at 320–1440.

---

## 11. Files changed

- `src/lib/ui/employee-navigation.ts`
- `src/components/layout/employee-shell.tsx`
- `src/components/layout/employee-shell-chrome.ts`
- `src/components/layout/employee-header-bar.tsx`
- `src/components/layout/employee-mobile-nav.tsx`
- `src/components/layout/employee-context-chip.tsx`
- `src/components/ui/module-nav-link.tsx`
- `src/components/layout/live-agent-booking-actions.tsx`
- `src/components/layout/public-inquiry-link.tsx`
- `src/components/layout/ai-knowledge-nav-link.tsx` (label)
- `src/app/app/page.tsx`
- `src/styles/tokens.css`, `src/app/globals.css`
- `planning/architecture/ui-conventions.md`
- Tests: `employee-header-bar`, `employee-navigation`, `employee-shell-chrome`

Legacy per-route `*-nav-link.tsx` server helpers remain in tree but are unused by the shell (chrome loader replaces them).

---

## 12. Tests added

- Nav permission/route map + mobile ordering
- Active route / Overview exactness
- Mobile More + public intake
- Header grouping, context chip, Public Inquiry, UserButton ungated
- Sticky token presence / no `top-20`
- No phantom Customers/POS/Payments/Reports links

---

## 13. Validation results

Recorded 2026-10-10:

- `corepack pnpm lint` — pass
- `corepack pnpm typecheck` — pass
- `corepack pnpm test:unit` — 103 files / 565 tests pass
- `corepack pnpm build` — pass

Full integration: **not run**.

---

## 14. Known limitations

- Booking coach sticky still shares the viewport with the mobile bottom nav (UX4 action bar).
- No multi-location switcher.
- Legacy `*-nav-link.tsx` files not deleted (safe unused wrappers).
- Real-browser responsive QA deferred.
- Clerk OrganizationSwitcher width still constrained on narrow phones.

---

## 15. UX4 handoff recommendations

1. Replace dual readiness panels + sticky coach with a unified Booking coach / ActionBar that owns mobile bottom-safe placement.
2. Keep `--header-offset` / `--mobile-nav-offset` as the shell contract.
3. Do not redesign schedule engine or HOLD/confirm semantics — chrome only where needed.
4. Optionally remove unused `*-nav-link.tsx` wrappers once UX4 lands.
5. Add Playwright smoke for shell landmarks only in UX7, not UX4.
