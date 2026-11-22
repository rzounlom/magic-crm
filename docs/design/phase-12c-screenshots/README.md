# Phase 12C — Visual acceptance screenshots

Authenticated local captures (2026-11-22) against `http://localhost:3000` after staff sign-in.

CDP `Page.captureScreenshot` with `Emulation.setDeviceMetricsOverride` (true viewport). Cursor IDE `browser_take_screenshot` paints a wider canvas and can look like right-edge clipping even when `document.scrollWidth === clientWidth`.

## Implemented UI (live)

| File | Viewport | Surface |
|---|---|---|
| `phase-12c-home-375.png` | 375 | Mobile Home + bottom nav |
| `phase-12c-home-more-375.png` | 375 | Mobile More sheet |
| `phase-12c-home-430.png` | 430 | Mobile Home |
| `phase-12c-home-more-430.png` | 430 | Mobile More sheet |
| `phase-12c-home-768.png` | 768 | Tablet Home |
| `phase-12c-home-more-768.png` | 768 | Tablet More (open/close verified) |
| `phase-12c-home-1024.png` | 1024 | Desktop Home + sidebar |
| `phase-12c-home-1440.png` | 1440 | Home dashboard + sidebar |
| `phase-12c-home-1920.png` | 1920 | Home wide desktop |
| `phase-12c-home-overflow-1440.png` | 1440 | Top-bar overflow (Public inquiry) |
| `phase-12c-inquiries-1440.png` | 1440 | Inquiry queue under new shell |
| `phase-12c-inquiry-detail-1440.png` | 1440 | Inquiry detail; Inquiries stays active |
| `phase-12c-schedule-1440.png` | 1440 | Master Schedule under new shell |
| `phase-12c-team-1440.png` | 1440 | Settings → Team (earlier capture) |

## Reference / earlier

| File | Notes |
|---|---|
| `phase-12b-*-concept.png` | Phase 12B IA concepts (synthetic) |
| `auth-blocked-sign-in.png` | Capture attempt before staff re-auth |

## Capture notes

```bash
# Preferred when Playwright staff storage is valid:
pnpm test:e2e:staff:auth
node scripts/phase-12c-capture-screenshots.mjs

# Acceptance pass used live authenticated Cursor browser + CDP
# Emulation.setDeviceMetricsOverride + Page.captureScreenshot
```

## Visual review notes

- **Horizontal clipping:** Apparent Today-card right-edge cutoffs in earlier IDE screenshots were **capture artifacts** (tool canvas ≈1000px while layout was 375–1440). Measured `scrollWidth === clientWidth` at 375/430/768/1024/1440/1920. Hardened `min-w-0` on shell/main/dashboard panels anyway.
- Org chrome shows **Generations Adventureplex** (customer-facing name), not the slug.
- Location is read-only **Main Location**.
- Public Inquiry is not a primary navbar button; available via overflow / More / Home Next.
- Desktop top-bar MagicCRM brand mark is hidden at `lg+` (sidebar carries nav); no duplicate product branding.
- Dashboard attention: awaiting staff review + pending confirmation match queue classifiers; unread matches notification service (session-lived, e.g. 4 / 1 / 12–13).
- Greeting falls back to **Welcome back** when no reliable first/display name (never “Good afternoon, there”; never email-derived).
- Schedule board may scroll horizontally inside a contained `overflow-x-auto` region; document does not.

## Acceptance metrics (local session)

See `acceptance-metrics.json`.
