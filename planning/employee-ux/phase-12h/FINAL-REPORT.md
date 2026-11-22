# Phase 12H — Local auth recovery & quote acceptance

**Date:** 2026-11-22  
**PR:** https://github.com/rzounlom/magic-crm/pull/27  
**Branch head at start:** `5e1cc0e`  
**Release decision:** **NOT MERGED** — Administrator critical path passed; Event Sales **browser** session not established (wrong Clerk account at bootstrap)

---

## 1. Root cause of HTTP 500 / hung local Next

**Environment-specific startup problem, not an application defect.**

Requests to `http://127.0.0.1:3000/...` while the app/Clerk/`APP_URL` use `http://localhost:3000` caused Next’s internal absolute-URL rewrite path to **HTTP-proxy to itself** (`Failed to proxy http://localhost:3000/sign-in` → socket hang up / 30s → HTTP 500).

Binding with `-H 127.0.0.1` reproduced the failure. Using the default host and **`http://localhost:3000`** recovers immediately.

### Recovery command (verified)

```bash
pnpm exec next build
pnpm exec next start -p 3000
# Always open http://localhost:3000 — not 127.0.0.1
```

Acceptance checks after recovery:

| Check | Result |
|---|---|
| `GET /sign-in` | **HTTP 200** |
| Clerk sign-in UI | Renders |
| `/app` unauthenticated | Redirects to `/sign-in` (307) |
| Authenticated `/app` | Accessible after Clerk TEST sign-in |

Clerk keys remain TEST (`pk_test_` / `sk_test_`). Neon host remains DEV `ep-bold-art-avjy5nt4`. No Production Clerk/env changes.

---

## 2. Clerk authentication outcome

| Role | Outcome |
|---|---|
| Administrator | **Restored** via `pnpm test:e2e:staff:auth` → `playwright/.auth/staff.json` (TEST). Org switched to **MagicCRM Test Center B**. |
| Event Sales | **Browser session not saved.** Headed bootstrap opened; sign-in completed as Administrator (`rz***`) instead of Event Sales (`fi***`). Script correctly refused to write `event-sales.json`. |

---

## 3. Administrator quote save/reload (critical)

Synthetic inquiry: `grwnitr5txbm26n7jecy4uhn` on `magiccrm-test-center-b` only.

| Step | Result |
|---|---|
| Create staff quote draft | PASS |
| Unit price field editable (Admin) | PASS |
| Set `$49.99` → store **4999**¢ → reload shows `$49.99` | PASS |
| Set `$55.00` → store **5500**¢ → reload shows `$55.00` | PASS |
| Boundaries `$0.01` / `$0.10` / `$1.00` / `$550.00` | PASS (1 / 10 / 100 / 55000¢) |
| Invalid `abc`, `-5`, `12.345`, blank | PASS after blank-field fix (stored cents unchanged at 55000) |
| Totals/qty update with unit edits | PASS (qty 4 retained; totals recalculated) |

Evidence: `playwright/.fixtures/phase-12h-quote-acceptance.json`

**Confirmed:** displayed dollars are never persisted as integer-dollar amounts (e.g. `$55.00` → 5500¢, not 55).

---

## 4. Event Sales authorization

| Check | Result |
|---|---|
| Effective perms (`event_sales` only) | `hasPriceOverride: false`, `hasApprove: true`, `hasInquiriesManage: true` |
| Server rejects unauthorized unit override | **PASS** — `FORBIDDEN`; cents unchanged (`55000` → `55000`) |
| Browser: unit field locked / delivery copy | **BLOCKED** — no Event Sales Clerk storage state |
| Front Desk / Operations permission templates | Unchanged in code review (`CRM_QUOTES_PRICE_OVERRIDE` still gated in `updateWpStaffQuoteDraft`) |

Evidence: `playwright/.fixtures/phase-12h-event-sales-override-reject.json`

---

## 5. Focused fix discovered during acceptance

Blank `lineUnitPriceDollars_*` previously fell through to **`return 0`**, allowing `$0.00` / 0¢ persistence on empty submit.

**Fix:** when the dollar field is present, always run `parseDollarInputToCents` (blank → `"Enter a unit price."`). Never coerce blank to 0¢.

Also fixed Event Sales bootstrap org-chip matching so display name `Magiccrm Test Center B` counts as synthetic (slug hyphen form was a false negative).

---

## 6. Workflow wording & screenshots

Authenticated staff session on Test Center B:

| Check | Result |
|---|---|
| WP inquiry staff-review language | PASS |
| Delivery unavailable messaging | PASS |
| Dollar unit price label | PASS |
| `?focus=review` | PASS |
| Screenshots | `docs/design/phase-12h-screenshots/queue-focus-review-1440.png`, `quote-editor-1440.png` |

---

## 7. Regression gates

| Gate | Result |
|---|---|
| typecheck | Pass |
| lint | Pass (4 pre-existing warnings, 0 errors) |
| Focused dollar/workflow units | 24 passed |
| Full unit suite | **1010 passed**, 1 skipped (161 files) |
| Production build | Pass |

Safeguards unchanged: integer-cent storage, approved baseline catalog `2026-11-02`, `finalLivePriceRevalidation: pending`, baseline `canDeliver: false`, 25% deposit messaging, price-override permission gate, no Scenario Lab / Preview / Production customer writes.

---

## 8. PR #27 / Production

| Step | Status |
|---|---|
| Merge PR #27 | **Skipped** |
| Production deploy | **Not triggered** |
| Production smoke | N/A |

### Remaining blocker (manual)

1. Run Event Sales headed bootstrap again.
2. Sign in as **Event Sales** (`fi***@gmail.com`), not Administrator.
3. Confirm org **MagicCRM Test Center B**.
4. Re-run `scripts/phase-12h-quote-acceptance.ts` Event Sales steps (unit field locked + delivery unavailable).
5. Then merge PR #27 if those browser checks pass.

---

## Explicit confirmation

- Local `/sign-in` 500 root-caused and recovered via `localhost` (not `127.0.0.1`).
- Administrator authenticated dollar save/reload **accepted**.
- Event Sales **server-side** override denial **accepted**; Event Sales **browser** UI **not** accepted.
- **PR #27 left OPEN** — no merge, no Production deploy.
