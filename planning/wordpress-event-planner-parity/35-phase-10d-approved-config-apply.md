# Phase 10D — Apply approved Generations Production configuration

**Date:** 2026-11-10  
**Org:** `mdutc2nkvpafezukeem8942v`  
**Slug:** `generations-crm-test-1788129640704833684`  
**Authorization:** Owner instruction in Phase 10D prompt (Option A, 25% deposit, branding, scoped permission sync)

## 1. Production preflight

| Check | Result |
| --- | --- |
| DB host | `ep-bold-art-avjy5nt4-pooler…` (MagiCRM customer Production) |
| `MAGICCRM_DATABASE_ROLE` | not `test` |
| Dual id+slug match | **1** |
| `customerFacingName` column | present |
| Deposit | **25%** |
| Pricing source | `approved_plugin_baseline` |
| Quote delivery | `canDeliver: false` |
| Email provider | unset/`none` (disabled) |
| Administrators group | `nynsi7e9ted3h424ljazpepv` |
| Event Sales group | `dbpld54b8ywdd7qs3vspri4f` |
| Quote defs before | none |
| Front Desk / Operations quote keys | none |

Preflight **ok** — writes proceeded.

## 2. Branding update

| | Before | After |
| --- | --- | --- |
| `customerFacingName` | `null` | `Generations Adventureplex` |
| `name` | `generations-crm-test-1788129640704833684` | unchanged |
| `slug` | `generations-crm-test-1788129640704833684` | unchanged |
| Resolved display | Generations CRM Test | **Generations Adventureplex** |
| Affected rows | — | **1** |
| Other orgs with Adventureplex name | 0 | 0 |

Tooling: `scripts/phase-10d-apply-approved-config.ts --apply-branding`

## 3. Permission sync

Gated apply:

```bash
npx tsx --tsconfig tsconfig.json scripts/apply-quote-permission-sync.ts \
  --org mdutc2nkvpafezukeem8942v --confirm APPLY
```

| Change | Result |
| --- | --- |
| Create `crm.quotes.approve` | created (`hwsiif7dtxtf4gmv6ard8ucf`) |
| Create `crm.quotes.price_override` | created (`nos3hqs6fhgrgax0wxyauqbv`) |
| Administrators links | approve + price_override |
| Event Sales links | approve only |
| Front Desk / Operations | no quote links |
| Other-tenant quote links | **0** |
| Idempotent re-run / dry-run | `toCreate: []`, `linksToCreate: []` |

## 4. Independent read-back

Confirmed: branding, both defs active, Admin approve+override, Event Sales approve only, Front Desk/Ops groups neither, deposit 25, baseline pricing, salad catalog 1999¢, lower extra 5000¢, WP baseline salad 2499¢ / lower_extra 7500¢, `finalLivePriceRevalidation: pending`, delivery blocked, booking count unchanged at 7, no deposit-paid bookings.

## 5. Customer-facing branding

Production alias pages:

- `/inquire/generations-crm-test-1788129640704833684` → **200**, shows **Generations Adventureplex**
- `/thanks` → **200**, shows **Generations Adventureplex**

No inquiry submitted. No customer email sent.

## 6. Staff permission verification

Server `hasPermission` against live memberships:

| Role sample | approve | price_override |
| --- | --- | --- |
| Administrator (`rzounlom@gmail.com`) | true | true |
| Event Sales (`tcruthi1@gmail.com`) | true | false |
| Front Desk (`firstshiftllc@gmail.com`) | false | false |
| Operations group links | none | none |

Note: Operations sample user `tcruthi1@gmail.com` is also in Event Sales, so **user-level** approve is true via Event Sales membership. Operations **group** has no quote permission links.

Authenticated Production staff UI walkthrough not performed (avoids creating/approving live quotes). Service authorization paths already covered by unit tests.

## 7. Unchanged / still disabled

- Pricing source not promoted to `tenant_live`
- Catalog / WP cents / deposit percent unchanged
- Live email not enabled
- Customer quote delivery blocked
- No card payments
- No tax / hours / inventory / booking / payment mutations beyond the approved branding + permission links
- Scenario Lab untouched

## 8. Remaining operational blockers

1. Operating hours still unconfigured (`HOURS_UNCONFIGURED`)
2. Tax tables empty / `booking.taxCents` = 0
3. Final live price revalidation still pending
4. Customer quote delivery / Resend / card collection still require separate owner approval
5. Controlled Production staff UI verification after this apply (read-only preferred)

## Scripts added (docs/ops)

- `scripts/phase-10d-apply-approved-config.ts`
- `scripts/phase-10d-staff-permission-verify-readonly.ts`
- `scripts/phase-10c-preflight-readonly.ts` (from 10C)
