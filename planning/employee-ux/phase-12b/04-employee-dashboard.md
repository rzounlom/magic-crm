# Phase 12B — Proposed employee homepage (dashboard)

## Replace

Current `/app`: welcome + “Session context” + permission button directory + Public Inquiry.

## Concept

A **work dashboard** that answers three questions in order:

1. **What is happening today?**
2. **What needs my attention?**
3. **What should I do next?**

Calm, sparse, deep-linked into existing modules. Not a second queue dump. Not invented analytics.

---

## Information hierarchy

```
┌─────────────────────────────────────────────────────────┐
│ Good morning, {preferredName}                           │
│ {Business name} · {Location} · {weekday date}           │
├─────────────────────────────────────────────────────────┤
│ NEEDS ATTENTION (actionable)                            │
│  [n] Awaiting staff review     → /app/inquiries         │
│  [n] Pending confirmation      → /app/inquiries         │
│  [n] Unread inquiries          → /app/inquiries         │
│  [n] Staff quote drafts*       → filtered if feasible   │
├─────────────────────────────────────────────────────────┤
│ TODAY (informational + open)                            │
│  Upcoming bookings / schedule slice → /app/schedule     │
│  Empty: “Nothing on the schedule for today.”            │
├─────────────────────────────────────────────────────────┤
│ NEXT STEPS (max 3 suggested links)                      │
│  Open inquiry queue · View schedule · (Public form ⋮)   │
└─────────────────────────────────────────────────────────┘
```

\*Only if we can count accurately from existing authorized data (see below).

---

## Data sources (honest / existing)

All counts must reuse **authorized** services already used by modules. Prefer aggregations over new product claims.

| Metric | Source of truth | Permission gate | Actionable? | Notes |
|---|---|---|---|---|
| Unread inquiry notifications | `inquiry-notification-service` / `getInquiryNotificationSummary` | `crm.inquiries.view` | Yes | Already powers the bell |
| Pending confirmation | Same filters as queue: `DEPOSIT_PENDING` / booking `PENDING_PAYMENT` via `listInquiries` | `crm.inquiries.view` | Yes | Matches `LiveAgentInquiryQueue` |
| Awaiting staff review / READY_FOR_HUMAN | `listInquiries` + queue grouping (`READY_FOR_HUMAN`, WP staff-review labels) | `crm.inquiries.view` | Yes | Reuse queue semantics — do not invent new stages |
| Open / active inquiries (summary) | `listInquiries` with existing list views | `crm.inquiries.view` | Informational | Cap list preview to 3–5 rows |
| Upcoming bookings today | `listBookings` with date filter / schedule services | `events.view` or `calendar.view` | Informational → open | Only if timezone-correct using location TZ |
| Pending bookings on schedule | Existing schedule pending panel data | `calendar.view` | Yes | Deep-link to `/app/schedule` |
| Staff WP quote drafts needing attention | WP draft panels / inquiry fields already loaded in detail | `crm.inquiries.view` (+ draft perms) | Maybe | **Only propose if a reliable list filter exists**; otherwise omit from Phase 12C |
| Recent activity feed | Inquiry activity labels | optional | Informational | Optional Phase 12D+; easy to become noise |

### Explicitly do **not** invent

- Conversion rates, revenue dashboards, “AI insights,” SLA clocks
- Cross-tenant comparisons
- Metrics requiring new pipelines or unpaid analytics products
- “Availability concerns” unless derived from existing conflict flags already shown in schedule/booking flows

---

## Section rules

### Needs attention

- Show only tiles the user can open (permission-gated)
- Each tile: count + short label + link into the **existing** list/queue
- If all zeros: single calm empty: “You’re caught up. New inquiries will appear here.”
- Prefer **counts + one next link**, not nested tables

### Today

- Short list (≤5) of today’s bookings/events in location timezone
- If user lacks bookings/calendar permission: hide section entirely
- If empty: one-line empty state, not a large empty card grid

### Next steps

- 2–3 secondary actions max
- Public Inquiry lives here or in overflow — never as the hero CTA
- No duplicate of the entire nav map

---

## Progressive disclosure

| Show immediately | Defer |
|---|---|
| Attention counts | Full queue rows |
| Today’s next event | Full schedule board |
| One primary CTA (“Review inquiries”) | Admin tools |

---

## Personalization

- Greeting uses existing display-name helpers (`formatUserDisplayLabel`) — no new identity system
- Org/location from trusted request context (same as shell)
- Dashboard content is **role-shaped**: front desk sees inquiries; inventory-only user may see a thin home with Tools links only

---

## Implementation note (Phase 12C)

Introduce a small server loader e.g. `loadEmployeeDashboard(ctx)` that:

1. Calls existing list/notification services in parallel
2. Applies the same queue classification helpers used by `LiveAgentInquiryQueue` (import shared pure helpers — do not fork business rules)
3. Returns a typed DTO for the page

No Production writes. Read-only aggregates.
