# R2C.3 — Tax Evidence Reconciliation

**Date:** 2026-10-10  
**Tenant:** Generations CRM Test (`generations-crm-test-1788129640704833684` / `mdutc2nkvpafezukeem8942v`)  
**Mode:** Read-only research reconciliation. No activation.

---

## 1. R2C.1 open questions (still open)

| ID | Topic | Status |
|---|---|---|
| M1 | Legal venue address(es) / multi-location nexus | Open — public address verified; DB profile not written; Raceway/mobile axe open |
| M2 | Tax-inclusive vs exclusive list prices | Open |
| M3 | Package inclusions & separately stated food | Open |
| M4 | Room rental invoice characterization | Open |
| M5 | Arcade / stored-value legal form | Open |
| M6 | Deposit/refund contract terms | Partially evidenced in sales knowledge; tax timing open |
| M7 | Existing accountant treatment | Open |
| M8 | Alcohol / pitchers | Open |
| M9 | Exemption certificates | Open |
| M10 | Single vs multiple taxable locations | Open |
| P1–P10 | Tax-professional product/bundle/deposit decisions | Open — none `APPROVED` |

---

## 2. Official sources re-checked (2026-10-10)

| Source | URL | Establishes | Uncertainty |
|---|---|---|---|
| DOR Tax Types — Sales Tax | https://www.in.gov/dor/about/news-publications/our-team/tax-types/ | Statewide sales tax **7%** on retail transactions (IC 6-2.5-4) | Which Generations lines are retail transactions |
| DOR FAB table | https://www.in.gov/dor/i-am-a/business-corp/food-and-beverage-tax/ | Adopting FAB jurisdictions | **St. Joseph / Mishawaka still absent** as of re-check |
| SIB #7 Meals/Banquets | https://www.in.gov/dor/files/sib07.pdf | Meals/banquets generally taxable; ticket with food+entertainment taxable in full unless food separately stated | Actual Generations ticket presentation |
| SIB #11 Restaurants | https://www.in.gov/dor/files/reference/sib11.pdf | Prepared food / restaurant rules | Combination-business % test for FEC |
| SIB #29 Food | https://www.in.gov/dor/files/reference/sib29.pdf | Prepared food vs exempt food ingredients | Soft drinks, utensils |
| SIB #41 Accommodations | https://www.in.gov/dor/files/reference/sib41.pdf | Banquet halls, gymnasiums, arenas, similar spaces &lt;30 days taxable | Whether each rental SKU fits |
| SIB #42 TPP rentals | https://www.in.gov/dor/files/sib42.pdf | TPP rentals generally taxable | Shoe rental application (site “+tax”) |
| SIB #58 Discounts | https://www.in.gov/dor/files/sib58.pdf | Seller-funded discounts reduce gross retail income | BOGO / free-unit presentation |
| SIB #78 Layaway | https://www.in.gov/dor/files/sib78.pdf | Layaway deposits not taxed until final transfer | Event deposits ≠ layaway |
| SIB #94 Bundled/Unitary | https://www.in.gov/dor/files/sib94.pdf | Services generally nontaxable unless enumerated; bundled/unitary rules | Activity fee characterization |
| Generations site | https://generations-adventureplex.com/ | Address; shoes “$4.00 +tax”; lane prices listed without “+tax” | Not a statute |

**Workbook 7%:** remains **not** product-level authority.

---

## 3. Classification of conclusions

### Verified statutory / agency rules (framework)

- Indiana state sales tax rate is 7%.  
- Services generally not selling-at-retail unless enumerated (SIB #94).  
- TPP rentals generally taxable (SIB #42).  
- Prepared meals/banquets generally taxable (SIB #7).  
- Short-term banquet/gym/arena-like accommodations taxable (SIB #41).  
- Food+entertainment single ticket → whole price taxable unless food separately stated (SIB #7).  
- Seller-funded discounts reduce taxable gross retail income (SIB #58).  
- St. Joseph/Mishawaka not on current DOR FAB adopting list (re-checked).

### Plausible application requiring transaction facts

- Bowling lane / axe / laser / climb admissions as nontaxable services.  
- Shoe line as taxable TPP rental.  
- Food catalog SKUs as taxable prepared food.  
- Skybox / Lower Event Room / Mezzanine / Full Facility as accommodations.  
- Wed/Thu seller-funded promos reducing taxable base **if** the line is taxable.

### Requires tax-professional judgment before activation

- Final taxability of every attraction SKU.  
- Exclusive area rentals (Axe Den, Laser Arena, Bowling Lounge, Climbers Cove).  
- All birthday/adult/youth packages (SIB #7 / #94).  
- Arcade / Laser Plex Card stored-value timing.  
- Event deposit tax timing.  
- Alcohol in pizza-pitcher.  
- Whether any local tax beyond state sales applies despite FAB table absence.

---

## 4. Engine representation capability

| Requirement | Engine can represent? | Notes |
|---|---|---|
| Org/location disable | Yes | Defaults / absent settings → `DISABLED` |
| Explicit classifications | Yes | Per product + `shoes` component |
| Effective-dated 7% STATE_SALES | Yes | As draft inactive rate only |
| Seller-funded post-promo base | Yes | Uses post-promotion line totals |
| Explicit EXEMPT activity + taxable shoes | Yes | Synthetic tests pass |
| Fully taxable / exempt / unresolved bundle | Yes | |
| Separately stated components as opaque package line | No (fail-closed) | Needs component lines or policy redesign |
| Tax-inclusive prices | No | Fail-closed `UNRESOLVED_RATE` |
| Stacked COUNTY_FAB + STATE_SALES | No | FAB type storable; calculator applies STATE_SALES only |
| Deposit tax on receipt | No | Out of scope; amount due ignores tax |

**R2C.2 defects blocking eventual activation?**  
No critical calculator defect found for exclusive, post-discount, single-authority STATE_SALES cases. Activation is blocked by **missing approvals/facts** and known gaps (inclusive mode, multi-tax stacking, package facts, location UTC scheduling impact).

---

## 5. Taxable-base semantics for Generations promotions

| Promotion | Seller-funded? | Engine base | Evidence |
|---|---|---|---|
| Wed Bowling 50% | Yes (tenant promo) | Post-discount lane total; shoes undiscounte | SIB #58 if lane taxable |
| Wed Axe 50% | Yes | Post-discount person total | SIB #58 if taxable |
| Thu Axe 30 BOGO | Yes (tenant BOGO) | Post-BOGO person total | SIB #58; BOGO/free-unit presentation → CPA (SIB #40 interaction) |

No third-party-funded coupons in current Generations promo config.

---

## 6. Multiple-tax handling

| Tax type | Applicable? | Evidence | Engine |
|---|---|---|---|
| STATE_SALES 7% | Rate verified; product application conditional | DOR Tax Types | Supported |
| COUNTY_FAB | Not listed for St. Joseph/Mishawaka (2026-10-10) | DOR FAB table | Type exists; **not stacked** in calculator |
| County admissions (Marion/Hendricks) | Not applicable geographically | DOR Tax Types | N/A |
| Innkeeper | Unlikely for non-lodging FEC rooms; confirm | SIB #41 / CIT materials | Not implemented |

If FAB later applies, **collection activation is blocked** until multi-tax calculation is implemented and tested.

---

## 7. Synthetic validation (no Generations activation)

Covered by `tests/unit/tax-calculator.test.ts` (incl. R2C.3 additions):

- Taxable equipment rental (shoes) + exempt activity  
- Taxable prepared food  
- Explicit exemption / zero rate  
- Mixed unresolved → no grand total  
- Percentage discount & BOGO bases  
- Fully taxable / unresolved / separately-stated opaque bundle  
- TAX_INCLUSIVE fail-closed  
- Missing jurisdiction / UTC timezone / missing rate / overlapping rates  
- Disabled tenant  

Multi-tax stacking: documented as future blocker; not implemented.
