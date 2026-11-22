# Phase 12D — Current-state UX audit

## Queue (`/app/inquiries`)

### What works

- Active / Archived tabs with real DB filters
- Sectioned Active list using authoritative helpers (`isPendingConfirmation`, selected vs otherReady, rest)
- WP intakes (`PUBLIC_EVENT_REQUEST`) correctly suppress `CUSTOMER SELECTED PLAN — READY TO BOOK`
- Permission-gated page load

### Pain

1. Dense rows: dual badges + ALL-CAPS banner + plan line + stage/HOLD + CTA + timestamp
2. Duplicate “ready to book” copy (badge and banner on non-WP priority rows)
3. Long page description (“not a payment tool” essay)
4. Dashboard attention tiles all link to unscrolled `/app/inquiries`
5. Unread is not a queue section (correct) but deep-link gives no focus
6. “Other inquiries” heading omitted when Ready section is empty
7. Technical HOLD / legacy stage wording competes with primary scan fields

### Essential vs secondary (queue row)

| Essential | Secondary |
|---|---|
| Customer/org name | Assignee |
| Event type · date · guests | Plan title / price |
| One status chip | Workflow stage |
| Next-action hint | HOLD expiry detail |
| | Created/selected timestamp |

## Detail (`/app/inquiries/[id]`)

### Dual surface (must preserve)

| Path | When | UI |
|---|---|---|
| Live Agent | Selected plan and no WP staff-draft provenance | Booking coach + readiness + working plan |
| WP tabs | Otherwise (typical WP intake) | Header + status cards + Overview / Staff quote / Recommendations / Activity |

### WP path pain

1. Header + Overview + Recommendations repeat event/contact/attraction fields
2. Four equal status cards push tabs below the fold
3. Next-action messaging duplicated (page strip + Recommendations + quote banner)
4. Staff-facing jargon: `tenant_live`, permission slugs, “unit cents”
5. Delivery policy is correct but easy to misread as “send available”

### Live Agent path pain

1. Header + assignment + archive compete with Booking coach above the fold
2. Long single scroll; customer/history already progressive but still heavy
3. Preserve HOLD vs confirm separation and readiness anchor IDs

## Labels to preserve carefully

- WP: “Event inquiry — staff review required” (never READY TO BOOK banner)
- Legacy non-WP selected plan: may keep ready-to-book semantics
- `canDeliver: false` blocked messaging must stay visible
