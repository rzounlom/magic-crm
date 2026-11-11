# Phase 10F — Operating hours deployment and owner input template

**Date:** 2026-11-11  
**PR #17:** MERGED `5409ba5d6385a3f1aaebb1b4e3bd68bcbd0188ff`  
**Production:** Ready (deployment `7714716928`)  
**Admin route deployed:** `/app/admin/operating-hours` (auth-gated; unauthenticated → `/sign-in`)

## Authenticated browser verification

**Blocked — not substituted with service tests.**

| Requirement | Result |
| --- | --- |
| Clerk TEST publishable key | Present (`pk_test_`) |
| `playwright/.auth/staff.json` | Present; `r3-verify-staff-auth` cookie-structure check passed |
| Live browser session | **Expired** — Playwright walkthrough redirected to `/sign-in` |
| Headed re-bootstrap | Requires human Clerk TEST sign-in (`npm run test:e2e:staff:auth`) |

Resume after re-bootstrap:

```bash
npm run test:e2e:staff:auth
node scripts/phase-10f-browser-hours-walkthrough.mjs
```

Use synthetic org `magiccrm-test-center-b` only. Do not configure Generations Production hours in that walkthrough.

Staff quote UI browser steps (9–15) likewise require a fresh TEST session (and Event Sales storage state for denial checks). Service/integration coverage from Phase 10E remains green but is **not** counted as browser verification here.

## Production read-only state (unchanged)

| Item | Value |
| --- | --- |
| `customerFacingName` | Generations Adventureplex |
| Quote perms | Admin approve+override; Event Sales approve; Front Desk/Ops groups neither |
| Pricing source | `approved_plugin_baseline` |
| Deposit | 25% |
| Final live revalidation | pending |
| Customer quote delivery | blocked |
| Live email | disabled |
| Generations Main Location hours policy | **none / unconfigured** |

Public inquire page still shows **Generations Adventureplex**.

## Owner operating-hours input template

Organization: Generations (`mdutc2nkvpafezukeem8942v`)  
Location: Main Location (`rysftywo62ve9sao10dk71si`)  
Timezone: `America/Indiana/Indianapolis` (confirm or correct)

### Weekly schedule (venue-local)

| Day | Closed? | Window 1 open–close | Window 2 (optional) | Notes |
| --- | --- | --- | --- | --- |
| Sunday | | | | |
| Monday | | | | |
| Tuesday | | | | |
| Wednesday | | | | |
| Thursday | | | | |
| Friday | | | | |
| Saturday | | | | |

Overnight closes: write past 24:00 if needed (e.g. Fri 10:00–26:00 = Sat 02:00).

### Holidays / special dates (next 12 months)

| Date (YYYY-MM-DD) | CLOSED or CUSTOM | Custom open–close | Note |
| --- | --- | --- | --- |
| | | | |

### Private events outside standard hours

1. May private events run outside weekly windows? (yes/no)  
2. Who may authorize a staff hours exception (`events.confirm`)?  
3. Any standing rules (e.g. weekends only, manager approval required)?

### Verification

1. Who should mark the policy **VERIFIED** in MagicCRM?  
2. Approval note text to record (who confirmed / date source): _______________

**Do not invent hours. Do not mark Production VERIFIED without this completed template and explicit authorization.**

## Remaining blockers

1. Fresh Clerk TEST headed bootstrap for browser hours + staff quote UI verification  
2. Owner-completed hours template + authorization to apply/verify on Generations Main Location  
3. Final live price revalidation  
4. Resend / customer quote delivery / card payments / tax still separately gated  
