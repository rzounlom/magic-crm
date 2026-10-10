# R2C.1 — Tenant-Configurable Tax Architecture Proposal

**Phase:** R2C.1 (design only — no schema or code changes)  
**Constraint:** MagicCRM owns engines; organizations own configuration.  
**Scope:** Smallest maintainable design that fits the existing pricing pipeline and first-jurisdiction (Indiana / Mishawaka) facts.

---

## 1. Goals

1. Multi-organization, multi-location tax resolution.  
2. Effective-dated rates and classifications.  
3. Product-level tax classes (not merchandising category alone).  
4. Tax-exclusive and tax-inclusive display modes.  
5. Bundle allocation policies where legally required (separate from experience grants).  
6. Discount-adjusted taxable bases (seller-funded vs third-party funded).  
7. Immutable tax snapshots on proposals and bookings.  
8. Auditable calculation explanations.  
9. Path to POS / payments without rewriting the engine.  
10. No hardcoded Generations, Indiana, Mishawaka, or “7% everywhere”.

---

## 2. Pipeline placement

Insert tax **after** promotions and inclusion accounting, **before** deposit preview:

```
priceProduct (base quotes)
  → inclusion / coverage accounting
  → applyPromotions
  → applyTaxes          ← NEW engine step
  → depositPreview      ← policy: % of subtotal | subtotal+tax | taxable-only
  → proposal/booking snapshot
```

Rationale: Indiana seller-funded discounts reduce gross retail income (SIB #58). Tax must see post-promotion line amounts for taxable lines.

---

## 3. Separation of concerns

### Engine-owned (MagicCRM)

| Concern | Behavior |
|---|---|
| Jurisdiction resolution | From location address → jurisdiction set (state, county, locality codes) |
| Policy selection | Effective-dated rate schedules + product tax class maps |
| Taxable base | Per-line rules: exclusive amount, inclusive extraction, post-discount |
| Bundle allocation | Apply tenant-configured allocation method when required |
| Rounding | Integer cents; documented half-up/bankers policy; invoice-level vs line-level election |
| Aggregation | Line tax → tax totals by jurisdiction/authority |
| Snapshots | Persist rate IDs, class IDs, bases, tax cents, engine version |
| Validation | Reject negative tax; reject double application; tenant isolation |
| Audit trail | Machine-readable `taxBreakdown` explanation |

### Tenant-owned (organization / location)

| Concern | Configuration |
|---|---|
| Venue address | Street, city, county, state, postal code (per Location) |
| Jurisdiction mapping | Confirmed taxing authorities for that venue |
| Product tax class | Per product (and optional per price component, e.g. shoes) |
| Rate schedules | Verified effective-dated rates (state sales, FAB, etc.) |
| Pricing mode | Tax-exclusive vs tax-inclusive list prices |
| Bundle policies | Separately stated food; allocation tables when required |
| Exemptions | Allowed certificate types; default handling |
| Deposit tax policy | Whether deposit % applies pre-tax or post-tax; when tax is collected |
| Provider choice | Internal rules vs external calculator adapter |

---

## 4. Minimal typed configuration model (proposed)

Names are design proposals — **not** implemented in R2C.1.

### 4.1 Location address & jurisdiction

```
LocationAddress {
  line1, line2?, city, region (state), postalCode, country
  countyName? / countyCode?
  verifiedAt?, verifiedBy?
}

TaxJurisdictionBinding {
  locationId
  authority: STATE_SALES | COUNTY_FAB | MUNICIPAL_FAB | ACCOMMODATIONS | OTHER
  jurisdictionCode   // e.g. US-IN, US-IN-STJOSEPH
  effectiveFrom, effectiveTo?
}
```

### 4.2 Product tax classification

```
ProductTaxClass {
  organizationId
  code: AMUSEMENT_SERVICE | PREPARED_FOOD | TPP_RENTAL | ACCOMMODATION
        | STORED_VALUE | BUNDLE | NONTAXABLE | UNCLASSIFIED
  // UNCLASSIFIED → engine refuses to invent tax; surfaces needs-configuration
}

ProductTaxClassification {
  productId
  componentKey?     // e.g. "shoes" for multi-line products
  taxClassCode
  effectiveFrom, effectiveTo?
}
```

Merchandising `Product.kind` / category may **suggest** a default class in admin UX; never auto-activate without tenant confirmation.

### 4.3 Rate schedules

```
TaxRateSchedule {
  organizationId, locationId?
  authority
  jurisdictionCode
  rateBps           // 700 = 7.00%
  effectiveFrom, effectiveTo?
  sourceCitation    // URL / bulletin id — required for activation
  approvedBy?, approvedAt?
}
```

### 4.4 Bundle tax policy (separate from coverage grants)

```
BundleTaxPolicy {
  productId           // package SKU
  method: SEPARATELY_STATED_COMPONENTS | SINGLE_TICKET_SIB7_FOOD_RULE
          | ALLOCATED_COMPONENTS | PROVIDER_CALCULATED
  components?: { taxClassCode, amountCents | percentBps }[]
  foodSeparatelyStated: boolean
}
```

Experience grants remain fulfillment/coverage only.

### 4.5 Quote / booking tax snapshot

```
TaxBreakdown {
  engineVersion
  pricingMode: EXCLUSIVE | INCLUSIVE
  jurisdictions: { authority, jurisdictionCode, rateBps, rateScheduleId }[]
  lines: {
    lineKey, productId, componentKey?
    taxClassCode
    taxableBaseCents
    taxCents
    appliedPromotionIds[]
    notes?
  }[]
  taxTotalCents
  subtotalCents          // pre-tax commercial total
  totalCents             // subtotal + tax (exclusive mode)
}
```

Persist inside proposal payload and booking `payload` / money columns:

| Column | Meaning after tax activation |
|---|---|
| `subtotalCents` | Sum of post-promo line totals (pre-tax in exclusive mode) |
| `taxCents` | Sum of computed tax |
| `totalCents` | Amount due policy (typically subtotal + tax) |
| `depositRequiredCents` | Per deposit tax policy |

Historical bookings with `taxCents = 0` remain valid zero-tax snapshots unless explicitly revised under a controlled migration (not R2C.1).

---

## 5. Calculation rules (engine)

1. Resolve location → jurisdiction bindings as of event local civil date.  
2. For each priced line (post-promo):  
   - Resolve tax class (product + component).  
   - If `UNCLASSIFIED` and tax enabled → fail closed (needs configuration), do not guess.  
   - Compute taxable base (exclusive cents; or extract from inclusive).  
   - Apply authority rates that match class.  
3. Bundles: apply `BundleTaxPolicy` before/instead of naive whole-line class.  
4. Exemptions: certificate present → zero tax on covered lines; snapshot certificate id.  
5. Round per tenant/engine policy; reconcile `sum(line tax) == taxTotal`.  
6. Never apply the same rate twice to the same base.  
7. Never produce negative tax.

### Generations-oriented ordering (when activated)

1. Base product price  
2. Promotion adjustment (seller-funded → reduces base for taxable lines)  
3. Taxable base determination (class + bundle policy)  
4. Tax calculation (7% state sales where class taxable; FAB only if configured)  
5. Final amount due  

Authoritative for Indiana seller-funded discounts when the underlying sale is taxable (SIB #58). Bundle food rule per SIB #7 when single-ticket food+entertainment applies.

---

## 6. Internal rules vs external provider

| Criterion | A. Internal verified rules | B. External tax service | C. Hybrid (recommended) |
|---|---|---|---|
| Accuracy | High only if classifications + rates maintained | Strong for multi-jurisdiction rates | Best: service rates + tenant classes |
| Multi-jurisdiction | Manual | Strong | Strong when needed |
| Rate updates | Ops burden | Vendor | Vendor for rates |
| Product classification | Still required | Still required | Tenant-owned classes |
| Bundles | Custom policies | Often limited; need prep | Internal policy → service or local calc |
| Exemptions | Custom | Usually supported | Certificate workflow + service |
| Auditability | Full control | Depends on vendor docs | Snapshot both inputs & vendor response |
| Cost | Eng time | SaaS fees | Start low, add later |
| Complexity | Lower initially | Integration + failure modes | Adapter interface now |
| Failure handling | Deterministic | Network/vendor outages | Fail closed; no silent $0 tax if tax required |
| Tenant scaling | OK for few FECs | Better nationally | Fits roadmap |

### Recommendation (current stage)

**Hybrid, phased:**

1. **R2C.2 (future):** Ship internal engine + typed config for **one** verified jurisdiction (Indiana) with fail-closed `UNCLASSIFIED`. No universal 7%.  
2. Define a `TaxCalculator` port so Avalara/TaxJar/etc. can be added later without rewriting proposals.  
3. Do **not** subscribe or integrate a vendor in R2C.1.  
4. External service does **not** remove the need for accurate product/bundle classifications.

---

## 7. UI / customer display (future)

- Proposal cards: optional “Est. tax” + “Est. total” when tax config active and complete.  
- If classifications incomplete: show subtotal + “Tax to confirm” (mirrors pricingComplete pattern).  
- Bookings: show tax line when `taxCents > 0` (UI already supports this).  
- Do not imply tax was collected until payment phase exists.

---

## 8. Non-goals for first implementation slice

- Full multi-country VAT engine  
- Automatic scraping of DOR rates  
- Hardcoded Generations special cases  
- Using workbook 7% as default for all tenants  
- Repricing historical proposals  
- Treating experience grants as tax allocations  

---

## 9. Suggested R2C.2 readiness slice (not started)

1. Location address fields + jurisdiction bindings.  
2. `ProductTaxClassification` + rate schedules with approval metadata.  
3. `applyTaxes` after promotions; snapshot `taxBreakdown`.  
4. Wire `subtotalCents` / `taxCents` / `totalCents` correctly (stop forcing tax=0 when tax enabled).  
5. Generations: configure **only** classes/rates approved by management/accountant.  
6. Unit tests: discount base, shoe vs lane split, food line, accommodation line, fail-closed unclassified, snapshot immutability.  

**Stop:** R2C.1 does not implement the above.
