# Phase 10B — Owner decision record

**Date:** 2026-11-10  
**Org:** `mdutc2nkvpafezukeem8942v`  
**Status:** Recommended — **not formally approved** until checkboxes are confirmed by owner.

## Decisions

### 1. Pricing authority — Option A (recommended)

- WP Event Planner 3.3.0 approved pricing is authoritative for WP-derived event quotes.  
- Employee-approved quote amounts are authoritative for bookings/payments.  
- MagiCRM catalog remains unchanged (salad 1999¢ / lower_extra 5000¢).  
- Known WP deltas stay visible to staff.  
- Unit-price overrides require Administrator `crm.quotes.price_override`.

- [ ] Owner accepts Option A  
- [ ] Owner declines / chooses Option B catalog alignment later  

**Do not** change pricing source to `tenant_live` in this phase.

### 2. Deposit policy — 25% (recommended keep)

- Current Production `organizations.depositPercent` = **25**.  
- Applies organization-wide; MagiCRM computes `depositRequiredCents` with banker's-style trunc percent helper.  
- No staff deposit override API today.

- [ ] Owner confirms 25% is correct for Generations events  
- [ ] Owner requests a different percent (separate change window)  

### 3. Customer-facing name — Generations Adventureplex (recommended)

- Keep internal `name` / `slug` as CRM Test identity.  
- Set `customerFacingName = 'Generations Adventureplex'` after migration deploy.  
- Public inquire / thanks / future quote emails use the same display helper.

- [ ] Owner approves setting `customerFacingName` to Generations Adventureplex  
- [ ] Owner prefers a different public name: _______________  

### 4. Production permission sync (required for internal quote approval)

Exact changes: create two permission definitions; link approve (+ override for Admins) on Generations only.

- [ ] Owner approves scoped apply via `apply-quote-permission-sync.ts --confirm APPLY`  
- [ ] Owner prefers full `db:sync-auth` for all tenants instead  

### 5. Still deferred (explicit non-goals)

- [ ] Live email / Resend  
- [ ] Customer quote delivery / `tenant_live`  
- [ ] Operating hours data entry (needs real venue hours)  
- [ ] Tax activation  
- [ ] Card payment collection  
