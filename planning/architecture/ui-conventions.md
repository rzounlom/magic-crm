# Employee UI conventions (implementation)

Shared employee-app UX primitives. Product look-and-feel remains in `.cursor/rules/magiccrm.mdc`.

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
- Confirm Payment & Book → Confirming…
- Expire Hold (legacy rows only) → Expiring…
- Master Schedule Previous / Today / Next / Go → Loading…; conflicting date and type controls disable until navigation completes. Keep the current grid visible.

## Follow-up: Employee shell polish / sticky authenticated header

The authenticated employee header currently scrolls away with the page.

Desired later behavior:

- employee header remains accessible while scrolling
- tenant switcher stays accessible
- UserButton stays accessible
- module navigation stays accessible
- no overlap with page content
- responsive behavior remains sane

This is **Employee shell polish / sticky authenticated header**. It is not part of the Live Agent Booking Workspace. Implement it in the employee shell (`EmployeeHeaderBar` / `EmployeeShell`), not as a per-page inquiry hack.
