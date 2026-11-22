# Phase 12E — Audit limitations

| Limitation | Impact | Mitigation used |
|---|---|---|
| Local Clerk `playwright/.auth/staff.json` / `event-sales.json` expired (created 2026-11-11) | Could not complete synthetic local quote **write** tests | Production read-only UI inspection + code review of forms/actions |
| Front Desk / Operations no live sessions | Role matrix from permission templates + nav code | Documented as template-level, not live UI |
| Did not place HOLD / confirm / approve on any record | Could not observe post-action toasts end-to-end | Inspected disabled/gated controls and copy in situ |
| Browser automation soft-nav flake on Home tiles | One click did not route until direct URL | Treated as unconfirmed P3 |
| Viewport switch remount (“Getting your workspace ready”) | Brief interruption during mobile capture | Noted under mobile findings |
| Production WP inquiry contains real contact fields | PII risk in screenshots | Redacted in-page before select captures; Ada LA fixture is synthetic email |

When Phase 12F starts, re-bootstrap: `pnpm test:e2e:staff:auth` against `magiccrm-test-center-b` only.
