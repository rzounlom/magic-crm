# Proposal engine

Public Personal Event Planner proposals are built by `generateEventPlansForInquiry`. When the tenant has active catalog products, `buildCatalogEventPlans` is the engine. Tenants without a catalog still use sales-knowledge `buildEventPlans`.

## Flow

Intake → catalog (or knowledge) engine → structured itinerary → `stampPlanResourceWindows` → `checkResourceAvailability` (per segment) → persist `EventPlanRecommendation` snapshot → customer **Book Now** (fresh availability precheck, then pending unpaid Booking, no occupancy) or **Submit inquiry** (no booking) → staff Check Availability → Confirm Payment & Book (`confirmPendingBooking`).

**Pending bookings do not block inventory. Physical resources become unavailable only when a booking is confirmed after payment.**

**Public proposals are availability-aware before Book Now.** Each Good / Recommended / Premium option is verified independently against the same segment windows confirmation will allocate. If the requested itinerary conflicts, the engine searches nearby starts (`0, ±30, ±60, ±90, ±120`) and bounded activity permutations (food stays first when configured). Scoring is implied by search order: minimum event-start movement, then preserve original activity order, then preserve requested attractions / package tier. The first viable candidate wins. The AI may explain the result but must not invent availability.

**Book Now** performs a fresh precheck against the selected structured snapshot. If that snapshot is no longer viable, regenerate options and return `AVAILABILITY_CHANGED`. Book Now does not lock inventory.

**Submit inquiry** sets `salesStage=READY_TO_BOOK` and `status=READY_FOR_HUMAN`. It does not insert HOLD or BOOKED rows and does not create a Booking. Do not tell the customer inventory is held.

## Catalog proposals

`RecommendationProfile` supplies Good / Recommended / Premium defaults (`budget` / `best_fit` / `premium` internally). Public labels are Good, Recommended, Premium. Which products, food, rooms, and sequencing belong in those tiers is **tenant data**.

When `composition` is present on the profile, each tier is composed on its own from customer intent, that tier's strategy, the catalog, guest/date constraints, and total-event budget guidance. Recommended is not Good plus an add-on. Profiles without `composition` keep the older package, default-attraction, and add-on lists so existing tenants keep working.

- Explicit `AttractionInterest` selections are primary. The engine picks one fulfillment product per interest for that tier (`fulfillmentByInterest`, then the first mapped product that fits guest count and date). It does not replace a selected interest with the profile's default attractions. A missing or unfit product is recorded on `unfulfilledInterestSlugs`. It is not silently swapped for a different activity.
- A `fulfillmentGroup` collapses duration or package variants of one experience (two axe session lengths, two packages in one group). It does not drop a second customer-selected interest. On the legacy path, group matching uses only products that already belong to that group.
- Tier upgrades still skip a product whose `fulfillmentGroup` is already on that tier, so one experience is not sold twice inside the same option.
- With no explicit interests, the tier uses its configured `coreAttractionSlugs`, then `upgradeSlugs`.
- Food comes from the tier's `foodStrategy` (`value`, `standard`, `premium`) and the tenant's `foodStrategies` slug lists. `diningPreference: none` omits food. A mapped dining key or a product slug still selects that catalog product. Good may switch to a later value-tier food when the proposal total is above `budgetMax`. That swap does not change quantities, prices, or explicit activities. Recommended and Premium are not stripped to land inside the range.
- `foodFirst` is still the tenant itinerary order. Another tenant can put activities first.
- Private space uses each product's `maxGuests`. `spaceSlugOrder` is the tenant's preference list: the first room that fits the guest count and date is chosen. Without that list, `spaceSlugs` plus `spaceFit` still apply (`tightest` is the smallest that fits; `largest` is the biggest that fits). A `private` or `semi_private` request adds that room, or sets `spaceUnmet` and says so when none fits. No preference does not add a room unless that tier sets `includeSpace`. A location-exclusive bundle is not treated as an ordinary party room unless the tenant lists it in that order.
- `budgetMin` / `budgetMax` are total-event guidance, not a checkout cap and not a per-person budget. Catalog cents stay authoritative. Each snapshot stores `budgetFit` (`WITHIN_RANGE`, `BELOW_RANGE`, `ABOVE_RANGE`, `FLEXIBLE`, `UNSPECIFIED`) plus `budgetExplanationCode` (`WITHIN_BUDGET`, `ABOVE_BUDGET`, `BELOW_BUDGET`, `NO_BUDGET`, `UNSPECIFIED`) and signed `budgetDifferenceCents`. Flexible is `NO_BUDGET`. "Under $1,500" treats a total at or under the ceiling as within, because its floor is $0. "$7,500+" has no ceiling, so a higher total is not above budget; a total under the floor is below budget and is not auto-upgraded. Good may switch to a later value-tier food, and may omit `budgetOptionalUpgradeSlugs`, when the priced total is above `budgetMax`. That does not change quantities, prices, or explicit activities. Recommended and Premium stay on their configured composition even when they sit above the range.
- `compositionDelta` compares the previous tier's products: food change, fulfillment change, added products, and space change. Customer copy is one sentence from those facts. The first tier says what is included. Later tiers name only real upgrades, additions, and room changes. Budget copy is separate and is not appended to that sentence. It does not infer an extra hour of one activity from a duration gap.
- Beverages are catalog products. The public planner does not ask about them. A profile may list a real beverage or other add-on in `upgradeSlugs`. The engine does not create a product that is absent from the catalog. `diningPreference: none` omits food. A null or unknown dining value, including older `not_sure` rows, still uses the tier food strategy.
- Pricing is integer cents via `priceProduct`. Guests-per-unit and serving sizes come from catalog rows. Combo quantity uses `servesMin`. The LLM must not calculate prices, quantities, durations, capacity, availability, itinerary times, or budget fit.
- Exhausted configured inventory is `UNAVAILABLE` unless a nearby viable itinerary is found; then the snapshot is rewritten to that itinerary (`itineraryAdjusted`, customer-facing `adjustmentNote`). Book Now is hidden on options that remain unavailable.
- Snapshots store line items, structured itinerary (segment id, product id, start offset, duration, customer label), resource requirements with segment windows, availability, a tenant-configured deposit (`Organization.depositPercent`, schema default 30), and `organizationId` / `locationId`. A booking-catalog dataset may set `depositPercent` for that organization on import. Changing catalog prices later must not rewrite a persisted snapshot. Final allocation still uses current active resources.
- Customer-facing clocks are stored as raw event-local `HH:mm` and formatted once (`16:00` → `4:00 PM`). Do not append a meridiem after formatting.
- When an option is longer than the requested/base itinerary and the profile has no `composition` block, the explanation names scheduled activities that are not already on the base option. Rooms, cards, and credits are not extra scheduled hours. Composed tiers use `compositionDelta` instead.
- Public **Start over** clears the in-progress planner and returns to step 1. It does not delete an inquiry, because the inquiry is created only when the customer builds options. See [`inquiries.md`](./inquiries.md).
- The public offer screen keeps Good / Recommended / Premium, snapshot totals, and the tenant deposit percent. Each card pins the price summary and Book Now / Submit inquiry, and scrolls attractions, dining, itinerary, and the recommendation inside the card. At `lg` and wider, all three cards stay side by side. Narrower widths show a Good / Recommended / Premium selector and one card. Recommended is the initial selection. Book Now and Submit inquiry belong to that visible card. Book Now still creates a pending unpaid booking. Submit inquiry still does not hold inventory.

## Intake compatibility

- `WANTS_FOOD` is adapted to `not_sure`, which tells a composed profile to use that tier's food strategy. `NO_FOOD` is `none` and omits food. A legacy dining key still maps through `diningPreferenceMap`. A stored product slug still selects that product.
- `private` and `semi_private` request a fitting configured space. `no_preference` adds a space only when the tier sets `includeSpace`.
- New public intake writes event-total `budgetMin` / `budgetMax` from `BUDGET_BAND_CENTS`. Those cents guide Good's value-food choice and the stored `budgetFit`. They do not override catalog prices. Older per-guest `budgetPreference` rows still expand to `guestCount × band`. `FLEXIBLE` leaves the cents null.
- Explicit attraction selections still force known-attraction mode. An empty selection still means recommend from the tenant profile.
- New intake stores `AttractionInterest` ids. The catalog engine receives each interest with its ordered product candidates and also the expanded product ids for profiles that have no `composition` block. The stored inquiry ids are not rewritten.
- Older inquiries may still store Product ids or sales-knowledge ids. Direct product ids are fulfilled as selected when they belong to the tenant catalog.
- Public intake may store `desiredDurationMinutes` as a preference (1.5, 2, 2.5, 3, or 4 hours). Flexible stores null. Event length on the proposal remains the dining and activity span. When that span is longer than the request, the explanation names the added scheduled activities. A longer room reservation does not explain or replace the event length.
- There is no beverage intake step. Beverages are optional `beverageSlugs` on a tier. They are catalog products, priced once, and omitted when the tenant configures none or the customer declines food. A drink bundled into a food product stays on that product.

## Availability

`ProductResourceRequirement` quantities feed the same `checkResourceAvailability` used by live agents and Confirm Booking. Required units use `ceil(guestCount / guestsPerUnit)` when the tenant configures `PER_GUESTS`. Capacities such as 6 guests per bowling lane are **tenant resource/product data**, not MagicCRM constants. Composite packages (exact count, all-of-type, specific unit, location-exclusive) are also tenant data. Recommendation generation and customer selection never insert reservations. Location-exclusive proposals add generic customer-facing copy such as “Private use of the full facility” and must not expose internal resource ids.

**Invariant:** Composite packages are configuration. Runtime code must not branch on tenant, product, or resource names to determine resource allocation.

Availability always runs with trusted `organizationId` and `locationId`. Location A1 resources cannot satisfy Location A2. Tenant A reservations cannot block Tenant B.

## AI ports

`recommend_proposals` and `lookup_availability` return server-built DTOs. Organization and location come from the conversation/inquiry context, never from the model, browser, or tool arguments. Tools must not include a “calculate price” action.

## Event span and scheduling behavior

Event length is the scheduled itinerary span, not the intake duration and not the longest product duration.

- `eventStart` is the earliest dining or activity start. `eventEnd` is the latest dining or activity end. `eventLengthMinutes = eventEnd - eventStart`.
- A space entitlement may be longer than that span. The room reservation keeps the catalog block (or the activity span when the event runs longer than the block). That reservation is labeled separately from event length. It does not stretch the customer event. A room-only proposal, with no dining or activities, uses the room block as the event length.
- Nearby search evaluates **candidate event start times**. For each start it builds the full itinerary, stamps every resource window, and accepts the candidate only when every required resource fits. Offsets stay `0, ±30, ±60, ±90, ±120`. Dining stays first when `foodFirst` is set. Only scheduled activities are permuted. Space windows and non-scheduled items are not shifted into gaps.
- If the scheduled span is longer than the customer requested, the proposal says so by naming the added scheduled activities. A longer private-room reservation is shown on the space line, not as the event length.
- Customer-facing times use 12-hour format, including conflict notes and “Why We Recommend This”.

Sample Itinerary contains dining and scheduled activities only. Included items (cards, credits, add-ons) and overlapping space reservations render in their own sections.

## Out of scope (Phase 3C)

Transactional email, Stripe deposit checkout, payment webhooks, payment recovery when two pending bookings race and only one can confirm. Customer Book Now pending bookings, Master Schedule pending panel, and Confirm Payment & Book exist.
