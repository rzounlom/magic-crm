# Phase 12I — Permanent Playwright test auth + PR #27 acceptance

**Date:** 2026-11-22  
**PR:** https://github.com/rzounlom/magic-crm/pull/27 (**MERGED**)  
**Merge commit:** `cd80af7`  
**Release decision:** **RELEASED** — authenticated browser acceptance PASS; Production Ready

---

## 1. Test identity provisioning method

Idempotent script: `pnpm test:e2e:provision` → `scripts/e2e-provision-test-users.ts`

- Clerk **DEVELOPMENT** API only (`sk_test_` / `pk_test_`); refuses live keys and non-DEV Neon hosts
- Creates/updates users with `+clerk_test` emails (no outbound email) and `privateMetadata.e2eTestUser=true`
- Adds `org:member` membership on Test Center B Clerk org
- Ensures MagicCRM `UserProfile` + exact system security group (no extras)
- Writes gitignored `playwright/.fixtures/e2e-test-identities.json`

### Role-to-account mapping (no secrets)

| Role | Default email (override via env) | System group | Price override | Quotes approve | Inquiries manage |
|---|---|---|---|---|---|
| Administrator | `e2e.admin+clerk_test@example.com` (`E2E_CLERK_ADMIN_EMAIL`) | `administrators` | yes | yes | yes |
| Event Sales | `e2e.event-sales+clerk_test@example.com` (`E2E_CLERK_EVENT_SALES_EMAIL`) | `event_sales` | **no** | yes | yes |
| Front Desk | `e2e.front-desk+clerk_test@example.com` (`E2E_CLERK_FRONT_DESK_EMAIL`) | `front_desk` | **no** | **no** | **no** |

Org: `magiccrm-test-center-b` (synthetic). No personal employee accounts. Production Clerk untouched.

---

## 2. Clerk development-instance setup

- Local `.env` / `.env.local` TEST keys (`pk_test_` / `sk_test_`)
- Optional `.env.e2e` from `.env.e2e.example` (placeholders only; gitignored)
- `@clerk/testing` `clerkSetup()` fetches a testing token
- `clerk.signIn({ page, emailAddress })` uses Backend sign-in **tickets** (no password UI, no MFA)

---

## 3. Playwright authentication architecture

| Piece | Path / project |
|---|---|
| Clerk token setup | `tests/e2e/clerk.setup.ts` → project `setup-clerk` |
| Role sign-in + storage | `tests/e2e/auth.setup.ts` → project `setup-auth` |
| Storage states | `playwright/.clerk/{administrator,event-sales,front-desk}.json` (gitignored) |
| Aliases | Also copies Admin → `.auth/staff.json`, Event Sales → `.auth/event-sales.json` |
| Helpers | `tests/e2e/helpers/e2e-auth.ts`, `quote-acceptance.ts`, `quote-db.ts` |
| Quote projects | `quote-admin`, `quote-event-sales`, `quote-front-desk` (depend on `setup-auth`) |

- Base URL: `http://localhost:3000` only (rejects `127.0.0.1`)
- Preflight: `/sign-in` must return HTTP 200 before auth
- Org activation: `Clerk.setActive({ organization })` + UI fallback for Test Center B
- Session renewal: quote projects re-run `setup-auth` each suite (fresh ticket sessions)
- Clear failures if provision fixture / membership / keys missing
- DB asserts via `tsx` helpers (Playwright runner cannot import Prisma `import.meta`)

**Not used:** manual cookie export, personal Admin session, hardcoded session tokens, auth bypasses, Production credentials.

---

## 4. Local and CI commands

```bash
# One-time
cp .env.e2e.example .env.e2e   # optional overrides
# Ensure app: http://localhost:3000/sign-in → 200
pnpm test:e2e:provision
pnpm test:e2e:auth

# Repeatable
pnpm test:e2e:quote
pnpm test:e2e:quote:admin
pnpm test:e2e:quote:event-sales
pnpm test:e2e:quote:front-desk   # restricted
pnpm test:e2e:authenticated      # auth + all quote projects
pnpm test:e2e                    # chromium desktop/mobile (non-quote)
```

CI: inject TEST Clerk secrets + DEV DB URL; never commit `.env.e2e`, `.clerk/`, or `.fixtures/` identity/auth files.

---

## 5. Acceptance results

App: `http://localhost:3000` · Fixture inquiry: synthetic WP on Test Center B · Suite: **7 passed** (3 auth + 3 quote + clerk setup)

### Administrator — PASS

- Dollar input editable; `$49.99` → 4999¢; `$55.00` → 5500¢; save/reload exact
- Blank / invalid / negative rejected; stored cents unchanged
- Authorized override succeeds; edit reason `required` enforced (empty reason does not persist)

### Event Sales — PASS

- Authenticated as dedicated Event Sales Clerk user (ticket session)
- Quote editor loads; qty save/reload; unit dollars locked in UI
- Server unauthorized override → `FORBIDDEN`; cents unchanged
- Internal approve path is delivery-gated (`Approve internal quote`); customer delivery remains blocked
- Draft survives Overview ↔ Staff quote tab switch
- WP staff-review wording; no false READY TO BOOK on WP path

### Front Desk / restricted — PASS

- Direct inquiry URL shows permission denial; no staff quote editor / approve / unit price controls
- Permissions unchanged (no inquiries view/manage, no override, no approve)

---

## 6. Workflow separation (confirmed in Event Sales browser path)

- WordPress inquiries remain staff-review requests
- No false READY TO BOOK on WP inquiry surface
- Customer delivery unavailable (`canDeliver: false` path)
- HOLD / booking confirmation not exercised or altered
- Staff quote draft survives tab switches

---

## 7. Security review

| Control | Status |
|---|---|
| Real credentials in Git | **No** — `.env.e2e`, `.clerk/`, `.fixtures/` gitignored |
| `.env.e2e.example` | Placeholders only |
| Logs | Emails redacted; no passwords/tokens printed |
| Production Clerk | Unchanged |
| App authz / middleware | Unchanged; no bypass |
| Role permissions | Unchanged; Front Desk not granted inquiry rights for tests |
| Screenshots/traces | Local `test-results/` only; review before sharing |

---

## 8. Quality gates

| Gate | Result |
|---|---|
| Typecheck | PASS |
| Lint | PASS (0 errors; unrelated pre-existing warnings elsewhere) |
| Unit tests | **1010 passed** / 1 skipped |
| Production build | PASS |
| Authenticated Playwright quote suite | **7 passed** |

---

## 9. PR #27 / Production

| Step | Status |
|---|---|
| Critical quote browser acceptance | **PASS** (7/7) |
| Commit test infra + report | `2989c7d` on PR branch; no secrets/auth artifacts |
| Merge to `main` | **MERGED** `cd80af7` |
| Vercel Production | **Ready** (deployment `magic-7ihgk9n1o…`, env Production – magic-crm) |
| Production smoke (read-only) | `https://magic-crm-eta.vercel.app` → `/` 200, `/sign-in` 200 (signed-out), `/app` 307 auth redirect. No customer-data writes. |

---

## 10. Safeguards preserved

- `approved_plugin_baseline` / catalog baseline unchanged
- `finalLivePriceRevalidation: pending`
- `canDeliver: false`
- Integer-cent storage; 25% deposit messaging
- VERIFIED operating hours; existing permissions
- Customer email / delivery / payments / Scenario Lab / live WP pricing **not** enabled or modified

---

## 11. Remaining blockers

None. Permanent Clerk ticket auth is in place; PR #27 is merged; customer Production is Ready with read-only smoke confirmed.
