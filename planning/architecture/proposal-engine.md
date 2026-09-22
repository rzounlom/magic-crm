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
- Snapshots store line items, structured itinerary (segment id, product id, start offset, duration, customer label), resource requirements with segment windows, availability, a tenant-configured deposit preview (`Organization.depositPercent`, default 30), and `organizationId` / `locationId`. Changing catalog prices later must not rewrite a persisted snapshot. Final allocation still uses current active resources.

## Availability

`ProductResourceRequirement` quantities feed the same `checkResourceAvailability` used by live agents and Confirm Booking. Required units use `ceil(guestCount / guestsPerUnit)` when the tenant configures `PER_GUESTS`. Capacities such as 6 guests per bowling lane are **tenant resource/product data**, not MagicCRM constants. Composite packages (exact count, all-of-type, specific unit, location-exclusive) are also tenant data. Recommendation generation and customer selection never insert reservations. Location-exclusive proposals add generic customer-facing copy such as “Private use of the full facility” and must not expose internal resource ids.

**Invariant:** Composite packages are configuration. Runtime code must not branch on tenant, product, or resource names to determine resource allocation.

Availability always runs with trusted `organizationId` and `locationId`. Location A1 resources cannot satisfy Location A2. Tenant A reservations cannot block Tenant B.

## AI ports

`recommend_proposals` and `lookup_availability` return server-built DTOs. Organization and location come from the conversation/inquiry context, never from the model, browser, or tool arguments. Tools must not include a “calculate price” action.

## Out of scope (Phase 3C)

Transactional email, Stripe deposit checkout, payment webhooks, payment recovery when two pending bookings race and only one can confirm. Customer Book Now pending bookings, Master Schedule pending panel, and Confirm Payment & Book exist.
