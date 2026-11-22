# Phase 12C — Visual acceptance screenshots

## Capture script

```bash
# Requires local `pnpm dev` and a valid Playwright staff storage state:
#   pnpm test:e2e:staff:auth
node scripts/phase-12c-capture-screenshots.mjs
```

Viewports: 375, 430, 768, 1440, 1920  
Routes: Home, Inquiries, Schedule, Team, overflow/More, inquiry detail when available.

## Status (2026-11-22)

- Automated capture attempted against `http://localhost:3000` with `playwright/.auth/staff.json`.
- Storage state redirected to Clerk sign-in (expired). See `auth-blocked-sign-in.png` if present.
- Phase 12B synthetic concepts remain the IA reference under `planning/employee-ux/phase-12b/screenshots/`.
- After regenerating staff auth, re-run the capture script and commit the PNG set before treating visual acceptance as complete.

## Review checklist (manual after auth)

- [ ] Home dashboard at 1440 / 375
- [ ] Sidebar + top bar (no Public Inquiry primary button; ambient org/location text)
- [ ] Overflow Public inquiry link works
- [ ] Mobile More sheet
- [ ] Inquiry queue / detail under new shell
- [ ] Schedule board width usable
- [ ] One Settings page (Team)
