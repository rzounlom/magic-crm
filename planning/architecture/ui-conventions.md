# Employee UI conventions (implementation)

Shared employee-app UX primitives. Product look-and-feel remains in `.cursor/rules/magiccrm.mdc`.

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

## Pending actions

Disable the submitting control and use wording such as Adding…, Saving…, or Removing…. Ignore a second submit while pending.

## Follow-up: Employee shell polish / sticky authenticated header

The authenticated employee header currently scrolls away with the page.

Desired later behavior:

- employee header remains accessible while scrolling
- tenant switcher stays accessible
- UserButton stays accessible
- module navigation stays accessible
- no overlap with page content
- responsive behavior remains sane

This is **Employee shell polish / sticky authenticated header**. It is not part of the current inquiry presentation patch. Implement it in the employee shell (`EmployeeHeaderBar` / `EmployeeShell`), not as a per-page inquiry hack. Track it with the Employee Inquiry Workspace MVP so it cannot be forgotten.
