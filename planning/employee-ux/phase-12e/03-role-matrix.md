# Phase 12E — Role-based usability matrix

Source of truth: `src/server/authorization/default-security-groups.ts` + inquiry detail permission checks in `src/app/app/inquiries/[id]/page.tsx`.

Live auth samples available historically: Administrator (`staff.json`), Event Sales (`event-sales.json`). Both local sessions **expired** during this audit. Production walkthrough used an Administrator-capable Generations session (read-only). Front Desk / Operations assessed from permission templates + nav filtering.

## Capability matrix (inquiry workflow)

| Capability | Administrators | Event Sales | Front Desk | Operations |
|---|---|---|---|---|
| See Home | Yes | Yes | Yes | Yes |
| Nav: Inquiries | Yes (`crm.inquiries.view`) | Yes | **No** | **No** |
| View inquiry detail | Yes | Yes | No (route gated) | No |
| Manage inquiry / claim / notes | Yes (`crm.inquiries.manage`) | Yes | No | No |
| Create/edit staff quote draft | Yes | Yes | No | No |
| Approve internal quote | Yes (`crm.quotes.approve`) | Yes | No | No |
| Override unit prices | Yes (`crm.quotes.price_override`) | **No** | No | No |
| Place HOLD (`events.create`) | Yes | Yes | No | No |
| Confirm booking (`events.confirm`) | Yes | Yes | No | No |
| Cancel booking | Yes | Yes | No | No |
| Inventory manage (resources) | Yes | No (view only) | No | View inventory only |
| Hours / Team / Security / Catalog | Yes | No | No | No |
| Schedule / Bookings view | Yes | Yes | Calendar + events view | Calendar + events view |
| POS / payments collect | Yes | No | Yes | No |

## Usability implications

### Administrators
- Sees full Settings + Tools. Can confuse primary sales work with admin chrome if overflow/More is overused — 12C already demotes Settings.
- Price override fields editable; Unit cents risk is highest here.

### Event Sales
- Primary sales persona. Can prepare and **approve** quotes; **cannot** change unit cents (read-only with title explaining permission) — good safety, but Unit cents label still confusing even when read-only.
- No Hours/Team — correct.

### Front Desk
- **Cannot discover or work inquiries** under defaults. Home won’t show inquiry attention tiles (`canViewInquiries` false).
- If venue expects Front Desk to triage event requests, **current defaults are a P1 product mismatch** (not a UI bug — permission template decision). Owner input required before changing groups.

### Operations
- Schedule/bookings/waivers/inventory view only. Same inquiry access gap as Front Desk.
- Appropriate if Operations never sells; confusing if they cover phones for event requests.

## Disabled actions & explanations

| Action | Who disabled | Explains why? |
|---|---|---|
| Confirm booking (unclaimed LA) | All until claim | Yes — “Start working” / claim copy |
| Unit price edit | Event Sales | Title attribute only (`crm.quotes.price_override`) — easy to miss |
| Customer email delivery | Everyone while `canDeliver:false` | Yes — banners + Approve internal quote wording |
| Approve (no `crm.quotes.approve`) | Front Desk etc. | Control hidden when policy/permission false |

## Navigation to inaccessible workflows

Employees without `crm.inquiries.view` simply **do not see** Inquiries in sidebar/mobile primary. No dangling “forbidden” deep links from Home attention (tiles omitted). Risk is organizational: role name “Front Desk” implies customer intake they cannot perform.
