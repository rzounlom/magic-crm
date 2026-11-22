# Phase 12D — Information hierarchy

## Queue

Keep **sectioned Active list** (no new statuses):

1. Pending confirmation (`#pending-confirmation` / `?focus=pending`)
2. Ready for Live Agent — selected then staff-review (`#ready-for-live-agent` / `?focus=review`)
3. Other inquiries (always labeled when present)

Active | Archived pills retained. Concise page description.

### Row pattern

`Name` → `Event · date · guests` → one status chip → quiet assignee → next-action → optional muted meta (plan/HOLD/time).

No badge + ALL-CAPS banner duplication. WP never shows READY TO BOOK banner.

### Dashboard deep-links

| Tile | href |
|---|---|
| Awaiting staff review | `/app/inquiries?focus=review` |
| Pending confirmation | `/app/inquiries?focus=pending` |
| Unread | `/app/inquiries?focus=unread` (scroll to top of Active; notifications remain source of truth) |

## Detail — WP path

**Understand → Review → Prepare → Act**

1. Compact header: back, name, one status, event/date/guests/contact, contact/archive actions
2. Next-action strip: attention / blocked / next step (never imply blocked delivery is available)
3. Quiet status strip: estimate · availability · quote · delivery
4. Tabs (panels stay mounted): Overview (deduped) · Staff quote · Recommendations · Activity & notes

## Detail — Live Agent path

Booking coach remains primary next-action. Tighten header. Keep readiness anchors and HOLD ≠ confirm copy. Customer/history stay progressive.
