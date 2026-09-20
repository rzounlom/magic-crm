# Finite resource schedule

The Resource Schedule is the future **single source of truth** for finite event inventory. Personal Event Planner recommendations, live agents, inquiries, proposals, booking, and staff scheduling must all ask the same availability service. Features must not independently calculate or store occupancy.

This pass adds the data model, Admin resource configuration, the staff Master Schedule, live-agent holds, customer 24-hour proposal holds, hold expiry, and Confirm Booking conversion of HOLD→BOOKED. It does **not** implement payments or outbound email delivery.

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
- `Resource` — one numbered unit (`Bowling Lane 1`). Optional `capacity`. Do not invent a count. Resources are location-specific.
- `KnowledgeResourceRequirement` — how a `SalesKnowledgeItem` consumes a resource type (`FIXED`, `PER_GUESTS`, `UNKNOWN`)
- `ProductResourceRequirement` — how a catalog `Product` consumes a resource type (`FIXED`, `PER_GUESTS`, `ALL_OF_TYPE`, `SPECIFIC_RESOURCE`, `LOCATION_EXCLUSIVE`). Optional `resourceId` pins `SPECIFIC_RESOURCE` to one unit. `guestsPerUnit` is tenant configuration. Composite packages are multiple requirement rows on one product.
- `ResourceReservation` — HOLD/BOOKED occupancy with event-local `slotDate` + `startMinute`/`endMinute`, optional `locationId`, and UTC `startsAt`/`endsAt`

Admin UI (`/app/admin/resources`) lets an organization administrator create resource types, bulk-create numbered units, deactivate inventory, and link sales-knowledge offerings. Counts are tenant data. Re-running knowledge sync upserts types and requirement **links**; it must not fabricate lane/room counts. Prototype demos are **not** production data and are not MagicCRM defaults.

`inventoryConfigured` is true only when at least one active `Resource` row exists for that type. Missing numbered inventory is `NOT_VALIDATED`, never a fake `available: false`.

## Availability service

`checkResourceAvailability` in `src/server/services/resource-availability-service.ts` is the shared checker. Queries constrain `organizationId` and, when known, `locationId` in the database (`WHERE organizationId = ? AND resourceTypeId = ?` plus location scope). Do not fetch globally by resource id and compare tenant in JavaScript.

`generateRecommendations` (knowledge path) and `buildCatalogEventPlans` (catalog path) always go through `PlanAvailabilityProvider`. Production uses `createResourceScheduleAvailabilityProvider`, which calls the same checker. Nearby start-time search is `findNearbyAvailableStarts` and is shared by public proposal generation and the live-agent workspace.

`availabilityValidated = true` only when **every** finite requirement:

1. has a known quantity,
2. has configured numbered inventory,
3. has no HOLD/BOOKED conflict in that window.

A composite product is available only when **all** of its requirement rows are satisfiable for the same window. Never partially satisfy a package (for example 6 of 7 required axe units). `ALL_OF_TYPE` means all **active** units of that type at this location; an intentionally inactive/maintenance unit is omitted from the count. `SPECIFIC_RESOURCE` fails closed if the unit is missing, inactive, or belongs to another location. `LOCATION_EXCLUSIVE` is unavailable if **any** active blocking reservation exists at that location for the window; while it is active, every product that needs physical resources at that location is unavailable. Location 1 exclusive does not block Location 2. Tenant A exclusive does not block Tenant B.

**Invariant:** Composite packages are configuration. Runtime code must not branch on tenant, product, or resource names to determine resource allocation.

Otherwise keep `availabilityValidated = false` and do not claim resources are free. Configured inventory that is fully occupied is `UNAVAILABLE`, with deterministic nearby start times when the checker can validate an alternate window. Static published limits (age, max guests per lane) still apply in `buildEventPlans`.

Recommendation generation **must not** insert HOLD or BOOKED rows. Customer **Reserve this option** re-checks availability, assigns exact numbered resources, and inserts HOLD rows in one transaction (`placeProposalHold`). Customer **Have an agent contact me** saves the selected plan as `READY_TO_BOOK` and does **not** reserve inventory. If the reserved window is no longer free, no hold is written; the customer sees `AVAILABILITY_CHANGED` plus deterministic nearby start times from `findNearbyAvailableStarts`.

## Staff holds

Authorized staff (Events create/edit, typically Event Sales or Administrators) can:

- Place a temporary HOLD from the Master Schedule or from a selected-plan Inquiry (`Place Resource Hold`)
- Release a HOLD (not BOOKED)

Inquiry plan holds assign specific `Resource` rows in one transaction with a 24-hour `expiresAt`. Public `placeProposalHold` and staff Place Hold share that service. If any required unit cannot be assigned, no partial holds remain. Holds do **not** emit booking-confirmed communications. Confirm Booking converts those HOLD rows in place to BOOKED and sets `bookingId`.

Expired HOLDs are opportunistically marked `releasedAt` so the PostgreSQL exclusion constraint no longer blocks that window. History rows are kept. Availability treats `expiresAt <= now` as non-blocking even if the sweeper is delayed. QStash is not used. Staff **Expire hold now** runs the same `expireInquiryHoldsNow` path tests use (no waiting 24 hours, no manual SQL).

## Concurrency

Do not trust a prior UI check. Inserts of HOLD/BOOKED rows happen in one transaction. PostgreSQL `btree_gist` exclusion `resource_reservations_no_overlap` rejects overlapping active HOLD/BOOKED ranges on the same `resourceId` + `slotDate`. Same-inquiry double-clicks lock the Inquiry row (`SELECT … FOR UPDATE`) and reuse the existing hold. Two agents or customers who both saw “available” cannot both commit overlapping occupancy. Location-exclusive allocation also `SELECT … FOR UPDATE` the Location row so Full Facility vs an ordinary lane cannot both commit because they raced the availability precheck. Exclusive bookings persist exact reservations on every active bookable resource at that location (Master Schedule occupancy is real, not painted on) plus marker occupancy on the `LOCATION_EXCLUSIVE` resource type so a unit added after the exclusive booking still conflicts. See [`ADR-006`](../decisions/ADR-006-resource-occupancy-concurrency.md).

Overnight windows that cross local midnight are a known limitation (`slotDate` is the start date). Split or timestamptz occupancy can be added later.

## Staff UI

`/app/schedule` is the Master Schedule: tenant-local date previous/today/next/picker, resource-type tabs from configured `ResourceType` rows at the current location, numbered resource columns, 30-minute rows, Available / HOLD / BOOKED from live `ResourceReservation` records. A requested date is that civil day in the tenant timezone (`eventLocalSlotDate`), not the UTC calendar day. HOLD cells show **Held until** in tenant-local time (not raw UTC) and link to the Inquiry. BOOKED cells open `/app/bookings/{id}`. Available cells are display-only in this phase (no click-to-create). Expired holds are excluded from the active view. Day navigation shows a pending state and disables conflicting controls until the destination date loads.

Ready-for-Live-Agent inquiries open the Live Agent Booking Workspace. Resource checks, Place / Update / Extend / Release Hold, and Master Schedule deep links all use this same availability service. Confirm Booking rechecks availability, verifies unexpired HOLDs, then converts them to BOOKED in the same transaction as the Booking insert. The PostgreSQL overlap exclusion still applies to BOOKED vs HOLD/BOOKED.

## Seed

`npm run tenant:import-booking-catalog -- --slug <slug> --confirm IMPORT` also seeds numbered inventory from the compiled catalog dataset for the slug you pass. That dataset is tenant bootstrap data, not a platform default. `npm run tenant:sync-resource-types -- --slug <slug> --confirm SYNC` upserts types and knowledge links without re-importing knowledge. Catalog import is the only path that fabricates numbered lane/bay/room counts, and only from the file you import into the named tenant.
