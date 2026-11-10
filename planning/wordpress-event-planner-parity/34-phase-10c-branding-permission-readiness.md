# Phase 10C — Branding deployment and scoped permission readiness

**Date:** 2026-11-10  
**Org:** `mdutc2nkvpafezukeem8942v`  
**PR:** [#15](https://github.com/rzounlom/magic-crm/pull/15) **MERGED**  
**Merge commit:** `5ee0c146a81e2ff126ee1930ae8e70c5294ad1fd`

## 1. PR #15 merge status

| Item | Result |
| --- | --- |
| Review | Nullable `customerFacingName`; helper prefers explicit name; inquire/thanks/plan + services use helper; no org slug/id rename; backward compatible; no auto-rename of Production rows |
| Merge | Merged via GitHub (`--merge`) |
| Preview | Prior Preview FAILURE treated as non-blocking (Production gate) |
| Commit | `5ee0c14` on `main` |

## 2. Production deployment and migration

| Item | Result |
| --- | --- |
| Production deploy | Deployment `7695019958` — **success / Ready** (`Production – magic-crm`) |
| Alias smoke | `https://magic-crm-eta.vercel.app/inquire/…` and `/thanks` → **HTTP 200** |
| Display before branding UPDATE | Still **Generations CRM Test** (humanized slug; `customerFacingName` null) |
| Migration | `20261110160000_organization_customer_facing_name` **applied** via `prisma migrate deploy` on MagiCRM customer DB |
| Schema | `organizations.customerFacingName` present, nullable; Generations value remains `null` |
| Scenario Lab | Not touched |

## 3. Permission sync preflight (read-only; apply **not** run)

Expected scoped changes confirmed:

1. Create `crm.quotes.approve`
2. Create `crm.quotes.price_override`
3. Assign both to Generations Administrators
4. Assign `crm.quotes.approve` to Generations Event Sales

Safety:

- Front Desk / Operations: **no** quote approve or price override change
- DB defs: 40 present / catalog 42; missing **only** the two quote keys; **no** stale-outside-catalog keys
- Apply script: gated `--org` + `--confirm APPLY`; group links org-scoped + `skipDuplicates`; idempotent re-run
- `syncPermissionDefinitions` is global for **definitions only** (would not deactivate anything today; only creates the two missing keys)
- Unrelated tenants: **no** group-permission writes outside `--org`

Apply command (owner-gated; **not executed**):

```bash
npx tsx --tsconfig tsconfig.json scripts/apply-quote-permission-sync.ts \
  --org mdutc2nkvpafezukeem8942v --confirm APPLY
```

## 4. Branding update preflight (not executed)

| Check | Result |
| --- | --- |
| Org record | id `mdutc2nkvpafezukeem8942v`, slug `generations-crm-test-1788129640704833684` |
| Current `customerFacingName` | `null` |
| Resolved display today | Generations CRM Test |
| Proposed | `customerFacingName = 'Generations Adventureplex'` |
| Rows matching `id` + `slug` | **exactly 1** |
| name / slug change | none |

Prepared SQL (owner-gated; **not executed**):

```sql
UPDATE organizations
SET "customerFacingName" = 'Generations Adventureplex', "updatedAt" = NOW()
WHERE id = 'mdutc2nkvpafezukeem8942v'
  AND slug = 'generations-crm-test-1788129640704833684';
```

## 5. Pricing and deposit (read-only)

| Setting | Production value |
| --- | --- |
| Pricing source | `approved_plugin_baseline` |
| WP quote cents | Authoritative for WP-derived quotes |
| Catalog | Unchanged (salad 1999¢; lower-event-room base 15000¢ / addl 5000¢; known WP deltas remain) |
| Deposit | `depositPercent = 25` |
| Customer quote delivery | **blocked** (`canDeliver: false`) |
| Live email | Provider `none` / disabled (local audit env; do not enable Resend) |
| Card payments | Not enabled |

Owner decision record remains Option A + keep 25% deposit — **not formally approved** until owner checkboxes in `33-phase-10b-owner-decisions.md`.

## 6. Operating-hours information needed from owner

Main Location (`rysftywo62ve9sao10dk71si`, timezone `America/Indiana/Indianapolis`) has **no** `location_operating_hours_policies` row → `HOURS_UNCONFIGURED`.

There is **no** `/app/admin` weekly-hours editor today (staff one-time exception UI only). Provide real venue data before any policy insert:

1. For each weekday (Sun–Sat): open / closed; if open, local open and close times (minutes from midnight; overnight >1440 allowed)
2. Confirm timezone stays `America/Indiana/Indianapolis`
3. Holiday / special closed dates for the next 12 months (`CLOSED` exceptions)
4. Special open intervals that differ from weekly windows (`CUSTOM` exceptions)
5. Whether private events may run outside standard hours (and who may authorize staff exceptions)
6. Whether the policy may be marked `VERIFIED` (approval note + approver identity) or should stay `DRAFT` first

**Do not invent hours.** Do not copy QA/synthetic VERIFIED hours onto this tenant.

## 7. Test results

| Suite | Result |
| --- | --- |
| Branding unit (`organization-display-name`) | Pass |
| Authorization / quote delivery unit | Pass |
| Hours-exception unit | Pass |
| Integration: tenant-isolation, WP staff quote, public inquiry/thanks | Pass (12) |
| Typecheck | Pass |
| Lint | Pass (0 errors; 4 pre-existing warnings in unrelated scripts) |
| Production build | Pass |

## 8. Owner approvals required before next phase

1. Approve `customerFacingName = 'Generations Adventureplex'` UPDATE (or supply alternate public name)
2. Approve scoped quote permission APPLY for Generations only
3. Confirm Option A pricing authority (WP cents for WP quotes; catalog unchanged; no `tenant_live`)
4. Confirm deposit remains 25%
5. Supply real Main Location weekly hours + holidays/exceptions answers (section 6)
6. Explicit later approvals still required for: Resend/live email, customer quote delivery / `tenant_live`, tax activation, card payments

## Still disabled / unchanged

- Live email / Resend  
- Customer quote delivery  
- `tenant_live` pricing  
- Card payment collection  
- Production permission links / branding value / deposit / tax / hours / inventory / bookings / payments mutations beyond the nullable migration column  
