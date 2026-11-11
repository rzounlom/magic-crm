# Phase 10B — Owner decision record

**Date:** 2026-11-10  
**Org:** `mdutc2nkvpafezukeem8942v`  
**Status:** **APPROVED** by owner (Phase 10D instruction, 2026-11-10). Applied in Phase 10D.

## Decisions

### 1. Pricing authority — Option A — APPROVED

- WP Event Planner 3.3.0 approved pricing is authoritative for WP-derived event quotes.  
- Employee-approved quote amounts are authoritative for bookings/payments.  
- MagiCRM catalog remains unchanged (salad 1999¢ / lower_extra 5000¢).  
- Known WP deltas stay visible to staff.  
- Unit-price overrides require Administrator `crm.quotes.price_override`.

- [x] Owner accepts Option A  
- [ ] Owner declines / chooses Option B catalog alignment later  

**Do not** change pricing source to `tenant_live` from this approval.

### 2. Deposit policy — 25% — APPROVED

- Current Production `organizations.depositPercent` = **25** (retained; not modified in Phase 10D).  
- Applies organization-wide; MagiCRM computes `depositRequiredCents` with banker's-style trunc percent helper.  
- No staff deposit override API today.

- [x] Owner confirms 25% is correct for Generations events  
- [ ] Owner requests a different percent (separate change window)  

### 3. Customer-facing name — Generations Adventureplex — APPROVED

- Migration `20261110160000_organization_customer_facing_name` deployed in Phase 10C.  
- Phase 10D set `customerFacingName = 'Generations Adventureplex'` (1 row).  
- Internal `name` / `slug` unchanged.  
- Public inquire / thanks use the display helper.

- [x] Owner approves setting `customerFacingName` to Generations Adventureplex  
- [ ] Owner prefers a different public name: _______________  

### 4. Production permission sync — APPROVED

Exact changes applied in Phase 10D via `apply-quote-permission-sync.ts --confirm APPLY`:

- Created `crm.quotes.approve` and `crm.quotes.price_override`
- Linked both to Generations Administrators
- Linked approve only to Generations Event Sales

- [x] Owner approves scoped apply via `apply-quote-permission-sync.ts --confirm APPLY`  
- [ ] Owner prefers full `db:sync-auth` for all tenants instead  

### 5. Still deferred (explicit non-goals)

- [ ] Live email / Resend  
- [ ] Customer quote delivery / `tenant_live`  
- [ ] Operating hours data entry (needs real venue hours)  
- [ ] Tax activation  
- [ ] Card payment collection  
