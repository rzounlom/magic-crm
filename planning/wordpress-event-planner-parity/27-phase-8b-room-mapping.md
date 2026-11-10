# Phase 8B — Exclusive room mapping + PR #10 merge

## Policy

- Attach MagiCRM room requirements only when the WP plan **prices exclusive room/facility use** (`room_included`, `rental_kind`, or priced room line labels).
- Private-room preference alone does **not** create a reservation.
- Extra room hours are **pricing-only** (no second inventory unit).
- Arcade remains soft-only (no Generations arcade resource type).
- No Production inventory/pricing/hold/booking writes in this phase.

## Room → resource

| WP signal | MagiCRM slug | Rule |
| --- | --- | --- |
| Lower Event Room line | `lower-event-room` | FIXED 1 |
| Skybox / Upper line | `skybox` | FIXED 1 |
| Climbers Cove / gathering space | `climbing-area` | FIXED 1 (dedupe w/ climbing attraction) |
| Mezzanine buyout | `mezzanine` | FIXED 1 |
| Full Facility | `full-facility` | LOCATION_EXCLUSIVE |

## Pricing preservation

- WP `rooms.lower_extra` remains **7500¢** ($75) in known discrepancy docs vs MagiCRM $50.
- Draft totals still come from WP integer-cent line items (no catalog substitution).
