# Proposal engine

Public Personal Event Planner proposals are built by `generateEventPlansForInquiry`. When the tenant has active catalog products, `buildCatalogEventPlans` is the engine. Tenants without a catalog still use sales-knowledge `buildEventPlans`.

## Flow

Intake → catalog (or knowledge) engine → structured itinerary → `stampPlanResourceWindows` → `checkResourceAvailability` (per segment) → persist `EventPlanRecommendation` snapshot → customer **Book Now** (fresh availability precheck, then pending unpaid Booking, no occupancy) or **Submit inquiry** (no booking) → staff Check Availability → Confirm Payment & Book (`confirmPendingBooking`).

**Pending bookings do not block inventory. Physical resources become unavailable only when a booking is confirmed after payment.**

**Public proposals are availability-aware before Book Now.** Each Good / Recommended / Premium option is verified independently against the same segment windows confirmation will allocate. If the requested itinerary conflicts, the engine searches nearby starts (`0, ±30, ±60, ±90, ±120`) and bounded activity permutations (food stays first when configured). Scoring is implied by search order: minimum event-start movement, then preserve original activity order, then preserve requested attractions / package tier. The first viable candidate wins. The AI may explain the result but must not invent availability.

**Book Now** performs a fresh precheck against the selected structured snapshot. If that snapshot is no longer viable, regenerate options and return `AVAILABILITY_CHANGED`. Book Now does not lock inventory.

**Submit inquiry** sets `salesStage=READY_TO_BOOK` and `status=READY_FOR_HUMAN`. It does not insert HOLD or BOOKED rows and does not create a Booking. Do not tell the customer inventory is held.

## Catalog proposals

`RecommendationProfile` supplies Good / Recommended / Premium defaults (`budget` / `best_fit` / `premium` internally). Public labels are Good, Recommended, Premium. Which products, add-ons, food, and sequencing belong in those tiers is **tenant data**.

- Explicit attraction IDs always override profile defaults, but only if those IDs exist in the current tenant catalog. Foreign IDs fail closed.
- Fulfillment groups (for example two package variants in one group) are tenant-configured.
- Adult/kids mixes come from `defaultPackageSlugs` / `defaultAttractionSlugs` on the tenant profile.
- Food sequencing uses `foodFirst` on the tenant profile. Dining intake keys map through `diningPreferenceMap`.
- Pricing is integer cents via `priceProduct`. Guests-per-unit and serving sizes come from catalog rows. The LLM must not calculate prices.
- Exhausted configured inventory is `UNAVAILABLE` unless a nearby viable itinerary is found; then the snapshot is rewritten to that itinerary (`itineraryAdjusted`, customer-facing `adjustmentNote`). Book Now is hidden on options that remain unavailable.
- Snapshots store line items, structured itinerary (segment id, product id, start offset, duration, customer label), resource requirements with segment windows, availability, a tenant-configured deposit (`Organization.depositPercent`, schema default 30), and `organizationId` / `locationId`. A booking-catalog dataset may set `depositPercent` for that organization on import. Changing catalog prices later must not rewrite a persisted snapshot. Final allocation still uses current active resources.
- Customer-facing clocks are stored as raw event-local `HH:mm` and formatted once (`16:00` → `4:00 PM`). Do not append a meridiem after formatting.
- When an option is longer than the requested/base itinerary, the explanation names scheduled activities that are not already on the base option. Rooms, cards, and credits are not extra scheduled hours.
- Public **Start over** is specified in [`inquiries.md`](./inquiries.md) and is not implemented yet.

## Availability

`ProductResourceRequirement` quantities feed the same `checkResourceAvailability` used by live agents and Confirm Booking. Required units use `ceil(guestCount / guestsPerUnit)` when the tenant configures `PER_GUESTS`. Capacities such as 6 guests per bowling lane are **tenant resource/product data**, not MagicCRM constants. Composite packages (exact count, all-of-type, specific unit, location-exclusive) are also tenant data. Recommendation generation and customer selection never insert reservations. Location-exclusive proposals add generic customer-facing copy such as “Private use of the full facility” and must not expose internal resource ids.

**Invariant:** Composite packages are configuration. Runtime code must not branch on tenant, product, or resource names to determine resource allocation.

Availability always runs with trusted `organizationId` and `locationId`. Location A1 resources cannot satisfy Location A2. Tenant A reservations cannot block Tenant B.

## AI ports

`recommend_proposals` and `lookup_availability` return server-built DTOs. Organization and location come from the conversation/inquiry context, never from the model, browser, or tool arguments. Tools must not include a “calculate price” action.

## Event span and scheduling behavior

Event length is the scheduled itinerary span, not the intake duration and not the longest product duration.

- `eventStart` is the earliest dining or activity start. `eventEnd` is the latest dining or activity end. `eventLengthMinutes = eventEnd - eventStart`.
- A space entitlement may be longer than that span. The stored event length is then the longer of the activity span and the room entitlement. The room overlaps the event; it is not a sequential block.
- Nearby search evaluates **candidate event start times**. For each start it builds the full itinerary, stamps every resource window, and accepts the candidate only when every required resource fits. Offsets stay `0, ±30, ±60, ±90, ±120`. Dining stays first when `foodFirst` is set. Only scheduled activities are permuted. Space windows and non-scheduled items are not shifted into gaps.
- If the scheduled span is longer than the customer requested, the proposal says so (for example, an additional hour of a named activity, or a longer private-room reservation).
- Customer-facing times use 12-hour format, including conflict notes and “Why We Recommend This”.

Sample Itinerary contains dining and scheduled activities only. Included items (cards, credits, add-ons) and overlapping space reservations render in their own sections.

## Out of scope (Phase 3C)

Transactional email, Stripe deposit checkout, payment webhooks, payment recovery when two pending bookings race and only one can confirm. Customer Book Now pending bookings, Master Schedule pending panel, and Confirm Payment & Book exist.
