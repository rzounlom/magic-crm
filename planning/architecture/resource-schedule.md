# Finite resource schedule

The Resource Schedule is the future **single source of truth** for finite event inventory. Personal Event Planner recommendations, live agents, inquiries, proposals, booking, and staff scheduling must all ask the same availability service. Features must not independently calculate or store occupancy.

This pass adds the data model, Admin resource configuration, the staff Master Schedule, **legacy** staff/customer HOLDs, hold expiry, and Confirm Booking allocation of BOOKED rows. Customer **Book Now** no longer creates HOLDs. It does **not** implement payments or outbound email delivery.

**Pending bookings do not block inventory. Physical resources become unavailable only when a booking is confirmed after payment.**

## Status model

AVAILABLE is the absence of an active occupancy row — it is not stored.

Stored occupancy:

| Status | Meaning | Blocks conflicting use |
| --- | --- | --- |
| `HOLD` | Legacy temporary reservation. New Book Now / employee flows must not create these. Remaining rows still block until released/expired | Yes |
| `BOOKED` | Confirmed reservation | Yes |

Future statuses (maintenance, blocked, internal use) can be added later. Do not overbuild them now.

Released rows (`releasedAt`) and expired HOLDs (`expiresAt` in the past) are ignored by availability **checks** and by the Master Schedule. Cancelled bookings set `releasedAt` on their occupancy instead of deleting rows. The PostgreSQL exclusion constraint still rejects overlapping **inserts** until a sweeper sets `releasedAt` on expired holds.

## Tenant-configurable inventory

Finite inventory is data, not application code.

- `ResourceType` — bowling lanes, axe lanes, party rooms, meeting rooms, etc. Tenant-scoped `slug`, 30-minute slotted scheduling by default, buffers, `inventoryConfigured`
- `Resource` — one numbered unit (`Bowling Lane 1`). Optional `capacity`. Do not invent a count. Resources are location-specific.
- `KnowledgeResourceRequirement` — how a `SalesKnowledgeItem` consumes a resource type (`FIXED`, `PER_GUESTS`, `UNKNOWN`)
- `ProductResourceRequirement` — how a catalog `Product` consumes a resource type (`FIXED`, `PER_GUESTS`, `ALL_OF_TYPE`, `SPECIFIC_RESOURCE`, `LOCATION_EXCLUSIVE`). Optional `resourceId` pins `SPECIFIC_RESOURCE` to one unit. `guestsPerUnit` is tenant configuration. Composite packages are multiple requirement rows on one product.
- `ResourceReservation` — HOLD/BOOKED occupancy with event-local `slotDate` + `startMinute`/`endMinute`, optional `locationId`, and UTC `startsAt`/`endsAt`

Admin UI (`/app/admin/resources`) lets an organization administrator create resource types, bulk-create numbered units, deactivate inventory, and link sales-knowledge offerings. Counts are tenant data. Re-running knowledge sync upserts types and requirement **links**; it must not fabricate lane/room counts. Prototype demos are **not** production data and are not MagicCRM defaults.

`inventoryConfigured` is true only when at least one active `Resource` row exists for that type. Missing numbered inventory is `NOT_VALIDATED`, never a fake `available: false`.

## Availability service

`checkResourceAvailability` in `src/server/services/resource-availability-service.ts` is the shared checker. Queries constrain `organizationId` and, when known, `locationId` in the database (`WHERE organizationId = ? AND resourceTypeId = ?` plus location scope). Do not fetch globally by resource id and compare tenant in JavaScript.

**Invariant: Resource reservations use itinerary segment windows, not the full event window.** `stampPlanResourceWindows` / `applyItineraryWindows` copy structured itinerary `startOffsetMinutes` + `durationMinutes` onto each `PlanResourceRequirement.windowStartTime/windowEndTime`. Rotation waves still override after that. Legacy snapshots without segment windows fall back to the event window so old bookings keep rendering.

A bowling requirement is checked only on the bowling segment. A room entitlement is checked on the overlapping space window (the event span, or the rental duration when that is longer). Non-scheduled items do not create resource windows unless they have a real inventory requirement. Candidate search builds that full itinerary for each event start before accepting it.

`generateRecommendations` (knowledge path) and `buildCatalogEventPlans` (catalog path) always go through `PlanAvailabilityProvider`. Production uses `createResourceScheduleAvailabilityProvider`, which calls the same checker with those segment windows. Nearby itinerary search is `searchViableStructuredItinerary` (closest start first, then bounded activity permutations with food-first preserved). `findNearbyAvailableStarts` remains the shared start-offset helper (`0, ±30, ±60, ±90, ±120`).

Public proposals are availability-aware before Book Now. Each Good / Recommended / Premium option is checked independently. Book Now performs a fresh precheck but does not lock inventory. Final confirmation remains the authoritative atomic availability check.

Public and employee booking use the same scheduling/allocation engine.

`availabilityValidated = true` only when **every** finite requirement:

1. has a known quantity,
2. has configured numbered inventory,
3. has no HOLD/BOOKED conflict in that window.

A composite product is available only when **all** of its requirement rows are satisfiable for **their segment windows**. Never partially satisfy a package (for example 6 of 7 required axe units). `ALL_OF_TYPE` means all **active** units of that type at this location; an intentionally inactive/maintenance unit is omitted from the count. `SPECIFIC_RESOURCE` fails closed if the unit is missing, inactive, or belongs to another location. `LOCATION_EXCLUSIVE` is unavailable if **any** active blocking reservation exists at that location for **that exclusive segment**; while it is active, every product that needs physical resources at that location is unavailable during the same window. Location 1 exclusive does not block Location 2. Tenant A exclusive does not block Tenant B.

Setup/cleanup buffers are an extension point on segment duration; they are not applied in this phase.

**Invariant:** Composite packages are configuration. Runtime code must not branch on tenant, product, or resource names to determine resource allocation.

Otherwise keep `availabilityValidated = false` and do not claim resources are free. Configured inventory that is fully occupied is `UNAVAILABLE`, with deterministic nearby start times when the checker can validate an alternate window. Static published limits (age, max guests per lane) still apply in `buildEventPlans`.

Recommendation generation **must not** insert HOLD or BOOKED rows. Customer **Book Now** creates a pending unpaid Booking and does **not** insert occupancy. Customer **Submit inquiry** saves the selected plan as `READY_TO_BOOK` and does **not** create a Booking or reserve inventory. Pending bookings may share a slot; conflict is resolved only at confirmation.

## Staff holds (legacy)

New Book Now and employee confirmation flows must not create HOLDs. Authorized staff can still **release, extend, or expire leftover HOLD rows** until they convert or expire. `placeProposalHold` remains for historical compatibility and tests; it is not part of the customer or live-agent happy path.

Expired HOLDs are opportunistically marked `releasedAt` so the PostgreSQL exclusion constraint no longer blocks that window. History rows are kept. Availability treats `expiresAt <= now` as non-blocking even if the sweeper is delayed. QStash is not used. Staff **Expire hold now** runs the same `expireInquiryHoldsNow` path tests use (no waiting 24 hours, no manual SQL). Legacy hold-expiry code is retained only for historical rows.

## Concurrency

Do not trust a prior UI check. Inserts of HOLD/BOOKED rows happen in one transaction. PostgreSQL `btree_gist` exclusion `resource_reservations_no_overlap` rejects overlapping active HOLD/BOOKED ranges on the same `resourceId` + `slotDate`. Same-inquiry double-clicks lock the Inquiry row (`SELECT … FOR UPDATE`) and reuse the existing hold. Two agents or customers who both saw “available” cannot both commit overlapping occupancy. Location-exclusive allocation also `SELECT … FOR UPDATE` the Location row so Full Facility vs an ordinary lane cannot both commit because they raced the availability precheck. Exclusive bookings persist exact reservations on every active bookable resource at that location (Master Schedule occupancy is real, not painted on) plus marker occupancy on the `LOCATION_EXCLUSIVE` resource type so a unit added after the exclusive booking still conflicts. See [`ADR-006`](../decisions/ADR-006-resource-occupancy-concurrency.md).

Overnight windows that cross local midnight are a known limitation (`slotDate` is the start date). Split or timestamptz occupancy can be added later.

## Staff UI

`/app/schedule` is the Master Schedule: tenant-local date previous/today/next/picker, resource-type tabs from configured `ResourceType` rows at the current location, numbered resource columns, 30-minute rows. The grid shows BOOKED occupancy and leftover **Legacy Hold** cells. Cancelled / released reservations are not active occupancy. A **Pending bookings** panel lists unpaid intents for that day; those rows must not paint occupied cells. BOOKED cells open `/app/bookings/{id}`. Available cells are display-only in this phase (no click-to-create).

The employee booking workspace is Review → Check Availability → Save Pending Booking → Confirm Payment & Book, or Generate plan → Check Availability → Confirm Payment & Book when payment is already attested. Employees can create bookings from `/app/bookings` → **New Booking** without a public inquiry. Check Availability does not allocate and is pending-only. After confirmation, Rooms and lanes shows **allocated** BOOKED reservations (names, 12-hour segment windows, allocated of total active units), not a live availability banner. After cancellation, show released history. Confirm always rechecks inside the authoritative transaction and calls `confirmPendingBooking` (composite + location-exclusive included, **per itinerary segment**). Ready to Finalize is not required. Legacy HOLD convert-in-place remains if old HOLD rows still exist; BOOKED rows are never labeled Legacy hold. Master Schedule click-slot create is deferred.

The Master Schedule uses 30-minute rows. A 60-minute reservation occupies two cells (start cell plus continuation). The end-aligned cell stays available. That is grid resolution, not a shortened occupancy window. Continuation cells may say **Continues** so they are not read as a second full booking.

**Bookings confirmed before segment-level scheduling may retain their historical reservation windows. Cancel/recreate test bookings to validate the new allocator.** Do not rewrite those historical rows.

## Seed

`npm run tenant:import-booking-catalog -- --slug <slug> --confirm IMPORT` also seeds numbered inventory from the compiled catalog dataset for the slug you pass. That dataset is tenant bootstrap data, not a platform default. `npm run tenant:sync-resource-types -- --slug <slug> --confirm SYNC` upserts types and knowledge links without re-importing knowledge. Catalog import is the only path that fabricates numbered lane/bay/room counts, and only from the file you import into the named tenant.
