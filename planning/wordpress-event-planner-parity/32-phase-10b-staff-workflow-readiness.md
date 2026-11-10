# Phase 10B — Staff workflow readiness and tenant configuration

**Date:** 2026-11-10  
**Branch:** `phase-10b-staff-workflow-readiness`  
**Org:** `mdutc2nkvpafezukeem8942v`  
**Depends on:** Phase 10A audit (PR #14)

## Constraints honored

- No Production pricing / deposit / hours / tax / booking / payment mutations in this phase  
- No Resend / live email / quote delivery / `tenant_live`  
- Scenario Lab untouched  
- No automatic merge of Phase 10B code  
- Proposed Production mutations require **explicit owner approval** before execution  

---

## 1. PR #14 review

| Check | Result |
| --- | --- |
| Files | Planning docs + read-only audit/inspect scripts only |
| Credentials in repo | None (uses runtime `DATABASE_URL`) |
| Sensitive content | Staff emails listed as operational roster (not secrets) |
| Writes | Scripts are read-only; refuse `MAGICCRM_DATABASE_ROLE=test` for audits |
| Merge | See final report / GitHub — merge when Preview settles; Production Ready after merge |

---

## 2. Permission sync dry-run

### Templates (code)

| Permission | Administrators | Event Sales | Front Desk | Operations |
| --- | :---: | :---: | :---: | :---: |
| `crm.quotes.approve` | yes | yes | no | no |
| `crm.quotes.price_override` | yes | no | no | no |

Server checks already match: approve path requires `crm.quotes.approve`; unit-price edits require `crm.quotes.price_override`.

### Production gap (from dry-run)

1. **Create** permission definitions (global catalog rows):  
   - `crm.quotes.approve`  
   - `crm.quotes.price_override`  
2. **Link** (Generations only, additive):  
   - Administrators → both keys  
   - Event Sales → `crm.quotes.approve` only  
3. **Do not** grant quote permissions to Front Desk or Operations.  
4. **Do not** run a broad permission reset.

### Exact proposed Production changes (owner approval required)

```text
A. INSERT permission_definitions for crm.quotes.approve + crm.quotes.price_override (if missing)
B. INSERT security_group_permissions for Generations Administrators → both keys
C. INSERT security_group_permissions for Generations Event Sales → crm.quotes.approve
```

**Apply path (gated, not executed in 10B):**  
`scripts/apply-quote-permission-sync.ts --org mdutc2nkvpafezukeem8942v --confirm APPLY`

**Dry-run:** `scripts/dry-run-quote-permission-sync.ts`

Note: full `npm run db:sync-auth` would also ensure default groups for **all** tenants (still additive). Prefer scoped apply for Generations first.

---

## 3. Branding implementation

### Code

- New optional column: `organizations.customerFacingName` (migration `20261110160000_organization_customer_facing_name`)
- Helper `customerFacingOrganizationName` prefers explicit `customerFacingName`, else existing slug humanization / real name
- Public inquire, thanks, plan views, quote email subject/body, acknowledgment path use the helper
- **No** global Generations hardcoding; other tenants remain null → unchanged behavior
- Internal `name` / `slug` unchanged for audit identity and routing

### Production activation (owner approval required; not applied)

```sql
UPDATE organizations
SET "customerFacingName" = 'Generations Adventureplex', "updatedAt" = NOW()
WHERE id = 'mdutc2nkvpafezukeem8942v'
  AND slug = 'generations-crm-test-1788129640704833684';
```

Prerequisites: deploy migration, then approved UPDATE.  
Dry-run: `scripts/dry-run-generations-display-name.ts`

Until activation, public UI continues to show **Generations CRM Test**.

---

## 4. Staff workflow walkthrough

| Step | Verification type | Result |
| --- | --- | --- |
| Open WP inquiry / private calc / draft / qty edit | Service integration tests | Covered by existing WP staff quote suites |
| Availability + inventory mapping | Service + Phase 8/9 tests | Mapped resources attach; no holds on draft |
| Event Sales approve | Service tests + **blocked in Production until perm sync** | Policy allows approve on baseline; delivery blocked |
| Unauthorized price override blocked | Service tests | AuthorizationError without price_override |
| Administrator price override | Service tests | Allowed with permission |
| Customer delivery blocked | Policy + tests | `approved_plugin_baseline` → `canDeliver: false` |
| Browser Production staff UI | **Not verified this phase** | Avoids Production inquiry/booking creates |

Distinction: synthetic/service tests ≠ Production UI walkthrough. After permission sync, schedule controlled staff UI verification on Production without creating live customer quotes.

---

## 5. Operating hours configuration requirements

Current Production: **no** `location_operating_hours_policies` row for Generations Main Location → evaluation `HOURS_UNCONFIGURED`. Confirm/hold paths require a staff hours exception until hours are configured and verified.

### Data needed from venue (do not invent)

For location `Main Location` (`America/Indiana/Indianapolis`):

1. Weekly open windows per day-of-week: `startMinute` / `endMinute` (local minutes; overnight allowed >1440)  
2. Whether policy should be marked `VERIFIED` (requires approval note / timestamp)  
3. Known closed dates / special hours → `location_operating_hours_exceptions`  
4. Confirmation that timezone remains `America/Indiana/Indianapolis`

### Schema pieces

- `LocationOperatingHoursPolicy` (`verificationStatus`: UNCONFIGURED | DRAFT | VERIFIED)  
- `LocationOperatingHoursWindow` (weekly intervals)  
- `LocationOperatingHoursException` (date overrides)  
- Staff one-time `OperatingHoursStaffException` for confirm/hold when unresolved  

**Do not bypass** hours policy. Admin UI improvements (if needed) are a follow-on; configuration itself is tenant data entry after owner supplies real hours.

---

## 6. Tax and payment findings

| Topic | Finding |
| --- | --- |
| Why tax tables empty | Tax engine foundation exists; Generations never activated calculation/collection or loaded rates |
| WP tax on quotes | WP engine can emit F&B tax as **quote lineItems** (cents in approved snapshot) |
| Booking totals | Amount guard copies approved `lineItems` / total; `booking.taxCents` stays **0** (diagnostic taxBreakdown only) |
| Double-tax risk | Low for MagiCRM amount-due (taxCents=0). Risk if later enabling MagiCRM tax **and** keeping WP tax lines without reconciliation |
| Omit-tax risk | If venue expects MagiCRM to collect tax separately from WP lines, current amount-due tax does not |
| External attestation | `attestExternalPayment` stamps booking; does not move money |
| Card collection | Requires payment processor integration (Phase 3C+); out of scope |

---

## 7. Owner decisions (recommended, not approved)

See `33-phase-10b-owner-decisions.md`.

---

## 8. Recommended next step after approvals

1. Merge Phase 10B PR (code + migration).  
2. Deploy migration to Production.  
3. Owner-approved scoped permission apply.  
4. Owner-approved `customerFacingName` UPDATE.  
5. Controlled staff UI walkthrough (still no customer delivery / live email).  
6. Collect real operating hours for configuration in a later gated change.
