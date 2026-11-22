# Phase 12G — Quote editor acceptance & safe release

**Date:** 2026-11-22  
**PR:** https://github.com/rzounlom/magic-crm/pull/27  
**Head commits reviewed:** `c61aebb`, `cd064e6` (+ follow-up negative-price rejection if pushed)  
**Release decision:** **NOT MERGED** — critical authenticated quote save/reload **not verified**

---

## 1. PR #27 review (scope)

Diff vs `main` is limited to:

- Employee presentation copy / funnel / queue grouping
- Dollar input boundary conversion (`money.ts`, quote action/panel)
- Tests + Phase 12E/12F planning docs & screenshots

**No** schema migrations, permission template grants, HOLD/booking logic changes, catalog/math changes, or `canDeliver` enablement for approved baseline.

Safeguard spot-check in code:

- Baseline delivery policy still `canDeliver: false`
- `CRM_QUOTES_PRICE_OVERRIDE` still required for unit price changes
- Integer-cent storage retained after form parse

---

## 2. Critical authenticated quote save/reload — BLOCKED

### Attempted

1. Existing `playwright/.auth/staff.json` → redirects to `/sign-in` (expired; created 2026-11-11).
2. Local Next on 12F branch at `127.0.0.1:3000` — `next dev` often hangs on HTTP (0 bytes / timeout). `next start` after a clean build eventually answers `/sign-in` with **HTTP 500** (~30s).
3. `pnpm test:e2e:staff:auth` (headed Clerk bootstrap) **refused** because the app returned HTTP 500 for the bootstrap precondition.
4. Integration suite setup (`tests/integration/setup.ts`) exited early (`process.exit(1)`) — test DB/Prisma prepare unavailable in this session; could not use service-layer Admin/Event Sales quote fixtures as a substitute for the required browser path.

### Consequence (per Phase 12G rules)

**Critical workflow is NOT accepted.**  
**PR #27 left OPEN — no merge, no Production deploy.**

### What was still verified without browser

| Check | Result |
|---|---|
| `4999` ↔ `$49.99` display/parse | Pass (unit) |
| `$55.00` → `5500` cents | Pass (unit) |
| `$0.01`, `$0.10`, `$1.00`, `$550.00` | Pass (unit) |
| Invalid text / blank / excessive decimals | Pass (unit) |
| Negative amounts | Pass after 12G fix — rejected (`Unit price cannot be negative.`) |
| Event Sales cannot override unit cents (service) | Covered by existing integration test in repo; **not re-executed this session** (DB setup failed) |

---

## 3. Workflow wording (code review)

| Surface | Expected 12F behavior | Verified how |
|---|---|---|
| Queue | Needs staff review / Ready for booking follow-up | Unit tests + source |
| WP detail funnel | No customer-selected / Live Agent stages | Unit tests |
| Quote / delivery copy | Calm “unavailable”; approval ≠ send | Source review |
| `?focus=review` | Wrapper `id="ready-for-live-agent"` retained | Source review |
| Live Agent READY TO BOOK | Preserved for genuine selections | Unit tests |

Dashboard/queue live UI on local 12F **not** browser-verified (app hang). Production still runs Phase 12D until merge.

---

## 4. Visual acceptance

Synthetic fixtures remain in `docs/design/phase-12f-screenshots/` (375–1920).  
**Authenticated quote editor screenshots not captured** (auth + local HTTP blocker).

---

## 5. Regression gates (this session)

| Gate | Result |
|---|---|
| typecheck | Pass (`tsc --noEmit`) |
| Focused unit (money, dollar boundary, WP labels, queue, pricing verification, baseline) | **23 passed / 6 files** |
| Full unit / lint | Pass earlier in session on 12F head; not re-run after money-only delta beyond focused set |
| Production `next build` | Pass (used for `next start` probe) |
| Integration quote suite | **Blocked** (setup `process.exit`) |

Safeguards unchanged in code review: integer cents, approved baseline, `finalLivePriceRevalidation: pending`, baseline `canDeliver: false`, 25% deposit messaging, override permission gate, no Scenario Lab / Preview / Production writes.

---

## 6. Controlled release

| Step | Status |
|---|---|
| Merge PR #27 | **Skipped** |
| Production deploy | **Not triggered** |
| Production smoke | N/A (12F not shipped) |

---

## 7. Unresolved issues / next actions for owner

1. **Unblock local Next HTTP** (hangs after Ready on `127.0.0.1:3000`) — required for Clerk headed bootstrap.
2. Run `PLAYWRIGHT_STAFF_ORG_SLUG=magiccrm-test-center-b pnpm test:e2e:staff:auth` and complete TEST sign-in for `magiccrm-test-center-b`.
3. Execute the Admin quote matrix (display `$49.99`, save `$55.00`, reload → `5500` cents) and Event Sales locked unit price + internal approve / no delivery.
4. Then re-run 12G gates and merge only if critical path passes.

---

## Explicit confirmation

- **No Production merge or deploy performed.**
- **No Production customer-data writes.**
- Pricing, delivery, and booking safeguards remain as coded on the PR branch; live quote save/reload acceptance remains **pending**.
