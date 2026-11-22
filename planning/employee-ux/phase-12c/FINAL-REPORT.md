# Phase 12C — Final report

**Branch:** `phase-12c-employee-shell-dashboard`  
**Baseline:** `e69d7f8`  
**Scope:** Shared employee shell, navigation IA, Home dashboard, tests, Phase 12B artifacts.

## 1. Shared shell components

- `EmployeeShell` — sidebar + content column layout
- `EmployeeSidebar` — Primary / Tools / Settings
- `EmployeeTopBar` — ambient org/location, notifications, overflow, Clerk controls
- `OrganizationLocationContext` — read-only text (replaced bordered chip)
- `AppOverflowMenu` — Public Inquiry (new tab)
- `AttentionTile` — dashboard attention rows
- Removed `EmployeeHeaderBar` horizontal pill nav

## 2. Navigation changes

- Groups: `primary` | `tools` | `settings`
- Primary: Home, Inquiries, Bookings, Schedule
- Tools: Sales knowledge, Resources
- Settings: Hours, Team, Security, Catalog sync
- Mobile primary: Home → Inquiries → Schedule (else Bookings) + More
- Permission filtering unchanged via `loadEmployeeShellChrome`

## 3. Organization / location

- Customer-facing `organization.name` in top bar
- Location as plain secondary text; no fake switcher
- No slug in chrome

## 4. Public Inquiry relocation

- Removed primary navbar button
- Accessible via top-bar overflow and Home “Next” secondary action
- Still in mobile More sheet

## 5. Dashboard data sources

| Metric | Source |
|---|---|
| Awaiting staff review | `listInquiries` + shared `isAwaitingStaffReview` (selected + otherReady) |
| Pending confirmation | same queue `isPendingConfirmation` |
| Unread | `getInquiryAwareness().unreadCount` |
| Today | `listBookings({ filter: today })` — org TZ (same as bookings list) |

Tiles link to `/app/inquiries` or booking detail / `?filter=today`. Read-only. No invented stages.

## 6. Mobile

- Bottom nav + More sheet retained
- Home in primary bar; overflow primary destinations under More → Primary

## 7. Permission tests

- Unit: nav map, mobile slots, sidebar filtering, overflow Public Inquiry
- Shell chrome service tests retained
- E2E selectors updated (Home vs Overview)

## 8. Cross-page compatibility

- Shell wraps all `/app/*` via existing layout
- Schedule keeps internal horizontal scroll; sidebar narrows content (expected)
- Sticky header / mobile-nav offset tokens preserved
- Production build succeeded

## 9. Screenshot paths

- `docs/design/phase-12c-screenshots/` — README, auth-blocked capture, Phase 12B concept references
- Live authenticated captures **blocked**: `playwright/.auth/staff.json` expired → sign-in redirect
- Re-run: `pnpm test:e2e:staff:auth` then `node scripts/phase-12c-capture-screenshots.mjs`

## 10. Test results

- `pnpm typecheck` — pass
- `pnpm lint` — pass (pre-existing unrelated warnings)
- Focused unit tests — pass
- `pnpm build` — pass

## 11. PR / merge

- PR opened from this branch (see PR URL in commit/PR step)
- **Merge deferred** until authenticated visual acceptance screenshots are captured (per Phase 12C gate)

## 12. Production

- Not deployed in this phase until merge after visual sign-off
- Baseline remains `e69d7f8` until merge

## 13. Remaining issues

- Staff Playwright auth expired — live UI screenshots incomplete
- Manual visual QA still required after auth refresh
- Individual page content redesigns deferred to 12D+

## 14. Unchanged operational safeguards

- No changes to public inquire, EP 3.5.0, pricing/catalog, quote approval/delivery, bookings/availability, hours policies, permissions model, email, payments, WP plugin, Scenario Lab
- `approved_plugin_baseline` / catalog `2026-11-02` / delivery pending / 25% deposit / VERIFIED hours untouched
