# Phase 12C — Visual acceptance screenshots

Authenticated local captures (2026-11-22) against `http://localhost:3000` after staff sign-in.

## Implemented UI (live)

| File | Viewport | Surface |
|---|---|---|
| `phase-12c-home-375.png` | 375 | Mobile Home + bottom nav |
| `phase-12c-home-more-375.png` | 375 | Mobile More sheet |
| `phase-12c-home-768.png` | 768 | Tablet Home |
| `phase-12c-home-1440.png` | 1440 | Home dashboard + sidebar |
| `phase-12c-home-1920.png` | 1920 | Home wide desktop |
| `phase-12c-home-overflow-1440.png` | 1440 | Top-bar overflow (Public inquiry) |
| `phase-12c-inquiries-1440.png` | 1440 | Inquiry queue under new shell |
| `phase-12c-inquiry-detail-1440.png` | 1440 | Inquiry detail; Inquiries stays active |
| `phase-12c-schedule-1440.png` | 1440 | Master Schedule under new shell |
| `phase-12c-team-1440.png` | 1440 | Settings → Team |

## Reference / earlier

| File | Notes |
|---|---|
| `phase-12b-*-concept.png` | Phase 12B IA concepts (synthetic) |
| `auth-blocked-sign-in.png` | Capture attempt before staff re-auth |

## Capture script

```bash
pnpm test:e2e:staff:auth   # if storage state expired
node scripts/phase-12c-capture-screenshots.mjs
```

## Visual review notes

- Org chrome shows **Generations Adventureplex** (customer-facing name), not the slug.
- Location is read-only **Main Location**.
- Public Inquiry is not a primary navbar button; available via overflow / More / Home Next.
- Dashboard attention counts align with inquiry queue sections (pending confirmation + staff review + unread).
- Greeting falls back to “there” when the user profile has no first/display name (email-only profiles).
