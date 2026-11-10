# Phase 10A — Generations operational readiness audit

**Date:** 2026-11-10  
**Branch:** `phase-10a-generations-operational-readiness`  
**Org:** `mdutc2nkvpafezukeem8942v`  
**Audit host:** `ep-bold-art-avjy5nt4-pooler…` (authorized MagiCRM customer DB; **read-only**, no writes)  
**Scripts:**  
- `scripts/audit-generations-operational-readiness-readonly.ts`  
- `scripts/inspect-generations-permissions-readonly.ts`  

**Constraints honored:** no Production mutations; no Resend / live email; no customer quote delivery; no `tenant_live` promotion; Scenario Lab untouched; no Preview deploy; no auto-merge.

---

## 1. Actual Generations tenant configuration

| Field | Production value |
| --- | --- |
| Organization ID | `mdutc2nkvpafezukeem8942v` |
| Stored name | `generations-crm-test-1788129640704833684` (slug-shaped) |
| Customer-facing display helper | **Generations CRM Test** (`customerFacingOrganizationName`) |
| Slug | `generations-crm-test-1788129640704833684` |
| Onboarding | `ACTIVE` |
| Timezone (org + Main Location) | `America/Indiana/Indianapolis` |
| Currency | `USD` |
| Deposit percent | **25** |
| Location | Main Location (`main`), active |
| Catalog products | 51 active |
| Resource types | 9 configured (bowling 8, axe 7, laser/golf/climbing/rooms/facility) |
| Arcade resource type | **Absent** (pricing-only / no hold) |
| Operating hours policy | **None** (`verificationStatus` would be unconfigured → confirms need staff hours exception) |
| Pricing registry | Org listed for `approved_plugin_baseline` |
| Catalog version / rules | `2026-11-02` |
| Pricing revision | `889a29ae88d4:approved_plugin_baseline` |
| Custom WP packages | **0** |
| `finalLivePriceRevalidation` | **`pending`** |
| Customer quote delivery | **Blocked** (`canDeliver: false`) |

### Staff roster (actual members)

| Group | Members |
| --- | --- |
| Administrators (2) | `rzounlom@gmail.com`, `theresac@generations-adventureplex.com` |
| Event Sales (1) | `tcruthi1@gmail.com` |
| Front Desk (2) | present |
| Operations (1) | present |
| Accounting / Managers (0) | empty |

### Critical permission gap (Production)

Permission definitions **`crm.quotes.approve`** and **`crm.quotes.price_override`** are **missing** from Production `permission_definitions` (40 defs present; code catalog expects 42).

| Group | Expected vs actual | Quote approve | Price override |
| --- | --- | --- | --- |
| Administrators | 42 expected / 40 assigned | **missing** | **missing** |
| Event Sales | 15 expected / 14 assigned | **missing** | n/a (not in Event Sales template) |

**Impact:** No Generations employee can legally call `approveAndSendWpStaffQuote` or Administrator unit-price override until `npm run db:sync-auth` (or equivalent `syncPermissionDefinitions` + `ensureDefaultSecurityGroups`) is run against Production under a controlled change window. This phase did **not** run that sync.

---

## 2. Deposit and tax findings

### Deposit

| Topic | Finding |
| --- | --- |
| Configured where | `organizations.depositPercent` |
| Generations value | **25%** (matches booking-catalog seed; not Phase 9C fixture’s 50%) |
| Scope | Organization-wide — **not** event-type specific |
| Formula | `Math.trunc((totalCents * percent + 50) / 100)` (`percentOfCents`) |
| Example (9C total 33848¢) | Deposit **8462¢** at 25% (9C used 50% → 16924¢ for proof only) |
| Staff override | **None** — required deposit recomputed from tenant percent on pending/confirm |
| Partial payments | Ledger field `booking.depositPaidCents` only; no Stripe `Payment` model yet |
| Confirm requires deposit paid? | **No** — confirm can proceed with optional `attestExternalPayment` stamp |
| WP vs MagiCRM | WP Event Planner does **not** define MagiCRM deposit % |

### Tax

| Topic | Finding |
| --- | --- |
| `organization_tax_settings` | **null** (no row) |
| Location tax profiles | **0** |
| Active tax rate schedules | **0** |
| Product tax classifications | **0** |
| Amount-due tax on bookings | `booking.taxCents` remains **0** (R2C.2); WP F&B tax may appear only as quote `lineItems` |

---

## 3. Staff workflow readiness

| Step | Classification | Notes |
| --- | ---: | --- |
| 1. Receive inquiry | Implemented and tested | Public WP intake → thank-you; Phase 9A ack exists but email SKIPPED |
| 2. Review private WP calculation | Implemented; Production UI not re-verified this phase | Staff panel shows `approved_plugin_baseline` labels |
| 3. Create quote draft | Implemented and tested | No holds |
| 4. Adjust qty/schedule | Implemented and tested | Event Sales qty OK; unit price needs `crm.quotes.price_override` (**missing in Prod**) |
| 5. Approve quote | **Blocked by configuration** | Needs `crm.quotes.approve` sync; baseline allows approve in policy, delivery still blocked |
| 6. Check availability | Implemented; hours unconfigured | Resource mapping ready; operating hours policy empty → confirm needs hours exception |
| 7. Deliver quote | **Blocked by policy** | `approved_plugin_baseline` → `canDeliver: false` until verified `tenant_live` |
| 8. Customer accepts | Implemented and tested (synthetic) | Pending booking path; public delivery gated so production customer accept rare |
| 9. Confirm booking | Implemented and tested (synthetic); hours config gap | Inventory mapped; no arcade; hours exception required today |
| 10. Collect deposit / balance | **Requires additional development** + config | External attestation only; no live card collection; `depositPaidCents` manual/ledger |

Phase 9C synthetic E2E proves money integrity through booking/payment accounting. It does **not** prove Production UI walkthrough or that Generations staff currently have approve permissions.

---

## 4. Customer-facing branding findings

| Surface | What customers see today | Source |
| --- | --- | --- |
| Public inquire form | **Generations CRM Test** | `organization.name` passed through `customerFacingOrganizationName` (slug → title case) |
| Thanks page | **Generations CRM Test** | Same helper |
| Inquiry acknowledgment copy | Same helper | Email still SKIPPED when provider=`none` |
| Quote email subject (when delivered) | Raw `inquiry.organization.name` | **Does not** use display helper — would expose slug-shaped name if delivery enabled |

**Not shown:** “Generations Adventureplex” as a configured business name.  
**Needed for professional go-live:** owner-set organization display name (e.g. rename org `name` to `Generations Adventureplex`, or add a dedicated display-name field later). **Do not auto-rename in this phase.**

---

## 5. Pricing authority assessment (Option A)

### Proposed operational policy (Option A)

1. WP Event Planner **3.3.0** approved plugin baseline is authoritative for WP-derived event quotes.  
2. Employee-approved quote `lineItems` / totals are authoritative for bookings and payment amounts.  
3. MagiCRM catalog stays unchanged (salad **1999¢**, lower extra **5000¢** confirmed in Production).  
4. Known WP deltas (salad **2499¢**, lower_extra **7500¢**) remain visible to staff via classification / discrepancy docs.  
5. Unit-price overrides require Administrator `crm.quotes.price_override`.

### Consistency with code

| Mechanism | Status |
| --- | --- |
| Org registry → `approved_plugin_baseline` | Consistent |
| Delivery gate until `tenant_live` | Consistent (`canDeliver: false`) |
| `assertApprovedQuoteAmountsConsistent` for WP drafts + approved quotes | Consistent (Phase 9B/9C) |
| Catalog not silently reapplied on booking | Consistent |
| Owner Option A checkbox | **Not formally approved** — still unchecked in `30-phase-9c-owner-pricing-decision.md` |
| `finalLivePriceRevalidation` | Still **`pending`** |

Option A is **recommended and code-aligned**, but **not** marked owner-approved in this audit.

---

## 6. Operational activation checklist

### A. Safe to use now (with current gates)

- [x] Public WP inquiry + thank-you (no reservation claim)
- [x] Private WP calculation on approved plugin baseline
- [x] Staff draft creation / qty edits (once staff can open inquiry)
- [x] Inventory resource types for bowling/axe/laser/golf/climbing + exclusive rooms
- [x] Money authority guards for WP quotes (code)
- [x] Live email disabled; customer quote delivery disabled

### B. Requires owner decision

- [ ] Accept **Option A** pricing authority (WP transaction cents; catalog unchanged)
- [ ] Confirm **25% deposit** is the intended Generations policy (vs historical WP messaging)
- [ ] Choose customer-facing business name (**Generations Adventureplex** vs keep CRM Test)
- [ ] Decide whether final live WP export/`tenant_live` is required before first customer quote email
- [ ] Accept external payment attestation workflow until card collection ships

### C. Requires tenant configuration (controlled Production change — not done here)

- [ ] Sync permission catalog + default groups (`crm.quotes.approve`, `crm.quotes.price_override`)
- [ ] Rename / set professional organization display name
- [ ] Configure and verify location operating hours
- [ ] Confirm Event Sales / Admin roster for go-live coverage
- [ ] Configure Resend / `EMAIL_PROVIDER=resend` only after owner approval
- [ ] Optional: tax settings if MagiCRM amount-due tax must match WP F&B tax lines

### D. Requires additional development

- [ ] Stripe / payment-request collection path (today: attest + `depositPaidCents`)
- [ ] Deposit override UI (if venue needs case-by-case deposit %)
- [ ] Quote-email subject/body should use customer-facing display name helper
- [ ] Arcade inventory strategy if arcade holds become required
- [ ] Optional catalog alignment (Option B) after separate review

### E. Requires controlled live testing

- [ ] Staff walkthrough on Production UI after permission sync
- [ ] One controlled customer quote delivery after `tenant_live` / verification policy met
- [ ] One controlled pending → confirm with real hours + inventory
- [ ] Deposit/balance accounting with real external payment attestation
- [ ] Email delivery end-to-end (ack + quote) with Resend

---

## 7. Remaining blockers ranked by importance

1. **Production missing quote permissions** — blocks approve/send and admin price override entirely.  
2. **Customer quote delivery policy** — baseline cannot deliver until verified `tenant_live` / operational price verification.  
3. **Owner Option A + deposit % + display name** — business decisions still open.  
4. **Live email disabled** — ack/quote emails SKIPPED.  
5. **Operating hours unconfigured** — every confirm needs staff hours exception.  
6. **No card payment collection** — attestation-only payment readiness.  
7. **Tax subsystem inactive** — WP tax lines ≠ MagiCRM amount-due tax.  
8. **Arcade unmapped** — acceptable if treated as non-hold; document for staff.  
9. **Axe unit count 7 vs prior audit 8** — verify inventory accuracy before exclusive axe events.

---

## 8. Recommended next implementation step

**Phase 10B (suggested): Controlled Production auth sync + staff UI walkthrough**

1. Owner accepts Option A + deposit 25% + display name decision.  
2. Run `db:sync-auth` against Production in a documented change window (permissions only — no pricing/inventory/booking writes beyond permission tables).  
3. Visually verify Event Sales can approve (delivery still blocked) and Admin can override prices.  
4. Configure operating hours for Main Location.  
5. Only then plan email + `tenant_live` / quote-delivery activation as a separate gated phase.

---

## 9. Tests / verification this phase

| Check | Result |
| --- | --- |
| Read-only operational audit script | Ran against Production host |
| Permission gap inspection | Confirmed missing quote perms |
| Public inquire / thanks branding | Live page shows **Generations CRM Test** |
| Production writes | **None** |
| Live email / quote delivery / `tenant_live` | **Unchanged / disabled** |

Code changes this phase: audit scripts + this planning document only.
