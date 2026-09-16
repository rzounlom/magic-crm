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
- `Product` — SKU with audience, duration, guest bounds, optional `weekendOnly` and `fulfillmentGroup`
- `ProductPrice` — one or more strategies in **integer cents** (`PACKAGE_BASE_PLUS_ADDITIONAL`, `PER_PERSON`, `PER_LANE_WEEKDAY_WEEKEND`, `FIXED_RENTAL`, `DAY_SPECIFIC_RENTAL`, `DURATION_BASE_PLUS_ADDITIONAL_HOUR`, `TIME_WINDOW_RENTAL`, food strategies)
- `ProductResourceRequirement` — `FIXED` | `PER_GUESTS` | `ALL_OF_TYPE` against an existing `ResourceType`
- `ProductServing` — food `servesMin` / `servesMax` / optional `unitCount`. Do not invent quantities beyond the source range
- `RecommendationProfile` — per organization + audience JSON (default package slugs, food-first sequencing, add-on slugs)

Inquiry commercial lifecycle is `salesStage`: `INQUIRY` → `PROPOSAL_READY` → `READY_TO_BOOK` (follow-up, no hold) → `HOLD_PLACED` (24h exact-resource hold) → `DEPOSIT_PENDING` (unused until 3C) → `BOOKED`. `Inquiry.status` remains handling/pipeline. `workflowStage` remains the staff booking workspace substatus. `audience` is `KIDS_YOUTH` | `ADULTS` | `MIXED`. `attractionMode` is `KNOWN` | `RECOMMEND`.

## Import

Catalog is **not** created in `provisionOrganization`. Development import:

```bash
npm run tenant:import-booking-catalog -- --slug <organizationSlug> --confirm IMPORT
```

Guards match sales-knowledge import: `--slug` only (no `organizationId`), explicit `IMPORT`, blocked when `NODE_ENV=production` or `MAGICCRM_DATABASE_ROLE=test`. The compiled dataset is `scripts/data/generations-booking/booking-catalog.json`. Spreadsheets in that folder are source material, not runtime input.

The importer upserts by `(organizationId, slug)`, attaches numbered `Resource` rows to the tenant's primary location, seeds types from the dataset (counts and capacities come from that file, not from MagicCRM constants), and prints created/updated/unchanged plus unresolved source ambiguities.

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

All amounts are integer cents. Use `priceProduct` in `src/server/catalog/pricing.ts`. Deposit preview uses `Organization.depositPercent` (default 30). Collection, Stripe, and payment links are Phase 3C.

## Phase 3C (not this phase)

Transactional email, collecting the configured deposit via Stripe, payment webhooks, and automatic HOLD → BOOKED after a valid deposit. Customer 24-hour holds, hold expiry, Confirm Booking, and the Master Schedule exist and must not be duplicated.
