# Phase 8A — Generations inventory readiness

**Branch:** `phase-8a-generations-inventory-readiness`  
**Org:** `mdutc2nkvpafezukeem8942v` (Generations CRM Test)  
**Audit host:** `ep-bold-art-avjy5nt4-pooler…` (authorized read-only MagiCRM customer DB; no writes)  
**Script:** `scripts/audit-generations-inventory-readonly.ts`

## 1. Actual Generations inventory

| Resource type | ID (slug) | Units | Capacity/unit | Mode | Slot | Buffers | Inventory configured |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bowling Lane | `bowling-lane` | 8 | 6 | SLOTTED | 30 | 0/0 | yes |
| Axe Throwing Lane | `axe-throwing-lane` | 8 | 8 | SLOTTED | 30 | 0/0 | yes |
| Laser Tag Arena | `laser-tag-arena` | 1 | 20 | SLOTTED | 30 | 0/0 | yes |
| Mini Golf Course | `mini-golf-course` | 1 | 150 | CONTINUOUS | 30 | 0/0 | yes |
| Climbing Area | `climbing-area` | 1 | 200 | CONTINUOUS | 30 | 0/0 | yes |
| Lower Event Room | `lower-event-room` | 1 | 35 | SLOTTED | 30 | 0/0 | yes |
| Skybox | `skybox` | 1 | 44 | SLOTTED | 30 | 0/0 | yes |
| Mezzanine | `mezzanine` | 1 | 150 | SLOTTED | 30 | 0/0 | yes |
| Full Facility | `full-facility` | 1 | 999 | SLOTTED | 30 | 0/0 | yes |

- Location: Main Location (`America/Indiana/Indianapolis`)
- **No arcade resource type** in tenant inventory
- `defaultDurationMinutes` is null on all types (duration comes from product / plan window)
- Product→resource links exist (51 sampled) including PER_GUESTS bowling/axe and room composites

## 2. Mapping coverage (after code fix)

| Attraction | Class | Matched slug | Hold required | Status |
| --- | --- | --- | --- | --- |
| bowling | reservable | `bowling-lane` | yes | fully mapped |
| axe | reservable | `axe-throwing-lane` | yes | fully mapped |
| laser | reservable | `laser-tag-arena` | yes | fully mapped |
| golf | reservable | `mini-golf-course` | yes | fully mapped |
| climbing | capacity | `climbing-area` | yes | fully mapped |
| arcade | capacity | — | no | **missing tenant resource type** (soft; not a booking blocker) |

Rooms / facility (pricing components → candidate slugs): lower-event-room, skybox, mezzanine, full-facility — types present; WP draft builder still attaches **attractions** only (rooms remain catalog/product-driven).

Pricing-only: bowling shoes. Food: catering lines (not holds).

## 3. Missing resources / capacities

- **Arcade:** MagiCRM has no Generations arcade resource type — soft capacity only; do not invent units.
- **Room attachment on WP drafts:** room types exist but WP staff draft soft-requirements currently cover attractions, not private-room keys. Product catalog already encodes room requirements for MagiCRM packages.
- **Axe guests/bay:** MagiCRM catalog uses **8**; mapping aligned to 8 (was incorrectly 4).

## 4. Availability-check results

- Soft draft requirements + `checkResourceAvailability` → **validated available** without creating HOLD/BOOKED rows.
- Full-lane overlap simulation → conflict reported; **no HOLDs written**.
- Distinction preserved: availability check ≠ reservation/hold.

## 5. Booking integration findings

- WP staff drafts now attach `resourceRequirements` for mapped Generations slugs.
- Existing Phase 7C guards still enforce approved cents → booking lines / deposit math.
- Booking confirmation still blocks when required reservable attractions lack mapped requirements.
- Inquiry submit still creates no holds/bookings.
- Customer quote delivery remains gated (`approved_plugin_baseline`).

## 6. Code changes

- Expand WP inventory slug candidates to Generations catalog slugs
- Axe `guestsPerUnit` 8; bowling quantity uses `wpBowlingLanes`
- Room/facility candidate slug documentation on pricing component classes
- `summarizeWpInventoryCoverage` helper
- Read-only audit script + readiness tests

**Not done:** no Production inventory writes; no arcade invent; no delivery enablement.

## 7. Tests

- Unit: inventory mapping + amount preservation
- Integration: `tests/integration/wp-inventory-readiness.test.ts`
- Typecheck / lint / build (see PR)

## 8. Phase 8B follow-up (room mapping)

Completed on the same PR branch:

- Snapshot now records `room_included` / `rental_kind(s)` / `rental_minutes`
- Exclusive rooms resolved from structured plan + priced room lines (not preference alone)
- Soft requirements for `lower-event-room`, `skybox`, `mezzanine`, `full-facility` (+ cove→climbing-area with dedupe)
- Additional room hours remain pricing-only ($75 WP lower extra documented)
- Arcade remains soft-only

## 9. Next steps to operational readiness

1. Arcade stays soft-only unless ops adds a resource type.
2. Reconcile WP cents vs booking catalog for go-live.
3. Connect real email provider + promote to `tenant_live` only after explicit verification.
