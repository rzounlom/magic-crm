# Tenant catalog

The catalog is the source of truth for sellable products, integer-cent prices, food servings, and how products consume finite resources. It is tenant-scoped data.

**MagicCRM owns engines; organizations own configuration.** Application code must not special-case any tenant, including Generations Adventureplex. Generations is tenant #1 and a development/reference dataset, not a global default.

Products may be organization-wide (`locationId` null) or location-specific. Resources are physical and belong to one location. Availability and proposal fulfillment resolve against **one** location.

## Ownership

| Model | Tenant boundary |
| --- | --- |
| `ProductCategory` / `Product` / `RecommendationProfile` | `organizationId` |
| `ProductPrice` / `ProductServing` / `ProductResourceRequirement` | `organizationId` plus composite FK to the same-tenant parent `Product` (and `ResourceType` for requirements) |
| `ResourceType` / `Resource` | `organizationId`; `Resource.locationId` is the physical location |
| `EventPlanRecommendation` | `organizationId` plus composite FK to the same-tenant `Inquiry`; snapshot JSON also stores `organizationId` / `locationId` for Phase 3B holds |

Sales knowledge (`SalesKnowledgeItem`) stays policies, FAQs, hours, and sales copy. Once a catalog product exists for an offering, proposal arithmetic must not parse `priceText`.

## Models

- `ProductCategory` — grouping (birthday packages, food, rentals)
- `Product` — SKU with audience, duration, guest bounds, optional `weekendOnly`, `fulfillmentGroup`, and `schedulingBehavior`

`schedulingBehavior` is an optional tenant override: `SCHEDULED`, `SPACE_WINDOW`, or `NON_SCHEDULED`. When it is null, the engine derives the role:

- `FOOD` → dining block (sequential)
- `RENTAL` → space entitlement (overlaps the event)
- add-on, or any product with no duration and no resource requirements → non-scheduled included item
- otherwise → scheduled activity

Do not turn a non-scheduled product into an itinerary block. Do not invent a duration from price, cents, quantity, or serving size. A null duration with no resource requirement is not a timed activity.
- `ProductPrice` — one or more strategies in **integer cents** (`PACKAGE_BASE_PLUS_ADDITIONAL`, `PER_PERSON`, `PER_LANE_WEEKDAY_WEEKEND`, `FIXED_RENTAL`, `DAY_SPECIFIC_RENTAL`, `DURATION_BASE_PLUS_ADDITIONAL_HOUR`, `TIME_WINDOW_RENTAL`, food strategies)
- `ProductResourceRequirement` — how a catalog `Product` consumes finite inventory. One product may have many requirement rows (a composite package). Quantity rules:
  - `FIXED` — exact count (tenant-configured, never a MagicCRM constant)
  - `PER_GUESTS` — `ceil(guestCount / guestsPerUnit)`
  - `ALL_OF_TYPE` — every **active** bookable `Resource` of that type at **this** organization + location
  - `SPECIFIC_RESOURCE` — one named unit (`resourceId`); must belong to the same organization, location, and type
  - `LOCATION_EXCLUSIVE` — exclusive ownership of every active bookable resource at **this** Location (not other locations in the organization)

- `ProductServing` — food `servesMin` / `servesMax` / optional `unitCount`. Do not invent quantities beyond the source range
- `RecommendationProfile` — per organization + audience JSON (default package slugs, food-first sequencing, add-on slugs)

Inquiry commercial lifecycle is `salesStage`: `INQUIRY` → `PROPOSAL_READY` → `READY_TO_BOOK` (Submit inquiry, no occupancy) → `DEPOSIT_PENDING` (Book Now pending booking, no occupancy) → `BOOKED`. Legacy `HOLD_PLACED` remains readable. `Inquiry.status` remains handling/pipeline.

## Import

Catalog is **not** created in `provisionOrganization`. Development import:

```bash
npm run tenant:import-booking-catalog -- --slug <organizationSlug> --confirm IMPORT
```

Guards match sales-knowledge import: `--slug` only (no `organizationId`), explicit `IMPORT`, blocked when `NODE_ENV=production` or `MAGICCRM_DATABASE_ROLE=test`. The compiled dataset is `scripts/data/generations-booking/booking-catalog.json`. Spreadsheets in that folder are source material, not runtime input.

The importer upserts by `(organizationId, slug)`, attaches numbered `Resource` rows to the tenant's primary location, seeds types from the dataset (counts and capacities come from that file, not from MagicCRM constants), and prints created/updated/unchanged plus unresolved source ambiguities. Requirement rows are replaced as a set: a second import of the same file must not duplicate `ProductResourceRequirement` rows. Import validation fails closed (quantity ≤ 0, quantity greater than active inventory, `SPECIFIC_RESOURCE` on another location, `ALL_OF_TYPE` with zero active units, `LOCATION_EXCLUSIVE` combined with other resource requirements, duplicate type rows).

**Invariant:** Composite packages are configuration. Runtime code must not branch on tenant, product, or resource names to determine resource allocation.

Generations Mezzanine and Full Facility are rows in `scripts/data/generations-booking/booking-catalog.json`. Mezzanine is a composite of SPECIFIC Mezzanine + ALL active bowling lanes at the location + FIXED 7 axe units + SPECIFIC Skybox. Full Facility is `LOCATION_EXCLUSIVE` (not a hand-maintained list of today's inventory). Another tenant can import a different bundle (all 12 lanes + 4 karaoke rooms, a location-wide buyout, etc.) without source-code changes.

Catalog import is an **explicit tenant bootstrap** tool. Provisioning a new organization does not copy Generations products. Future onboarding:

```text
create organization
→ configure locations
→ import/configure catalog
→ configure resources
→ configure recommendation profiles
→ configure policies
→ activate booking/sales capabilities
```

Admin onboarding UI is not built yet. Entitlements (whether the tenant has `EVENT_BOOKING`) are separate from catalog configuration and remain deferred.

## Money

All amounts are integer cents. Use `priceProduct` in `src/server/catalog/pricing.ts`. Deposit amount uses `Organization.depositPercent` (schema default 30). A dataset may include `depositPercent`; import writes that value on the selected organization only. Collection, Stripe, and payment links are Phase 3C.

## Phase 3C (not this phase)

Transactional email, collecting the configured deposit via Stripe, payment webhooks, and automatic HOLD → BOOKED after a valid deposit. Customer 24-hour holds, hold expiry, Confirm Booking, and the Master Schedule exist and must not be duplicated.
