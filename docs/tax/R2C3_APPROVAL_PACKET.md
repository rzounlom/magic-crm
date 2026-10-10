# R2C.3 — Generations Tax Approval Packet

**Audience:** Generations management + tax professional / CPA  
**Purpose:** Unlock safe MagicCRM tax configuration — not to collect tax today  
**Draft config:** `docs/tax/generations-tax-configuration-draft.json` (inactive; not seeded)

---

## A. Management can confirm (business facts)

| # | Question | Why it matters | SKUs affected | Unlocks |
|---|---|---|---|---|
| M1 | Confirm legal tax location(s): AdventurePlex 1018 W Edison Rd, Mishawaka IN 46545; any Raceway (715 W Edison) or mobile axe nexus? | Jurisdiction binding; multi-location rates | All | `LocationTaxProfile` / jurisdictionResolved |
| M2 | Are advertised/catalog prices tax-**exclusive** or tax-**inclusive**? By product type if mixed. | Engine only supports exclusive today | All; especially packages priced xx99¢ and bowling shoes | Pricing mode; blocks inclusive SKUs until engine supports them |
| M3 | Exact inclusions for Have-a-Ball, Have-a-Blast, Have-it-All, adult packages, field trips: food? shoes? arcade credits? room? | SIB #7 single-ticket food rule; bundle policy | All PACKAGE / FIELD_TRIP | `ProductBundleTaxPolicy` |
| M4 | Are food charges separately stated on customer proposals/invoices when sold with activities? Provide sample docs. | Separately stated vs whole-ticket taxable | Packages + any combo events | Bundle treatment SEPARATELY_STATED vs FULLY_TAXABLE |
| M5 | Private rooms / mezzanine / full facility: sold as space rental on invoice? | SIB #41 accommodations | skybox, lower-event-room, mezzanine-*, full-facility-* | ROOM_FACILITY taxability path |
| M6 | Exclusive Axe Den / Laser Arena / Bowling Lounge / Climbers Cove: space rental or activity access? | Mixed classification | those RENTAL SKUs | Clear class vs UNRESOLVED |
| M7 | Arcade playcards / unlimited arcade / Laser Plex Card: stored value, admission, or game credits? Gift cards sold? | Tax on sale vs redemption | unlimited-arcade-1h, laser-plex-card, Have-a-Ball credits | STORED_VALUE policy |
| M8 | Deposit terms: 25% large-group non-refundable (sales knowledge); $100 birthday deposit — confirm current contracts, refunds, when tax is expected | Deposit tax timing | All booked events | Future deposit/tax policy (no code change now) |
| M9 | Shoe rental list price: catalog $3.50 vs website $4 + tax — which is current? | Tax base cents | bowling-1h shoes component | Shoe classification amount |
| M10 | Provide recent receipts/invoices (bowling+shoes, food, room, birthday package) and any existing CPA instructions | Ground truth | All | Faster CPA review |
| M11 | Confirm operating timezone for Main Location should be `America/Indiana/Indianapolis` (not UTC) | Scheduling currently uses location UTC | All reservations | Authorized timezone correction (separate from tax seed) |

---

## B. Tax professional should approve

| # | Decision | Official guidance already says | Why judgment still needed | SKUs | Unlocks |
|---|---|---|---|---|---|
| P1 | Taxability of bowling **lane** fees | Services generally nontaxable (SIB #94) | FEC-specific characterization | bowling-1h (lane) | EXEMPT or TAXABLE on primary component |
| P2 | Taxability of bowling **shoe** rentals | TPP rentals taxable (SIB #42); site “+tax” | Confirm and document | bowling-1h / shoes | TPP_RENTAL TAXABLE |
| P3 | Taxability of axe / laser admissions | SIB #94 services framework | No FEC-specific bulletin | axe-*, unlimited-laser-tag-90 | Activity classes |
| P4 | Prepared food / beverage taxability for Generations café SKUs | SIB #7/#11/#29 | Restaurant % test; alcohol | All FOOD SKUs | PREPARED_FOOD TAXABLE |
| P5 | Room/facility rentals as accommodations | SIB #41 | Fit of each SKU | skybox, rooms, mezzanine, full facility | ROOM_FACILITY TAXABLE |
| P6 | Exclusive attraction-area rentals | SIB #41 / #94 | Mixed facts | axe-den, laser arena, bowling lounge, climbers cove | Class + taxability |
| P7 | Package / birthday / field-trip treatment | SIB #7 + #94 | Depends on M3–M4 facts | All packages | Bundle policies |
| P8 | Seller-funded Wed 50% / Thu BOGO taxable base | SIB #58 reduces base; BOGO vs free merchandise (SIB #40) | Confirm presentation | Promoted axe/bowling lines | Keep post-promo base |
| P9 | Local FAB / other local taxes | FAB table: St. Joseph/Mishawaka not listed (re-check 2026-10-10) | Not permanent proof | Food + possible bundles | Whether multi-tax engine required |
| P10 | Event deposit tax timing | SIB #78 is layaway of TPP, not event deposits | Contract-specific | All deposits | Deposit policy; no collection yet |
| P11 | Apply inactive draft STATE_SALES 700 bps only after product approvals | Rate verified | Product application not approved | Taxable lines only | Future `calculationEnabled` (still not collection) |

---

## C. What MagicCRM will **not** do until approvals exist

- Set `calculationEnabled` or `collectionEnabled` for Generations  
- Seed the draft JSON into the database  
- Charge or display payable tax  
- Treat workbook 7% as universal  
- Invent package allocations from experience grants  

---

## D. Suggested approval sequence

1. Management answers M1–M11 with artifacts (invoices, contracts).  
2. CPA completes P1–P11 against those artifacts.  
3. Update draft manifest statuses to `APPROVED` only with dated approver notes.  
4. Authorize location timezone correction (scheduling) separately.  
5. Only then plan R2C.4+ controlled configuration load with both gates still reviewed.  

**Stop:** No automatic activation after this packet.
