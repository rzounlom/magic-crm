# Proposal engine

Public Personal Event Planner proposals are built by `generateEventPlansForInquiry`. When the tenant has active catalog products, `buildCatalogEventPlans` is the engine. Tenants without a catalog still use sales-knowledge `buildEventPlans`.

## Flow

Intake → catalog (or knowledge) engine → `checkResourceAvailability` → persist `EventPlanRecommendation` snapshot → customer chooses a plan → staff HOLD then Confirm Booking.

Choosing a plan is intent only. It sets `salesStage=READY_TO_BOOK` and `status=READY_FOR_HUMAN`. It does not insert HOLD or BOOKED rows.

## Catalog proposals

`RecommendationProfile` supplies Good / Recommended / Premium defaults (`budget` / `best_fit` / `premium` internally). Public labels are Good, Recommended, Premium. Which products, add-ons, food, and sequencing belong in those tiers is **tenant data**.

- Explicit attraction IDs always override profile defaults, but only if those IDs exist in the current tenant catalog. Foreign IDs fail closed.
- Fulfillment groups (for example two package variants in one group) are tenant-configured.
- Adult/kids mixes come from `defaultPackageSlugs` / `defaultAttractionSlugs` on the tenant profile.
- Food sequencing uses `foodFirst` on the tenant profile. Dining intake keys map through `diningPreferenceMap`.
- Pricing is integer cents via `priceProduct`. Guests-per-unit and serving sizes come from catalog rows. The LLM must not calculate prices.
- Exhausted configured inventory is `UNAVAILABLE`. Nearby start times come from `findNearbyAvailableStarts`, shared with the live-agent workspace.
- Snapshots store line items, itinerary, resource requirements, availability, a 30% display-only deposit preview, and `organizationId` / `locationId`. Changing catalog prices later must not rewrite a persisted snapshot.

## Availability

`ProductResourceRequirement` quantities feed the same `checkResourceAvailability` used by live agents and Confirm Booking. Required units use `ceil(guestCount / guestsPerUnit)` when the tenant configures `PER_GUESTS`. Capacities such as 6 guests per bowling lane are **tenant resource/product data**, not MagicCRM constants. Exclusive rentals use `ALL_OF_TYPE`. Recommendation generation and customer selection never insert reservations.

Availability always runs with trusted `organizationId` and `locationId`. Location A1 resources cannot satisfy Location A2. Tenant A reservations cannot block Tenant B.

## AI ports

`recommend_proposals` and `lookup_availability` return server-built DTOs. Organization and location come from the conversation/inquiry context, never from the model, browser, or tool arguments. Tools must not include a “calculate price” action.

## Out of scope (Phase 3B)

Customer 24-hour holds, hold expiry jobs, email, collecting 30%, Stripe. Staff holds and Confirm Booking already exist.
