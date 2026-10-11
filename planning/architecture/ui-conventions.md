# Employee UI conventions (implementation)

Shared employee-app UX primitives. Product look-and-feel remains in `.cursor/rules/magiccrm.mdc`.

Visual direction: [`design-north-star.md`](./design-north-star.md).  
Token foundation (UX2): `src/styles/tokens.css`, shared palette `src/lib/ui/brand-palette.ts`, primitives in `src/components/ui/` (`Button`, `Card`, `Field`). Full redesign phases: `docs/design/`.

## Pointer cursor

Every enabled clickable/tappable control must use cursor:pointer on desktop. Disabled interactive controls use cursor:not-allowed where appropriate. Display-only elements must not imply interactivity.

Apply this in `src/app/globals.css` for semantic controls (buttons, links, selects, summaries, tabs, menu items, checkboxes, radios, and date/time fields) and in shared primitives. Do not put `cursor: pointer` on page containers, plain text, or read-only cards. A clickable card must be a link or button. Native operating-system menus, such as `<option>` lists inside a closed `<select>`, are drawn by the platform and are outside this stylesheet.

## Mutation feedback

Use `notify` from `@/lib/ui/notify`. Do not call Sonner (or another toast library) from feature code.

- Success and error toasts include a title plus supporting text, and an icon. Color is not the only signal.
- Mount `AppToaster` once at the root layout. Do not add per-page providers.
- Field validation stays beside the field. Toasts are for mutation outcomes.

## Destructive confirmation

Use `ConfirmDialog` from `@/components/ui/confirm-dialog`. Do not use `window.confirm()`.

Confirm before actions that:

- delete data
- remove access
- cancel a confirmed object
- issue money or refunds
- irreversibly change business state

Skip confirmation for trivially reversible actions such as saving text edits.

The dialog is not authorization. Server actions still run `getRequestContext()` and `requirePermission()`. Bypassing the dialog must still fail on the server.

Cancel is the default/safe action. Focus Cancel first so Enter does not confirm a destructive action by accident. Escape cancels.

## Date and time display

Two kinds of values exist. Do not mix them.

**Event-local wall-clock** (inquiry preferred date/time, itinerary `HH:mm`, occupancy `slotDate` + minutes): display with `formatEventLocalDate` / `formatEventLocalTime` / `formatItineraryRange`. Never UTC-convert these for display. `17:30` is 5:30 PM.

**Real timestamps** (`createdAt`, `holdExpiresAt`, `startsAt`/`endsAt`): display with `formatOrganizationTimestamp` / `formatTenantTimestamp` using `resolveTenantTimezone({ organizationTimezone, locationTimezone })`. Location wins only when it is a valid IANA identifier. Invalid values such as the literal `IANA` log a config warning and fall back to `UTC`. Do not use the browser timezone as booking truth.

A Master Schedule date such as `2026-09-17` is that tenant-local civil day (`eventLocalSlotDate`), not UTC’s September 17.

## Page-critical mutations

Small updates, such as marking a notification read, use the button’s own pending state.

Creating event options, saving a public booking request, submitting a public inquiry, and confirming a booking use `BlockingMutation`. It covers the page, blocks pointer interaction, exposes the status to assistive technology, and clears when the action succeeds, navigates, or fails. Toasts still report the result.

Public planner and proposal screens keep primary actions outside the scrolling content region. Desktop proposal cards share one row. Below the `lg` breakpoint, the proposal comparison is a Good / Recommended / Premium selector with one card. Recommended starts selected. Switching tiers changes only the visible card. The summary stays fixed, the detail area scrolls inside the card, and Book Now / Submit inquiry stay on that card.

## Pending actions

Disable the submitting control and use wording such as Adding…, Saving…, or Removing…. Ignore a second submit while pending.

Demo-critical booking/schedule copy:

- Book Now → Booking…
- Submit inquiry → Submitting…
- Start Working → Starting…
- Check Availability → Checking…
- Confirm booking → Confirming…
- Expire Hold (legacy rows only) → Expiring…
- Master Schedule Previous / Today / Next / Go → Loading…; conflicting date and type controls disable until navigation completes. Keep the current grid visible.

Prefer shared `Button` / `ButtonLink` / `buttonClassName` for new or migrated chrome. Existing call sites may keep local classes until UX3/UX4. `PendingSubmitButton` accepts an optional `variant` to opt into Button styles.

## Employee shell header and navigation

Authenticated employee chrome lives in `EmployeeShell` / `EmployeeHeaderBar` / `EmployeeMobileNav`.

- Sticky header height is tokenized: `--header-height` / `--header-offset` (see `src/styles/tokens.css`).
- Sticky inquiry booking actions use `top: var(--header-offset)` — not a hard-coded `top-20`.
- Mobile primary destinations use a bottom bar (`--mobile-nav-offset` clears main content). More holds Overview, Catalog, Settings, and Public inquiry.
- Navigation visibility is resolved server-side from existing permissions (`loadEmployeeShellChrome`). Hiding a link is not authorization.
- Organization context comes from Clerk; location context is the trusted `defaultLocationId` from request context (read-only in chrome).
- Central route map: `src/lib/ui/employee-navigation.ts`.

Prefer shared `Button` / `ButtonLink` for new chrome actions. Full shell notes: `docs/design/UX3_APP_SHELL_AND_NAVIGATION.md`.

## Staff booking coach (UX4)

Inquiry detail booking guidance lives in `LiveAgentBookingActions` (`#confirm-booking`):

- Desktop: sticky under `--header-offset`
- Mobile: in-flow coach + single primary action in `.booking-mobile-action-bar` above `--mobile-nav-offset` (never a second competing bottom nav)
- HOLD and confirmation readiness stay separate server results, shared presentation via `BookingReadinessCard` (`PLACE_HOLD` vs `CONFIRM_BOOKING` purpose labels)
- Optional HOLD must remain optional; confirmation stays payment-neutral

See `docs/design/UX4_STAFF_BOOKING_EXPERIENCE.md`.

## Public customer surfaces (UX5 / UX8)

Public inquire/plan/conversation chrome uses `PublicCustomerShell` with the MagicCRM platform mark and optional host `organizationName` from trusted loaders. Proposal money display uses `PriceBreakdown` (authoritative cents only).

Public intake (`PublicIntakeWizard`) is a four-step journey (Event → Fun → When → Details) with explicit Back/Continue, venue-local start-time select, and tenant-scoped non-PII draft restore in `localStorage`. Hidden form fields and `plannerAnswersToIntakeRecord` remain the CRM submission contract — do not rename required backend fields or invent availability/payment claims. See `docs/design/UX5_CUSTOMER_FACING_EXPERIENCE.md` and `docs/design/UX8_CUSTOMER_INTAKE_OVERHAUL.md`.

## Catalog and Settings admin (UX6)

Admin Catalog (Sales knowledge, Resources) and Settings (Team, Security groups) use:

- `PageHeader` eyebrows `Catalog` / `Settings`
- Shared chrome in `admin-form-chrome.tsx` (`AdminBackLink`, `AdminSectionHeader`, `AdminFormSection`, `FormActionBar`, `AdminChoiceRow`)
- UX2 `Field*` / `Button` / `ButtonLink` / `Badge` / `Card` / `PendingSubmitButton variant`
- Permission matrix may scroll inside `[data-permission-matrix]`; do not change permission keys or defaults

Do not invent POS, payments, tax, hours, or promotions settings screens. See `docs/design/UX6_CATALOG_AND_SETTINGS_EXPERIENCE.md`.

## Browser verification (UX7)

Public smoke lives under `tests/e2e/` (Playwright). Prefer `PLAYWRIGHT_PUBLIC_ORG_SLUG` + `pnpm test:e2e:public`. Staff journeys require a local `PLAYWRIGHT_STORAGE_STATE` — never commit it. Contrast math for UX2 tokens is covered by `tests/unit/brand-contrast.test.ts`. See `docs/design/UX7_BROWSER_ACCESSIBILITY_RELEASE_READINESS.md`.
