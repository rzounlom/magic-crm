# Phase 12E — Workflow map & click measurements

## End-to-end employee map (current Production)

```text
Home (/app)
  │  Needs attention tiles
  ├─► Inquiries?focus=review     (Awaiting staff review)
  ├─► Inquiries?focus=pending    (Pending confirmation)
  └─► Inquiries?focus=unread     (scroll Active; notifications remain SoT)
        │
        ▼
Inquiries queue (Active | Archived)
  ├─ Pending confirmation        → Continue booking (LA / Book Now)
  ├─ Ready for Live Agent        → Continue booking (LA selected)
  │                              → Open inquiry (WP PUBLIC_EVENT_REQUEST)
  └─ Other inquiries             → Open inquiry (awaiting customer, etc.)
        │
        ├──── WordPress PUBLIC_EVENT_REQUEST ────┐
        │                                        ▼
        │                         Detail (tabs stay mounted)
        │                         Header + next-action + status strip
        │                           ├ Overview (prefs, funnel, summary)
        │                           ├ Staff quote (draft / edit / check avail / approve internal)
        │                           ├ Recommendations (private estimate + alts)
        │                           └ Activity & notes
        │                         Gates: canDeliver=false · availability often Not validated
        │
        └──── Legacy Live Agent selected plan ───┐
                                                 ▼
                                  Live Agent workspace (no WP tabs)
                                  Booking coach → claim → availability → HOLD? → Confirm
                                  READY TO BOOK banner (LA only — appropriate)
```

## Stage A — Discover (measured)

| Step | Expected | Actual | Clicks |
|---|---|---|---|
| Land on Home | See counts | 4 review / 1 pending / 12 unread | 0 |
| Open staff-review work | Tile → focused queue | `/app/inquiries?focus=review` | **1** |
| Distinguish urgent vs routine | Sections + status chips | Pending vs Ready vs Other; WP vs LA mixed in Ready | 0 |
| Open correct inquiry | Click card | Card → detail | **1** |
| Active vs Archived | Pills | Clear | 0–1 |

**Home → open WP inquiry:** **2 clicks** (tile + card). Efficient.  
**Friction:** Home tile label “Awaiting staff review” lands in a section titled “Ready for Live Agent.” Soft-nav from attention tile sometimes needed a full URL navigation in browser automation (possible focus/hydration flake — not confirmed as Production defect).

## Stage B–H — In-detail (WP)

| Objective | Path | Extra clicks/taps |
|---|---|---|
| Understand customer/event | Header (default Overview) | 0 |
| Prefs / food / room / attractions | Overview “Preferences & notes” | 0–1 scroll |
| Budget | Overview Budget field | 0 |
| Recommendations / itinerary | Tab Recommendations | **1** |
| Staff quote editor | Tab Staff quote | **1** |
| Availability check | Staff quote → Check availability | **2** from Overview |
| Internal approval | Staff quote → Approve internal quote | **2** (+ optional note) |
| Notes | Tab Activity & notes | **1** |
| Return to queue | Back to inquiries | **1** |
| Re-find inquiry | Queue scroll / sections | 1–N |

**Understand → open quote editor:** **1 tab click** after landing on Overview (expected path is good; default tab is Overview, not Staff quote).

## Stage — Live Agent

| Objective | Path | Notes |
|---|---|---|
| See READY TO BOOK | Queue chip + detail banner | Appropriate for LA only |
| Next action | Booking coach “Start working” | Claim required before Confirm |
| HOLD vs Confirm | Explicit copy + separate actions | Confirm disabled until claim |
| Notes | Staff notes / Add note | Present |

## Unnecessary steps / dead ends

| Finding | Type |
|---|---|
| Duplicate status (“Event inquiry — staff review required” eyebrow + banner) | Unnecessary repetition |
| Recommendations content duplicates Overview attractions + long technical pricing status line | Scroll friction |
| Customer delivery actions shown as gated (correct) — not a dead end | Intentional gate |
| Front Desk default role: no Inquiries nav | Dead end for inquiry work (permission design) |
