# R2C.3 — Generations Product Tax Approval Register

**Organization:** `mdutc2nkvpafezukeem8942v` / `generations-crm-test-1788129640704833684`  
**Location:** `rysftywo62ve9sao10dk71si` (`main`)  
**Active products:** 51  
**Approved for tax activation:** **0**  
**Machine-readable detail:** `docs/tax/generations-tax-configuration-draft.json`

Status legend: `SOURCE_VERIFIED` · `BUSINESS_FACTS_REQUIRED` · `TAX_PROFESSIONAL_REVIEW_REQUIRED` · `APPROVED` · `UNRESOLVED`

**No product is `APPROVED`.** No taxability was inferred from category slug alone. Experience grants are listed as coverage facts only — not tax allocations.

---

## Summary counts

| Evidence status | Count (approx.) |
|---|---|
| TAX_PROFESSIONAL_REVIEW_REQUIRED | Attractions + food + room-like rentals |
| BUSINESS_FACTS_REQUIRED | All packages / field trips / youth lock-in |
| UNRESOLVED | Exclusive attraction-area rentals; arcade/card hybrids; incomplete grant packages |
| APPROVED | **0** |
| SOURCE_VERIFIED (framework only) | Indiana 7% rate; FAB absence; address — not product approvals |

---

## A. Attractions

| SKU | ID (short) | Billing | Package? | Food | Equip | Stored value | Room | Grants | Proposed class | Evidence | Business facts | CPA | Ready |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bowling-1h | t4i9… | PER_LANE_WEEKDAY_WEEKEND + shoes 350¢ | No | No* | Shoes yes | No | No | ACTIVITY:bowling | ADMISSION_ACTIVITY + TPP_RENTAL(shoes) | TAX_PROFESSIONAL_REVIEW_REQUIRED | Shoe $3.50 vs site $4; lane invoice label; tax-exclusive | Yes | No |
| axe-throwing-30 | vww5… | PER_PERSON | No | No | Incl.? | No | No | ACTIVITY:axe-throwing | ADMISSION_ACTIVITY | TAX_PROFESSIONAL_REVIEW_REQUIRED | Invoice label | Yes | No |
| axe-throwing-60 | ctjz… | PER_PERSON | No | No | Incl.? | No | No | ACTIVITY:axe-throwing | ADMISSION_ACTIVITY | TAX_PROFESSIONAL_REVIEW_REQUIRED | Invoice label; Thu BOGO N/A | Yes | No |
| unlimited-laser-tag-90 | q0jc… | PER_PERSON | No | No | ? | No | No | — | ADMISSION_ACTIVITY | TAX_PROFESSIONAL_REVIEW_REQUIRED | Invoice label | Yes | No |
| unlimited-arcade-1h | k5zs… | PER_PERSON | No | No | ? | ? | No | — | STORED_VALUE_OR_ADMISSION | UNRESOLVED | Card/credit legal form | Yes | No |
| laser-plex-card | kvsd… | PER_PERSON | No | No | ? | ? | No | — | STORED_VALUE_OR_ADMISSION | UNRESOLVED | Card economics | Yes | No |

\*Food not on bowling SKU; may appear on same proposal as separate FOOD lines.

---

## B. Food

All `FOOD` / `food` category SKUs (fajita-bar, slider-bar, pizza-pitcher-combo, smokehouse-bbq, breakfast-bar, wings, platters, salad, charcuterie, brownie/cookie trays):

| Field | Value |
|---|---|
| Proposed class | PREPARED_FOOD |
| Evidence | TAX_PROFESSIONAL_REVIEW_REQUIRED |
| Sources | SIB #7, #11, #29 (framework) |
| Business facts | Restaurant vs combination-business; utensils; alcohol in pitchers |
| CPA required | Yes |
| Activation ready | No |
| Includes food | Yes (product is food) |
| Bundle | N/A as standalone lines |

---

## C. Room / facility rentals

| SKUs | Proposed class | Evidence | Notes |
|---|---|---|---|
| skybox, lower-event-room, mezzanine-*, full-facility-*, *-additional-hour | ROOM_FACILITY | TAX_PROFESSIONAL_REVIEW_REQUIRED | SIB #41 banquet/gym/arena-like; confirm invoice |
| bowling-lounge-*, axe-den-2h, laser-tag-arena-*, climbers-cove-90 | ROOM_FACILITY_OR_AMUSEMENT_MIX | UNRESOLVED | Exclusive attraction areas — accommodation vs activity |

---

## D. Packages / field trips / youth

| SKU | Catalog hints (not tax facts) | Grants persisted | Food included? | Stored value? | Bundle treatment | Evidence |
|---|---|---|---|---|---|---|
| have-a-ball-bowling | Desc: bowling + arcade credits | bowling ACTIVITY only | Unknown | Unknown (credits) | UNRESOLVED | BUSINESS_FACTS_REQUIRED |
| have-a-ball-mini-golf | Desc: mini golf + arcade credits | none | Unknown | Unknown | UNRESOLVED | BUSINESS_FACTS_REQUIRED |
| have-a-blast | Desc: laser focus | none | Unknown | Unknown | UNRESOLVED | BUSINESS_FACTS_REQUIRED |
| have-it-all | Desc: bowling+laser+climb+arcade | none | Unknown | Unknown | UNRESOLVED | BUSINESS_FACTS_REQUIRED |
| all-access, axe-treme, laser-plex-package, play-axtion | Adult packages | none | Unknown | Unknown | UNRESOLVED | BUSINESS_FACTS_REQUIRED |
| field-trip-* | Youth per-person | none | Unknown | Unknown | UNRESOLVED | BUSINESS_FACTS_REQUIRED |
| youth-group-lock-in | Fixed package | none | Unknown | Unknown | UNRESOLVED | BUSINESS_FACTS_REQUIRED |

**Pizza & Pins:** not a persisted product slug — catalog/business mapping gap (not inventable).

**SIB #7 risk:** If any package sells food+entertainment for one nonitemized price, entire ticket may be taxable unless food is separately stated.

---

## E. Tax-inclusive / exclusive (cross-cutting)

| Signal | Finding |
|---|---|
| Site shoes “$4 + tax” | Suggests **exclusive** for shoes |
| Site lane prices without “+tax” | Ambiguous (exclusive without callout vs inclusive) |
| Catalog package amounts like 27599¢ | Looks exclusive cents, not proof |
| Engine | TAX_INCLUSIVE unsupported (fail-closed) |
| Register status | BUSINESS_FACTS_REQUIRED for pricing mode |

---

## F. Activation readiness rule

A product becomes activation-ready only when:

1. Evidence status → path to `APPROVED` with recorded CPA/management artifacts  
2. Pricing mode confirmed exclusive (or inclusive engine built)  
3. Bundle treatment resolved for packages  
4. Location timezone / taxTimeZone safe  
5. Org `calculationEnabled` / `collectionEnabled` explicitly approved  

**Current readiness for all 51 SKUs: false.**
