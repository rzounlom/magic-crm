# AUTH1 — Authentication Transition & Session Latency

**Status:** Branded transition shipped; measurable server-side hot-path improvements applied; authenticated redirect timing **BLOCKED** on Clerk TEST storage state.  
**Not a production-readiness approval.**  
**STOP after AUTH1.**

---

## 1. Original symptom

Existing MagicCRM users navigating to `/sign-in` (or returning to the app) saw a nearly empty light-gray page with a small “MAGICCRM” label, sometimes for ~30 seconds, before Clerk UI or `/app` appeared.

---

## 2. Root cause and remaining hypotheses

### Blank page origin (confirmed)

| Factor | Finding |
|---|---|
| `/sign-in` page | Plain `bg-background` canvas + uppercase label + bare `<SignIn />` with **no** loading boundary |
| Clerk client init | While `isLoaded === false`, Clerk renders little/no branded chrome — users saw MagicCRM’s empty shell |
| Already signed-in | Clerk’s default component waited to redirect; no MagicCRM transition or `router.replace` |
| `/app` SSR | Layout ran `auth.protect` + `ensureProvisionedTenant` + invitation sync with **no** `loading.tsx` — navigations could show blank HTML until the server finished |

### Latency contributors (measured / code-traced)

| Contributor | Classification | Action |
|---|---|---|
| Duplicate `ensureProvisionedTenant` on `/app` layout **and** overview page | Confirmed unnecessary work | Removed page-level call; React `cache` dedupe in layout |
| Per-request `ensureDefaultSecurityGroups` → `syncPermissionDefinitions` + group upserts for already-provisioned tenants | Confirmed heavy hot path on Neon | Fast-path skip when org + location + profile + all system groups already exist |
| Sequential location/profile lookups in provision | Confirmed | Parallelized with `Promise.all` |
| Sequential nav permission checks + inquiry path | Confirmed (permissions already WeakMap-cached) | Parallelized chrome resolution |
| Clerk JS / network RTT (~seconds in some environments) | External / variable | Not bypassed; branded transition covers wait |
| Full ~30 s delay reproduction | **Not reproduced** in this unauthenticated AUTH1 run | Authenticated end-to-end timing **BLOCKED** without staff storage state |

Dev-only timing checkpoints (`magiccrm.auth1`) log: `route_mount` → `clerk_loaded` → `session_determined` → `redirect_initiated` → `app_shell_start` → `provision_done` → `chrome_done` → `app_ready`. No tokens/cookies/PII.

---

## 3. Before / after timing evidence

| Path | Before (characterization) | After |
|---|---|---|
| Signed-out `/sign-in` | Blank gray + label until Clerk paints | Full-viewport navy shell → Clerk form promptly (**Playwright PASSED**, ~2–5 s to form ready; evidence screenshots show card on navy) |
| Signed-in `/sign-in` | Long blank / Clerk internal wait | Branded transition + immediate `router.replace('/app')` — **BLOCKED** (no TEST session to measure) |
| `/app` first paint | No loading UI during SSR provision | `app/loading.tsx` shows `AuthWorkspaceTransition` |
| Provision hot path (established tenant) | Full security-group sync every request | Fast-path returns after org/location/profile + system-group count check |

**Honest verdict on the ~30 s delay:** The blank-screen UX is fixed for signed-out flows and covered for signed-in/app SSR. Server work that could amplify Neon latency was reduced. Whether the full ~30 s regression is eliminated for signed-in users requires a human Clerk TEST session measurement — not claimed fixed without that evidence.

---

## 4. Screenshots

| Asset | Scenario |
|---|---|
| `docs/design/auth1-evidence/sign-in-signed-out-chromium-desktop.png` | Signed-out desktop sign-in |
| `docs/design/auth1-evidence/sign-in-signed-out-390-chromium-desktop.png` | Signed-out mobile 390px |

Authenticated redirect / `/app` refresh screenshots: **NOT RUN** (auth blocked).

---

## 5. Auth-state scenario matrix

| Case | Behavior | Status |
|---|---|---|
| A. Signed-out `/sign-in` | Branded shell → Clerk SignIn promptly; not trapped on spinner | **PASSED** (Playwright) |
| B. Signed-in `/sign-in` | Transition → `router.replace('/app')`; no loop designed | **BLOCKED** (no storage state) |
| C. Signed-in, no active org | Existing `/app` status “Choose an organization” preserved (no silent tenant assign) | **NOT RUN** browser; code path unchanged |
| D. Expired / invalid session | Recovery guidance after 12 s on transition; return to sign-in / marketing home | Unit coverage for recovery UI; browser expired session **NOT RUN** |
| E. Temporary delay | Meaningful status; recovery after threshold (not an immediate error) | Implemented |

---

## 6. Tests executed

| Check | Result |
|---|---|
| `pnpm lint` | **PASSED** (0 errors; 1 pre-existing warning) |
| `pnpm typecheck` | **PASSED** |
| `pnpm test:unit` | **PASSED** 608 tests (incl. transition + timing) |
| `pnpm build` | **PASSED** |
| `pnpm test:e2e:auth1` | **PASSED** 5 public / **BLOCKED** 2 authenticated |
| Full Neon integration | **NOT RUN** (provision fast-path is additive; domain booking rules unchanged) |

Commands for headed inspection:

```bash
corepack pnpm test:e2e:auth1
corepack pnpm exec playwright test --grep @auth1 --headed --project=chromium-desktop
```

---

## 7. Remaining blockers

1. Human Clerk TEST storage state to measure signed-in `/sign-in` → `/app` wall time and capture authenticated screenshots.  
2. Optional: confirm Neon cold-start contribution with AUTH1 timing logs during `pnpm dev`.  
3. Production ship remains **NO** pending broader release gates (R3 staff auth, etc.).

---

## 8. Deliverables summary

| Item | Location |
|---|---|
| Transition UI | `src/components/auth/auth-workspace-transition.tsx` |
| Sign-in experience | `src/components/auth/sign-in-experience.tsx` |
| Loading boundaries | `src/app/sign-in/.../loading.tsx`, `src/app/app/loading.tsx` |
| Timing helper | `src/lib/auth/auth-timing.ts` |
| Provision / chrome latency | `provision-organization.ts`, `employee-shell-chrome.ts`, `app/layout.tsx`, `app/page.tsx` |
| Styles | `globals.css` (`.auth-workspace-transition*`, `.auth-sign-in-shell*`) |

**STOP.**
