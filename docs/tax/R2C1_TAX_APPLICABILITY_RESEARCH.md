# R2C.1 — Tax Applicability Research & Source Verification

**Phase:** R2C.1  
**Mode:** Research only — no tax implementation, no tenant configuration writes  
**Date:** 2026-10-10  
**Tenant reference:** Generations CRM Test (`generations-crm-test-1788129640704833684`)  
**Architectural invariant:** MagicCRM owns engines; organizations own configuration.

---

## 1. Executive summary

| Question | Finding |
|---|---|
| Where is tax calculated today? | Nowhere. `Booking.taxCents` is hardcoded to `0`. |
| Is the workbook 7% authoritative for Generations? | **No.** Indiana’s statewide sales tax **rate** is 7%, but that does not authorize applying 7% to every catalog line. |
| Venue jurisdiction | **VERIFIED** public venue address: 1018 West Edison Road, Mishawaka, IN 46545 (St. Joseph County). Not stored on Organization/Location records. |
| Can MagicCRM activate tax collection after this phase? | **No.** Product classifications, bundle allocations, tax-inclusive vs exclusive pricing, and professional confirmation remain open. |

This document is **not** legal advice. Indiana DOR information bulletins are guidance, not a substitute for counsel or a tax professional.

---

## 2. Current MagicCRM tax implementation (inspection)

### 2.1 Where tax is calculated or assumed

| Location | Behavior |
|---|---|
| `prisma/schema.prisma` → `Booking.taxCents` | Column exists, `@default(0)`. |
| `src/server/services/pending-booking-service.ts` | Sets `taxCents: 0` and uses plan total as both `subtotalCents` and `totalCents`. |
| Proposal engine / catalog pricing | No tax computation. Promotions adjust line cents only. |
| Public / employee proposal UI | Shows estimated total and deposit preview; no tax line. |
| `booking-detail.tsx` | Shows “Taxes / fees” only if `taxCents > 0` (never for current bookings). |
| Generations sales knowledge | Marketing copy: bowling shoes “$4 + tax” — not a rate engine. |
| Workbook | Historical 7% assumption — **not** verified as product-level applicability. |

### 2.2 Zero, absent, or embedded?

- **Calculation:** absent / forced zero.
- **Prices:** catalog cents appear to be **pre-tax / tax-exclusive display amounts** (website lists lane prices and separately “shoes $4.00 +tax”).  
  **CONDITIONAL:** management must confirm whether any listed package prices are tax-inclusive.

### 2.3 Quotes: pre-tax vs tax-inclusive

Quotes display a single `estimatedTotalCents` from catalog + promotions. No tax component. Customers currently see what MagicCRM treats as the commercial subtotal.

### 2.4 Deposits

- `Organization.depositPercent` (Generations catalog / DEV org: **25**).
- Deposit = `percentOfCents(totalCents, depositPercent)` on the **current zero-tax total**.
- `depositPaidCents` unused; payment collection not implemented (Phase 3C).
- Deposit preview is informational on proposals.

### 2.5 Historical snapshots and tax fields

Proposal / booking payloads snapshot line items, promotions, and totals. **No tax fields** on proposal line items or `pricingBreakdown`. Historical quotes cannot silently gain tax without a schema/payload extension and a deliberate reprice policy (out of scope).

### 2.6 Product categories vs tax classification

`ProductCategory` and `Product.kind` exist for merchandising (`ATTRACTION`, `PACKAGE`, `RENTAL`, `FOOD`, etc.). **No tax classification field.** Categories alone must not drive taxability.

### 2.7 Locations and jurisdictions

| Model | Address / jurisdiction fields |
|---|---|
| `Organization` | `timezone`, `currency`, `depositPercent` only |
| `Location` | `name`, `slug`, `timezone`, `active` only |

DEV persisted tenant:

| Field | Value |
|---|---|
| Org ID | `mdutc2nkvpafezukeem8942v` |
| Slug | `generations-crm-test-1788129640704833684` |
| Org timezone | `America/Indiana/Indianapolis` |
| Deposit % | 25 |
| Location | `Main Location` / `main` |
| Location timezone | `UTC` (inconsistent with org; **documented defect**, not fixed in this phase) |
| Street address in DB | **Absent** |

### 2.8 Where a future authoritative tax calculation belongs

After promotions and inclusion accounting, before deposit preview and booking money fields:

1. Base `priceProduct`  
2. Package inclusion / coverage accounting  
3. `applyPromotions`  
4. **`applyTaxes` (new engine step)** — jurisdiction resolve → taxable base → line tax → totals  
5. Deposit preview on **policy-defined** total (tax-exclusive vs inclusive — tenant decision)  
6. Immutable snapshot of tax lines + rate version into proposal/booking payload  

See `R2C1_TAX_ARCHITECTURE_PROPOSAL.md`.

---

## 3. Verified venue jurisdiction

### 3.1 Public / business sources (accessed)

| Source | What it establishes |
|---|---|
| [Generations AdventurePlex homepage](https://generations-adventureplex.com/) | Contact: **1018 West Edison Road, Mishawaka, IN 46545**; facility described as in Mishawaka, Indiana. |
| [FAQ](https://generations-adventureplex.com/faq/) | Same address; next to Cinemark Movies 14. |
| [About](https://generations-adventureplex.com/about-us/) | Mishawaka, Edison Road location narrative. |
| Repo sales knowledge | Same AdventurePlex address; separate Raceway address `715 W. Edison Road, Mishawaka, IN 46545`. |

### 3.2 Jurisdiction record

| Field | Value | Status |
|---|---|---|
| Street | 1018 West Edison Road | VERIFIED (public site + sales knowledge) |
| City | Mishawaka | VERIFIED |
| County | St. Joseph County | VERIFIED (city→county geography; corroborating directories) |
| State | Indiana | VERIFIED |
| ZIP | 46545 | VERIFIED |
| Taxing context | Indiana state sales/use tax; local FAB if adopted; accommodations/innkeeper where applicable | See §4 |
| Effective date of research | 2026-10-10 | — |
| Multiple taxable locations? | AdventurePlex + Generations Raceway addresses in knowledge; mobile axe throwing offered | **UNRESOLVED** for CRM multi-location tax |

### 3.3 What is *not* used as jurisdiction

Developer location, Neon host region, browser locale, workbook percentage, tenant slug, org timezone alone.

### 3.4 Database note

**Do not write** the verified street address into DEV/PROD as part of R2C.1. Future onboarding should capture tenant-owned address + jurisdiction mapping with approval.

---

## 4. Authoritative sources consulted

### 4.1 Indiana Department of Revenue — rates & local taxes

| Source | Authority | URL | Establishes | Uncertainty |
|---|---|---|---|---|
| DOR Tax Types — Sales Tax | IN DOR | https://www.in.gov/dor/about/news-publications/our-team/tax-types/ | Statewide sales tax **7%** on retail transactions per IC 6-2.5-4 | Which Generations products are “retail transactions” |
| DOR Food & Beverage Tax table | IN DOR | https://www.in.gov/dor/i-am-a/business-corp/food-and-beverage-tax/ | Adopting FAB jurisdictions & rates | St. Joseph County / Mishawaka **not listed** as of access date → no FAB in that table |
| FAB Business Guide | IN DOR | https://www.in.gov/dor/files/dor-fab-business-guide.pdf | FAB scope; remittance via INTIME | — |
| General Tax Info Bulletin #203 | IN DOR | https://www.in.gov/dor/files/reference/gb203.pdf | Local FAB overview | Cross-check table for changes |

**VERIFIED:** Indiana general sales tax rate is **7%**.  
**VERIFIED (as of table access 2026-10-10):** St. Joseph County and Mishawaka are **not** on DOR’s published FAB adopting list.  
**Not verified:** Any claim of a general local *sales tax* add-on (e.g. “7.75%”) — not used.

### 4.2 Food, meals, restaurants

| Bulletin | URL | Establishes |
|---|---|---|
| SIB #7 Meals and Banquets (Jun 2023 / eff. May 4, 2023) | https://www.in.gov/dor/files/sib07.pdf | Meals/banquets/food service generally taxable; **ticket including food + entertainment taxable in full unless food separately stated** |
| SIB #11 Restaurants / caterers | https://www.in.gov/dor/files/reference/sib11.pdf | Prepared food / restaurant treatment |
| SIB #29 Sales of Food (Sep 2025) | https://www.in.gov/dor/files/reference/sib29.pdf | Prepared food vs exempt food ingredients; utensils tests |

### 4.3 Bundles, discounts, rentals, accommodations, deposits

| Bulletin | URL | Establishes |
|---|---|---|
| SIB #94 Bundled and Unitary Transactions (Mar 2023) | https://www.in.gov/dor/files/sib94.pdf | Bundled/unitary definitions; services generally not taxable unless enumerated; true-object / de minimis exceptions |
| SIB #58 Price Reductions and Discounts (Nov 2022) | https://www.in.gov/dor/files/sib58.pdf | Seller-funded discounts reduce gross retail income; third-party reimbursed coupons generally do not |
| SIB #42 Rental of Tangible Personal Property (Apr 2023) | https://www.in.gov/dor/files/sib42.pdf | TPP rentals generally taxable |
| SIB #41 Accommodations (Mar 2024) | https://www.in.gov/dor/files/reference/sib41.pdf | Short-term rental of banquet halls, gymnasiums, arenas, similar spaces taxable as accommodations |
| SIB #78 Layaway Fees (Nov 2022) | https://www.in.gov/dor/files/sib78.pdf | Layaway deposits not taxed until final payment/transfer (TPP layaway context) |
| SIB #30 Entertainment Products | https://www.in.gov/dor/files/sib30.pdf | Sale/rental of media/equipment — **not** general amusement admissions |
| SIB #33 Unitary/bundled ≤ $0.07 | https://www.in.gov/dor/files/sib33.pdf | De minimis cents exemption (edge case) |
| SIB #90 SSUTA provisions | https://www.in.gov/dor/files/sib90.pdf | Bundled transaction statutory context |

### 4.4 Statutes / secondary

| Source | URL | Use |
|---|---|---|
| IC 6-2.5 (via DOR / IARP references) | Cited in SIBs above | Retail transaction / rate framework |
| 45 IAC 2.2 | https://iar.iga.in.gov/code/2026/45/2.2 | Administrative sales/use tax rules |
| SBOA “Indiana Business Taxes” overview | https://www.in.gov/sboa/files/DOR-IN-Business-Taxes.pdf | Secondary summary: gift cards listed among sales-tax exemptions — **not** a substitute for a dedicated gift-card bulletin |

### 4.5 Explicit non-sources

- Generations workbook 7% assumption  
- Secondary “7.75% Mishawaka” web summaries without DOR citation  
- MagicCRM `taxCents: 0` behavior as a legal position  

---

## 5. Cross-cutting research findings

### 5.1 Admissions / amusement activities — CONDITIONAL

**Framework (VERIFIED):**

- Indiana sales tax targets **retail transactions** (transfer of tangible personal property, enumerated services, accommodations, etc.).  
- SIB #94: except for certain enumerated services, professional/personal services are generally **not** selling at retail.

**Implication for bowling / axe / laser / climb / mini-golf lane or session fees:**  
Treating pure activity access as a nontaxable service is **plausible under the general services rule**, but Generations-specific classification is **CONDITIONAL** until a tax professional confirms how each SKU is characterized (service vs TPP vs accommodation vs bundled ticket).

**Website practice:** shoes listed “+ tax” while lane prices are listed without “+ tax” — corroborates a **split** treatment, not universal 7% on all activities.

**County admissions taxes:** Marion / Hendricks admissions taxes (DOR Tax Types) do **not** apply to St. Joseph County FEC admissions on the face of those statutes’ geographic scope.

### 5.2 Tangible personal property rentals (shoes, equipment) — CONDITIONAL → likely taxable

SIB #42: rentals of TPP are generally taxable. Bowling shoe rentals fit this pattern. Generations public copy (“shoes $4.00 +tax”) aligns.

Axe equipment included in the admission fee (not separately charged) is a bundling fact — see matrix.

### 5.3 Prepared food & beverages — CONDITIONAL → likely taxable sales tax; FAB unlikely locally

SIB #7 / #11 / #29: prepared meals, banquets, restaurant-style food generally taxable. Generations pizza, bars, platters, wings are prepared-food style offerings.

**FAB:** St. Joseph / Mishawaka not on DOR FAB table → **no FAB rate verified** for this venue as of research date. Re-check before activation.

Alcohol: may involve ATC licensing and additional rules — **UNRESOLVED** for pitchers/beer wall beyond sales-tax prepared-beverage framing.

### 5.4 Accommodations / event spaces — CONDITIONAL → likely taxable

SIB #41 explicitly includes banquet halls, gymnasiums, arenas, and similar spaces rented &lt; 30 days. Skybox, Lower Event Room, Mezzanine, Full Facility rentals should be reviewed as **accommodations**. Exclusive attraction-area rentals (Axe Den, Laser Arena, Bowling Lounge) need fact-specific classification (accommodation vs amusement service vs bundle).

### 5.5 Bundled packages — CONDITIONAL / high risk

Two official rules interact:

1. **SIB #7:** If a single ticket/admission price includes **food + entertainment**, the **entire** selling price is subject to sales tax **unless food is separately stated**.  
2. **SIB #94:** Bundled/unitary rules for mixed taxable/nontaxable products; true-object and de minimis exceptions; separately itemized prices generally avoid “one nonitemized price” bundling.

**Critical:** MagicCRM experience-grant coverage is **not** a tax allocation. Tax needs separately maintained monetary components and legally defined treatment.

Have-a-Ball / Have-it-All / adult packages with food inclusions are **UNRESOLVED** until component prices or separately stated food charges are confirmed.

### 5.6 Promotions / discounts — VERIFIED framework for taxable TPP lines

SIB #58 (seller-funded, non-reimbursed discounts): tax on **amount actually received** after discount.

For Generations promotions (Wed 50%, Thu BOGO) **if and only if** the underlying line is taxable:

| Step | Ordering |
|---|---|
| 1 | Base product price |
| 2 | Promotion adjustment (seller-funded) |
| 3 | Taxable base = discounted selling price |
| 4 | Tax calculation |
| 5 | Final amount due |

If the underlying activity line is **nontaxable**, promotion does not create tax.  
If shoes (taxable TPP) are never discounted (current engine), shoe tax base remains full shoe charge.

BOGO: economically a seller-funded price reduction on equal-priced units — align with SIB #58 / #40 interaction; confirm with tax pro for free-unit presentation.

### 5.7 Deposits & timing — CONDITIONAL

- SIB #78 addresses **layaway of TPP**: deposits not taxed until final payment and transfer.  
- Event booking deposits for future services/packages are **not the same fact pattern**.  
- **UNRESOLVED:** whether Generations’ 25% event deposit triggers sales tax on receipt, on event date, or only on taxable components at settlement.  
- Refundable vs nonrefundable deposit terms unknown.  
- Quoted totals today are not tax-inclusive estimates.

**Do not** assume deposit = 25% of tax-inclusive total until business + legal rules are set.

### 5.8 Stored value / arcade / gift cards — UNRESOLVED / CONDITIONAL

- Gift cards often nontaxable at sale (secondary DOR overview; SIB #10 treats gift cards as nontaxable components in bundling examples).  
- Arcade playcards / unlimited arcade hour products may be stored value, admission, or TPP credit — **facts missing**.  
- Tax typically arises on redemption of taxable goods/services — needs accountant confirmation.

---

## 6. Workbook 7% assumption — disposition

| Claim | Disposition |
|---|---|
| “Indiana sales tax rate is 7%” | **VERIFIED** (DOR Tax Types) |
| “Apply 7% to every Generations proposal line” | **REJECTED** — not evidence-supported |
| “MagicCRM may collect tax because workbook said 7%” | **REJECTED** |
| “Zero tax in code means nontaxable” | **REJECTED** — implementation stub only |

---

## 7. Defects observed (documented only)

1. `Location.timezone = UTC` on Generations DEV main location while org uses `America/Indiana/Indianapolis`.  
2. No venue address fields on Location — jurisdiction cannot be resolved from DB alone.  
3. `taxCents` always 0 — placeholder, not a legal determination.  
4. Sales knowledge mentions a second street address (Raceway) not modeled as a Location.

No code or data changes made in R2C.1.

---

## 8. Related documents

- `R2C1_PRODUCT_TAX_MATRIX.md` — product-level matrix  
- `R2C1_TAX_ARCHITECTURE_PROPOSAL.md` — engine design  
- `R2C1_OPEN_DECISIONS.md` — approval gates  
