# R2C.1 — Generations Product Tax Applicability Matrix

**Jurisdiction researched:** 1018 W Edison Rd, Mishawaka, IN 46545 (St. Joseph County)  
**State sales tax rate (VERIFIED):** 7% (IN DOR Tax Types / IC 6-2.5) — rate existence ≠ product applicability  
**Local FAB (VERIFIED as of 2026-10-10 DOR table):** St. Joseph County / Mishawaka **not listed** → no FAB rate applied in this matrix  
**Catalog source:** `scripts/data/generations-booking/booking-catalog.json` + DEV tenant products  
**Status legend:** VERIFIED · CONDITIONAL · UNRESOLVED  

**Do not activate collection from this matrix without accountant/management confirmation.**

---

## How to read this matrix

- **Proposed tax classification** is an evidence-supported *working label*, not an activation decision.  
- **Rate** is filled only when the rate itself is officially verified **and** the line is clearly within a verified taxable category. Otherwise `—` or “7% IF taxable”.  
- Experience grants explain customer benefits; they are **not** tax allocations.

---

## A. Activities and admissions

| Product ID (slug) | Description | Proposed classification | Applicability | Jurisdiction | Rate | Tax basis | Source | Missing facts | Implementation consequence |
|---|---|---|---|---|---|---|---|---|---|
| `bowling-1h` | Bowling 1 hour / lane (+ separate shoe line) | Amusement **service** (lane); shoes separate | CONDITIONAL (service often nontaxable per SIB #94 general rule); shoes → see §C | IN / St. Joseph | — / 7% IF TPP | Lane: n/a if nontaxable; shoes: after seller discount | SIB #94; public “shoes +tax” | Confirm service vs TPP characterization with tax pro | Separate tax class for lane vs shoe add-on |
| `axe-throwing-30` | Axe 30 min / person | Amusement service admission | CONDITIONAL | IN / St. Joseph | — | If taxable, post-promo net | SIB #94; SIB #58 | Equipment included vs separate | Class: `AMUSEMENT_SERVICE` until confirmed |
| `axe-throwing-60` | Axe 60 min / person | Amusement service admission | CONDITIONAL | IN / St. Joseph | — | Same | Same | Thu BOGO eligibility open (business) | Same; no auto BOGO tax assumption |
| `unlimited-laser-tag-90` | Unlimited laser 90 min | Amusement service | CONDITIONAL | IN / St. Joseph | — | Same | SIB #94 | Product completeness | Class pending |
| `laser-plex-card` | Laser Plex Card | Admission / stored-value hybrid | UNRESOLVED | IN / St. Joseph | — | Unknown | — | Card economics | Do not auto-tax |
| `unlimited-arcade-1h` | 1h unlimited arcade | Stored value vs admission | UNRESOLVED | IN / St. Joseph | — | Unknown | Gift-card secondary notes | Playcard vs timed admission | Separate stored-value policy |
| Walk-in laser / climb / mini-golf (website; not fully catalogued as à-la-carte SKUs) | Single-game / per-climb / mini-golf | Amusement service | UNRESOLVED (SKU incomplete in CRM) | IN / St. Joseph | — | — | Public site pricing | Catalog products missing | Keep inactive specials; tax after SKU exists |
| County admissions tax | N/A | Geographic admissions taxes | VERIFIED **not applicable** (Marion/Hendricks-specific) | St. Joseph | n/a | — | DOR Tax Types | — | No county admissions tax config for this venue |

---

## B. Food and beverages

| Product ID (slug) | Description | Proposed classification | Applicability | Jurisdiction | Rate | Tax basis | Source | Missing facts | Implementation consequence |
|---|---|---|---|---|---|---|---|---|---|
| `pizza-pitcher-combo` | Pizza & pitcher combination | Prepared food / beverage | CONDITIONAL → likely **taxable** sales tax | IN | 7% IF taxable | Gross after seller discounts | SIB #7, #11, #29 | Alcohol vs soft drink; utensils; restaurant % test | `PREPARED_FOOD` class; FAB = none unless table changes |
| `fajita-bar` | Fajita bar | Prepared food / banquet-style | CONDITIONAL → likely taxable | IN | 7% IF taxable | Same | SIB #7 | Serving style | Same |
| `slider-bar` | Slider bar | Prepared food | CONDITIONAL → likely taxable | IN | 7% IF taxable | Same | SIB #7 | — | Same |
| `smokehouse-bbq` | Smokehouse BBQ | Prepared food | CONDITIONAL → likely taxable | IN | 7% IF taxable | Same | SIB #7 | — | Same |
| `breakfast-bar` | Breakfast bar | Prepared food | CONDITIONAL → likely taxable | IN | 7% IF taxable | Same | SIB #7 | — | Same |
| `boneless-wings-36` | Wings platter | Prepared food | CONDITIONAL → likely taxable | IN | 7% IF taxable | Same | SIB #11/#29 | — | Same |
| `traditional-wings-36` | Wings platter | Prepared food | CONDITIONAL → likely taxable | IN | 7% IF taxable | Same | Same | — | Same |
| `pretzel-bite-platter` | Pretzel platter | Prepared food | CONDITIONAL → likely taxable | IN | 7% IF taxable | Same | Same | Bakery exclusions unlikely if utensils/restaurant | Same |
| `chicken-strip-platter` | Chicken strip platter | Prepared food | CONDITIONAL → likely taxable | IN | 7% IF taxable | Same | Same | — | Same |
| `salad-pan` | Salad pan | Prepared food | CONDITIONAL → likely taxable | IN | 7% IF taxable | Same | Same | — | Same |
| `charcuterie-boards` | Charcuterie | Prepared food | CONDITIONAL → likely taxable | IN | 7% IF taxable | Same | Same | — | Same |
| `brownie-tray` / `cookie-tray` | Dessert trays | Prepared food / bakery facts | CONDITIONAL | IN | 7% IF taxable | Same | SIB #29 utensils/restaurant tests | Restaurant vs combination business status | Confirm with accountant |
| Local FAB on above | — | County/municipal FAB | VERIFIED **not listed** for St. Joseph/Mishawaka | Local | 0% (table) | — | DOR FAB table | Re-check before go-live | Config rate = 0 until change |

---

## C. Equipment and spaces

| Product ID (slug) | Description | Proposed classification | Applicability | Jurisdiction | Rate | Tax basis | Source | Missing facts | Implementation consequence |
|---|---|---|---|---|---|---|---|---|---|
| Bowling shoe add-on (priced with `bowling-1h`) | Shoe rental line | TPP **rental** | CONDITIONAL → likely **taxable** | IN | 7% IF taxable | Full shoe charge (promos exclude shoes today) | SIB #42; public “+tax” | Confirm always separately stated | Dedicated `TPP_RENTAL` on shoe line |
| Axe equipment | Included in axe admission | Included in service price | UNRESOLVED / CONDITIONAL | IN | — | Bundle analysis if separately charged | SIB #94 | No separate SKU | No separate tax line unless charged |
| `skybox` | Skybox private event room | Accommodation rental (&lt;30 days) | CONDITIONAL → likely **taxable** | IN | 7% IF taxable | Gross rental | SIB #41 (banquet halls / similar) | Innkeeper tax? (usually lodging) | `ACCOMMODATION` class |
| `lower-event-room` | Lower event room | Accommodation rental | CONDITIONAL → likely taxable | IN | 7% IF taxable | Same | SIB #41 | — | Same |
| `mezzanine-*` | Mezzanine exclusive rentals | Accommodation / facility | CONDITIONAL → likely taxable | IN | 7% IF taxable | Same | SIB #41 | — | Same |
| `full-facility-*` / `full-facility-additional-hour` | Full facility | Accommodation / facility | CONDITIONAL → likely taxable | IN | 7% IF taxable | Same | SIB #41 | — | Same |
| `bowling-lounge-1h` / `bowling-lounge-2h` | Exclusive bowling + lounge | Mixed accommodation + amusement | UNRESOLVED | IN | — | May need allocation | SIB #41/#94 | What is rented | Require component policy |
| `axe-den-2h` | Axe Den exclusive | Mixed | UNRESOLVED | IN | — | Same | Same | — | Same |
| `laser-tag-arena-90` / `laser-tag-arena-sat-hourly` | Arena exclusive | Mixed | UNRESOLVED | IN | — | Same | Same | — | Same |
| `climbers-cove-90` | Climbers Cove rental | Mixed | UNRESOLVED | IN | — | Same | Same | — | Same |

---

## D. Bundles / packages

| Product ID (slug) | Description | Proposed classification | Applicability | Jurisdiction | Rate | Tax basis | Source | Missing facts | Implementation consequence |
|---|---|---|---|---|---|---|---|---|---|
| `have-a-ball-bowling` | Kids birthday bowling package | Mixed bundle (activity ± food ± other) | UNRESOLVED | IN | — | SIB #7 if food in single ticket; else SIB #94 | SIB #7, #94 | Exact inclusions & separately stated prices | Do not invent allocations; require component money map |
| `have-a-ball-mini-golf` | Kids birthday mini golf | Mixed bundle | UNRESOLVED | IN | — | Same | Same | Same | Same |
| `have-a-blast` | Laser birthday | Mixed bundle | UNRESOLVED | IN | — | Same | Same | Same | Same |
| `have-it-all` | Taste of Adventure birthday | Mixed multi-activity ± food | UNRESOLVED | IN | — | Same | Same | Same | Same |
| `all-access` / `axe-treme` / `laser-plex-package` / `play-axtion` | Adult packages | Mixed | UNRESOLVED | IN | — | Same | Same | Component values | Same |
| `field-trip-*` / `youth-group-lock-in` | Youth packages | Mixed; possible exempt purchasers | UNRESOLVED | IN | — | Exemption certs (SIB #10/#32) | SIB #10 | Who pays; school status | Exemption workflow before tax |
| Pizza & Pins (workbook / knowledge; mapping incomplete) | Bundle mapping gap | UNRESOLVED | IN | — | — | — | Catalog mapping | Resolve catalog first |

**SIB #7 rule (VERIFIED text):** single ticket price including food + entertainment → **entire** price taxable unless food separately stated.

---

## E. Stored value

| Product / component | Description | Proposed classification | Applicability | Rate | Tax basis | Source | Missing facts | Implementation consequence |
|---|---|---|---|---|---|---|---|---|
| Arcade playcard (website kiosk) | Stored-value style credits | Prepaid / stored value | UNRESOLVED | — | Often tax on redemption of taxable items | Secondary gift-card notes; no dedicated bulletin accessed for arcade cards | Legal form of card | Do not implement redemption tax in R2C.1 |
| Gift cards (if sold) | Cash-equivalent | Often nontaxable at sale | CONDITIONAL | — | Tax on redemption | SBOA overview; SIB #10 examples | Whether Generations sells gift cards in CRM | Separate product kind |
| Prepaid balances | — | UNRESOLVED | — | — | — | — | — | Out of scope |

---

## F. Transaction components (non-SKU)

| Component | Proposed treatment | Applicability | Source | Missing facts | Implementation consequence |
|---|---|---|---|---|---|
| Deposits (25% policy) | Timing unknown for event deposits | CONDITIONAL | SIB #78 (layaway analogy only) | Refundability; when tax attaches | Do not tax deposits in engine until confirmed |
| Mandatory fees | Taxable if part of gross retail income for taxable sale | CONDITIONAL | SIB #92 (referenced by #58/#42) | Fee schedule | Fee tax class |
| Optional service charges / gratuities | SIB #7: unsolicited gratuities not taxable; separately stated serving charges special rules | CONDITIONAL | SIB #7 | Whether Generations adds auto-grat | Config |
| Seller-funded % / fixed / BOGO promos | Reduce taxable base of **taxable** lines | VERIFIED framework | SIB #58 | Whether activity lines are taxable | Apply after promo on taxable lines only |
| Wed bowling 50% | Seller-funded % on lane line | CONDITIONAL (lane taxability) | SIB #58 | — | Shoes remain full base if taxable |
| Wed axe 50% | Seller-funded % | CONDITIONAL | SIB #58 | — | Same |
| Thu axe 30 BOGO | Seller-funded free units | CONDITIONAL | SIB #58 / #40 interaction | Presentation as free merchandise vs price reduction | Confirm with tax pro |
| Third-party coupons | Generally do not reduce base if reimbursed | VERIFIED framework | SIB #58 | Not used today | Future coupon funding flag |

---

## G. Summary counts (catalog file)

| Kind | Count (approx.) | Dominant open status |
|---|---|---|
| ATTRACTION | 6 | CONDITIONAL / UNRESOLVED |
| PACKAGE / FIELD_TRIP | 12+ | UNRESOLVED (bundles) |
| RENTAL | 15+ | CONDITIONAL (accommodations) / UNRESOLVED (exclusive areas) |
| FOOD | 12 | CONDITIONAL → likely taxable sales tax |
| ADD_ON | 2 | Follow parent rental class |

---

## H. Explicit non-conclusions

1. Do **not** mark all attractions taxable because the state rate is 7%.  
2. Do **not** mark all attractions exempt because services are often nontaxable — confirm.  
3. Do **not** use experience grants as tax allocation percentages.  
4. Do **not** apply FAB in St. Joseph without a future DOR table/ordinance change.  
