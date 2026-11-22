# Phase 12D — Final visual acceptance

Date: 2026-11-22  
Branch: `phase-12d-inquiries-workspace`  
PR: https://github.com/rzounlom/magic-crm/pull/26  
Production: unchanged (main remains Phase 12C)

## Owner-requested spacing

Inquiry queue rows were a single bordered `divide-y` list and read as one continuous table.

Change: each inquiry is an individual card (`inquiry-queue-card`) with `--radius-card`, `border-border-subtle`, and **10px** vertical gap (`gap-2.5`) between cards. Compact row padding unchanged. Applied consistently via shared `LiveAgentInquiryQueue` (Active + Archived).

Evidence: `docs/design/phase-12d-screenshots/before-queue-card-spacing-1440.png` → `after-queue-card-spacing-1440.png`.

## Focused UX polish (non-logic)

- WP detail status strip Availability uses human labels (`Not validated`) instead of raw `NOT_VALIDATED`.

## Acceptance summary

| Area | Result |
|---|---|
| Queue hierarchy | Pending → Ready for Live Agent → Other; scannable cards |
| WP READY TO BOOK suppression | Pass (no READY TO BOOK on PUBLIC_EVENT_REQUEST) |
| Delivery blocked copy | Pass (`canDeliver: false` messaging visible) |
| Dual detail paths | WP tabs + Live Agent coach both operational |
| Dashboard `?focus=` | Maps review→ready-for-live-agent, pending→pending-confirmation, unread→top |
| Shell | Phase 12C sidebar/top bar unchanged |
| Horizontal overflow @1440 | None on queue/detail |

## Remaining (non-blocking)

- Home dashboard date hydration warning in Next.js overlay (pre-existing shell concern; not introduced by queue spacing).
- Staff quote editor still exposes “Unit cents” (precision field; left unchanged per quote-field preservation).
- Owner still decides merge timing and whether unread needs a dedicated filter later.
