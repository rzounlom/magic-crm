# Finite resource schedule

The Resource Schedule is the future **single source of truth** for finite event inventory. Personal Event Planner recommendations, live agents, inquiries, proposals, booking, and staff scheduling must all ask the same availability service. Features must not independently calculate or store occupancy.

This pass adds the data model, Admin resource configuration, the staff Master Schedule, and live-agent holds. It does **not** implement automatic customer holds, a Booking record, payments, or outbound email delivery.

## Status model

AVAILABLE is the absence of an active occupancy row — it is not stored.

Stored occupancy:

| Status | Meaning | Blocks conflicting use |
| --- | --- | --- |
| `HOLD` | Temporary reservation while an event is being worked or checkout is in progress | Yes |
| `BOOKED` | Confirmed reservation | Yes |

Future statuses (maintenance, blocked, internal use) can be added later. Do not overbuild them now.

Released rows (`releasedAt`) and expired HOLDs (`expiresAt` in the past) are ignored by availability **checks**. The PostgreSQL exclusion constraint still rejects overlapping **inserts** until a sweeper sets `releasedAt` on expired holds.

## Tenant-configurable inventory

Finite inventory is data, not application code.

- `ResourceType` — bowling lanes, axe lanes, party rooms, meeting rooms, etc. Tenant-scoped `slug`, 30-minute slotted scheduling by default, buffers, `inventoryConfigured`
- `Resource` — one numbered unit (`Bowling Lane 1`). Optional `capacity`. Do not invent a count
- `KnowledgeResourceRequirement` — how a `SalesKnowledgeItem` (future Catalog product) consumes a resource type (`FIXED`, `PER_GUESTS`, `UNKNOWN`)
- `ResourceReservation` — HOLD/BOOKED occupancy with event-local `slotDate` + `startMinute`/`endMinute`

Admin UI (`/app/admin/resources`) lets an organization administrator create resource types, bulk-create numbered units, deactivate inventory, and link sales-knowledge offerings. Counts are tenant data. Re-running knowledge sync upserts types and requirement **links**; it must not fabricate lane/room counts. Prototype demos (for example 8 bowling lanes / 4 axe lanes) are **not** production data.

`inventoryConfigured` is true only when at least one active `Resource` row exists for that type. Missing numbered inventory is `NOT_VALIDATED`, never a fake `available: false`.

## Availability service

`checkResourceAvailability` in `src/server/services/resource-availability-service.ts` is the shared checker.

`generateRecommendations({ inquiry, knowledge, availabilityProvider, resourceCatalog, storedRequirements })` always goes through `PlanAvailabilityProvider`. Production uses `createResourceScheduleAvailabilityProvider`, which calls the same checker.

`availabilityValidated = true` only when **every** finite requirement:

1. has a known quantity,
2. has configured numbered inventory,
3. has no HOLD/BOOKED conflict in that window.

Otherwise keep `availabilityValidated = false` and do not claim resources are free. Static published limits (age, max guests per lane) still apply in `buildEventPlans`.

Recommendation generation **must not** insert HOLD or BOOKED rows. Customer plan selection re-checks availability, saves the selected plan on the same Inquiry, and sets `READY_FOR_HUMAN` / `CUSTOMER_SELECTED_PLAN`. It does **not** reserve inventory. If the window is no longer free, the plan is kept and marked `AVAILABILITY_CHANGED` (a plan-level status, not an Inquiry status).

## Staff holds

Authorized staff (Events create/edit, typically Event Sales or Administrators) can:

- Place a temporary HOLD from the Master Schedule or from a selected-plan Inquiry (`Place Resource Hold`)
- Release a HOLD (not BOOKED)

Inquiry plan holds assign specific `Resource` rows in one transaction with a 24-hour `expiresAt`. If any required unit cannot be assigned, no partial holds remain. Holds do **not** emit `event_plan.selected` or `booking.confirmed`.

Expired HOLDs are opportunistically marked `releasedAt` so the PostgreSQL exclusion constraint no longer blocks that window. History rows are kept.

## Concurrency

Do not trust a prior UI check. `reserveResourcesInTransaction` inserts HOLD/BOOKED rows in one transaction. PostgreSQL `btree_gist` exclusion `resource_reservations_no_overlap` rejects overlapping active HOLD/BOOKED ranges on the same `resourceId` + `slotDate`. Two agents who both saw “available” cannot both commit overlapping occupancy.

Overnight windows that cross local midnight are a known limitation (`slotDate` is the start date). Split or timestamptz occupancy can be added later.

## Staff UI

`/app/schedule` is the Master Schedule: date previous/today/next/picker, resource-type tabs from configured `ResourceType` rows, numbered resource columns, 30-minute rows, Available / HOLD / BOOKED from live `ResourceReservation` records. Occupied cells link to the associated Inquiry when one exists. Staff can place and release HOLDs there.

Ready-for-Live-Agent inquiries show **Selected Plan — Resource Check** against the same availability service, plus Place/Release Resource Hold when authorized.

## Seed

`pnpm tenant:import-sales-knowledge` syncs resource **types** and knowledge links after import. `pnpm tenant:sync-resource-types -- --slug <slug> --confirm SYNC` does the same without re-importing knowledge. Numbered inventory stays empty until an Admin configures it.
