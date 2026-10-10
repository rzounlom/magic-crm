# R2C.1 — Open Decisions & Approval Gates

**Purpose:** Questions that block correct tax calculation for Generations / MagicCRM.  
**Rule:** Do not ask management to interpret statutes when official guidance already answers; do require professional confirmation before activation.

---

## 1. Blocking questions for Generations management

| # | Question | Why it blocks | Who |
|---|---|---|---|
| M1 | Confirm legal business / venue address(es) for tax registration (AdventurePlex 1018 W Edison; any Raceway / mobile axe nexus). | Jurisdiction binding | Management |
| M2 | Are website/catalog list prices **tax-exclusive** or **tax-inclusive**? | Display + base extraction | Management |
| M3 | Exact contents and separately stated prices for birthday/adult packages (esp. food vs activities vs space). | SIB #7 single-ticket rule; SIB #94 bundles | Management |
| M4 | Are private rooms / mezzanine / full-facility sold as space rentals with their own invoices? | Accommodation classification (SIB #41) | Management |
| M5 | What is an arcade playcard legally (stored value, admission, game credits)? Gift cards sold? | Stored-value timing | Management |
| M6 | Deposit terms: refundable? applied how on final invoice? collected before event? | Deposit tax timing | Management |
| M7 | Existing accountant / prior sales-tax treatment for lanes, shoes, food, rooms? | Ground truth vs redesign | Management + accountant |
| M8 | Alcohol service: pitchers / beer wall licensing and tax treatment. | Food vs alcohol rules | Management + counsel |
| M9 | Exempt customers (schools, nonprofits): which certificates accepted today? | Exemption workflow | Management |
| M10 | Single taxable location or multiple (Raceway, mobile axe)? | Multi-location rates | Management |

---

## 2. Decisions requiring a tax professional before activation

| # | Decision | Official guidance already says… | Still needs pro confirmation because… |
|---|---|---|---|
| P1 | Taxability of bowling **lane** fees vs shoe rentals | Services generally nontaxable (SIB #94); TPP rentals taxable (SIB #42); site says shoes “+tax” | FEC-specific characterization |
| P2 | Taxability of axe / laser / climb / mini-golf admissions | Same services framework | No FEC-specific bulletin accessed |
| P3 | Package single-ticket vs separately stated food | SIB #7: whole ticket taxable if food not separate | Actual invoice presentation unknown |
| P4 | Exclusive area rentals (Axe Den, Laser Arena, Bowling Lounge) | SIB #41 lists banquet/gym/arena-like spaces | Whether each SKU is “accommodation” |
| P5 | Event deposit tax timing | SIB #78 is layaway-of-TPP, not event deposits | Different fact pattern |
| P6 | BOGO free-unit presentation | Seller-funded discounts reduce base (SIB #58) | Interaction with free merchandise (SIB #40) |
| P7 | Soft drinks / alcohol in pitchers | Prepared beverages generally taxable | ATC / mixed drink facts |
| P8 | Whether any local tax besides state sales applies | FAB table: St. Joseph/Mishawaka not listed (2026-10-10) | Re-verify at activation; innkeeper if any lodging facts |
| P9 | Rounding and invoice presentation required by IN | SSUTA / SIB #33 rounding notes | POS + proposal consistency |
| P10 | Historical quotes with taxCents=0 | N/A (system stub) | Whether to leave historical as-is forever |

---

## 3. MagicCRM product decisions (engineering / product)

| # | Decision | Recommendation |
|---|---|---|
| E1 | Fail closed on `UNCLASSIFIED` products when tax enabled | Yes |
| E2 | Deposit % base (pre-tax vs total-with-tax) | Tenant policy; default pre-tax until confirmed |
| E3 | Internal vs hybrid tax calculator | Hybrid port; internal first for IN |
| E4 | Persist tax breakdown on proposals | Required before any collection |
| E5 | Fix Location timezone UTC vs org America/Indiana/Indianapolis | Separate bugfix; not tax activation |
| E6 | Add Location address fields | Prerequisite for jurisdiction resolution |
| E7 | Never default all tenants to 7% | Hard rule |

---

## 4. Approval gate checklist (before R2C.2 activation for Generations)

- [ ] M1 addresses confirmed in writing  
- [ ] M2 tax-inclusive vs exclusive confirmed  
- [ ] Accountant sign-off on P1–P4 classes for go-live SKUs  
- [ ] Package food separately stated **or** SIB #7 whole-ticket treatment accepted (M3/P3)  
- [ ] FAB re-checked on DOR table on activation date  
- [ ] Rate schedule records cite official sources + approver  
- [ ] Deposit tax policy documented (M6/P5)  
- [ ] Historical snapshot policy agreed (P10)  
- [ ] No workbook-only rates in production config  

---

## 5. Explicitly closed by research (no management statute quiz)

| Topic | Closed finding |
|---|---|
| Indiana statewide sales tax **rate** | 7% (DOR Tax Types) |
| Workbook “apply 7% to everything” | **Not authorized** |
| St. Joseph / Mishawaka on FAB adopting list (as of 2026-10-10) | **Not listed** |
| Marion/Hendricks county admissions taxes | **Not** applicable to this venue’s county |
| MagicCRM current collection | None (`taxCents = 0`) |

---

## 6. Source-request checklist (if further research needed)

1. Accountant memo or prior ST-103 treatment for Generations.  
2. Sample customer invoices (bowling+shoes, package+food, room rental).  
3. Retail merchant registration details / locations on file with DOR.  
4. Any private DOR ruling or CPA workpapers.  
5. Package price sheets with component breakdowns.  
6. Deposit / cancellation contract language.  
7. Arcade card terms of use.  

---

## 7. Related documents

- `R2C1_TAX_APPLICABILITY_RESEARCH.md`  
- `R2C1_PRODUCT_TAX_MATRIX.md`  
- `R2C1_TAX_ARCHITECTURE_PROPOSAL.md`  
