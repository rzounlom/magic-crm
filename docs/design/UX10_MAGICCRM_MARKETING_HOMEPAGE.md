# UX10 — MagicCRM Marketing Homepage

**Status:** Complete for the public marketing homepage visual phase.  
**Not a production-readiness approval.**  
**STOP after UX10.**

---

## 1. Before / after overview

| Before | After |
|---|---|
| Sparse `/` placeholder: eyebrow, title, “Sign in to the employee application…” | Full marketing narrative: nav, hero with real product visuals, showcase, workflow, features, audience, CTA, footer |
| Only Employee sign in CTA | Employee sign in preserved + on-page **Explore the platform** (#product) |
| No product imagery | Authentic public intake screenshots (desktop + mobile + preferences + timing) |

---

## 2. Design direction

**Brand:** MagicCRM — Effortless Precision  

- Deep navy hero foundations (`#001C64` / `#003087`) with action-blue accents (`#0070E0`)
- Source Sans 3 throughout
- Marketing-specific CSS (`.marketing-*`) scoped so employee app screens stay unchanged
- Expressive but related to UX2–UX9 tokens
- Subtle fade-up hero motion; disabled under `prefers-reduced-motion`

---

## 3. Homepage section architecture

1. **Marketing nav** — Product / How it works / Who it’s for · Explore · Employee sign in · accessible mobile menu  
2. **Hero** — Positioning eyebrow, H1, value prop, dual CTAs, desktop + mobile intake composition  
3. **Product showcase** — Keyboard-accessible tabs with real screenshots + honest staff-workspace pending panel  
4. **How it works** — Five-step inquiry → preferences → options → optional HOLD → staff confirmation  
5. **Capabilities** — Six shipped capability cards (no POS/payments/tax/analytics claims as live)  
6. **Who it’s for** — FEC / bowling / corporate / school-community  
7. **Final CTA** — Explore + Employee sign in  
8. **Footer** — Real anchors only; privacy/terms noted as prelaunch requirement (no empty links)

---

## 4. Marketing claims verification

| Claim | Status |
|---|---|
| Inquiry → proposals → booking workflows → scheduling | Accurate for shipped engines |
| HOLD ≠ confirmed booking | Explicitly stated |
| No payment collection on inquiry | Explicitly stated |
| AI-assisted event sales support | Accurate as structured recommendation support |
| POS / payments / tax / advanced analytics as shipped | **Explicitly denied** |
| Testimonials, logos, fake metrics | **Not used** |
| Lead-capture / demo booking destination | **Does not exist** — CTA is on-page `#product` |

---

## 5. Screenshot provenance and sanitization

| Asset | Source | Sanitization |
|---|---|---|
| `public/marketing/intake-desktop-event.png` | Playwright capture of `/inquire/{TEST_SLUG}` shell | Host eyebrow / `data-public-host` hidden via temporary CSS; no PII |
| `intake-desktop-fun.png` | Same session, Fun step | Same |
| `intake-desktop-when.png` | Same session, When step | Same |
| `intake-mobile-event.png` | 390×844 capture | Same |
| `og-card.png` | Copy of desktop event capture | Social share asset |
| Source archives | `docs/design/ux10-source-captures/` | Retained for audit |

**Staff screenshots:** **Unavailable** — no `PLAYWRIGHT_STORAGE_STATE`. Showcase “Staff workspace” tab is an honest pending panel, not a fictional dashboard.

**Labeling:** UI copy notes illustrative test-environment captures with host branding hidden.

---

## 6. Screenshot assets and file sizes

| File | Size |
|---|---|
| `public/marketing/intake-desktop-event.png` | 140 KB |
| `public/marketing/intake-desktop-fun.png` | 130 KB |
| `public/marketing/intake-desktop-when.png` | 111 KB |
| `public/marketing/intake-mobile-event.png` | 81 KB |
| `public/marketing/og-card.png` | 140 KB |
| `docs/design/ux10-screenshots/home-1440.png` | 986 KB |
| `docs/design/ux10-screenshots/home-768.png` | 946 KB |
| `docs/design/ux10-screenshots/home-390.png` | 669 KB |

Images served from `/public` via `next/image` (priority on hero).

---

## 7. CTA destinations

| CTA | Destination |
|---|---|
| Explore the platform | `#product` (on-page) |
| Employee sign in | `/sign-in` (unchanged Clerk route) |
| Nav Product / How it works / Who it’s for | `#product` / `#how-it-works` / `#who-its-for` |

**Follow-up:** real sales/lead-capture workflow when product defines one. Privacy/terms pages are prelaunch requirements.

---

## 8. Responsive coverage

Verified via Playwright at 320 / 375 / 390 / 768 / 1024 / 1440 — no horizontal overflow. Mobile menu open/close covered. Desktop hero shows layered phone preview; mobile prioritizes readable copy + primary visual.

---

## 9. Accessibility results

| Check | Result |
|---|---|
| One H1 | Yes |
| Keyboard showcase tabs (incl. arrows) | Yes |
| Mobile menu Escape + focusable controls | Yes |
| Axe critical/serious on `/` | **PASSED** (desktop + mobile) |
| Reduced motion | Hero animation disabled |

Manual SR / contrast sampling still recommended before launch.

---

## 10. SEO implementation

`src/lib/marketing/metadata.ts`:

- Title + description (truthful)
- Open Graph + Twitter card
- `og-card.png` image asset
- `robots: noindex` outside production
- `canonical` / `metadataBase` **only** when `APP_URL` is a verified **https** non-local origin

---

## 11. Performance findings

| Check | Result |
|---|---|
| Server-rendered marketing shell | Yes (`MarketingHome` server + small client islands) |
| Client JS | Nav menu + showcase tabs only |
| Lazy-load below-fold images | Default `next/image` (hero `priority`) |
| Third-party marketing trackers | None added |
| Lighthouse | **NOT RUN** (tooling not invoked this phase) — record when CI has it |

---

## 12. Browser test results

| Suite | Status |
|---|---|
| `tests/e2e/marketing-home.spec.ts` | **PASSED** (desktop + mobile) |
| Existing public intake / journey / token / axe | **PASSED** |
| Combined `pnpm test:e2e:public` | **PASSED** (46/46) |

---

## 13. Files changed

- `src/app/page.tsx`
- `src/app/globals.css`
- `src/components/marketing/*` *(new)*
- `src/lib/marketing/metadata.ts` *(new)*
- `public/marketing/*` *(new authentic screenshots)*
- `tests/e2e/marketing-home.spec.ts` *(new)*
- `tests/unit/marketing-home.test.tsx` *(new)*
- `tests/e2e/public-token.smoke.spec.ts`
- `package.json`
- `docs/design/UX10_MAGICCRM_MARKETING_HOMEPAGE.md`
- `docs/design/ux10-screenshots/*`
- `docs/design/ux10-source-captures/*`
- `planning/architecture/ui-conventions.md`

`SiteShell` retained for non-marketing uses / unit contracts.

---

## 14. Known limitations

- No staff product screenshots until Clerk TEST storage state exists
- No proposal comparison visual without safe plan token fixture
- No sales lead-capture form / demo booking route
- No privacy/terms pages yet (documented, not empty-linked)
- OG image is a product capture, not a custom 1200×630 designed card
- Lighthouse not measured in this phase

---

## 15. Outstanding UX9 release blockers (unchanged)

1. Neon TEST latency / security-groups integration timeouts  
2. Full integration suite not completed  
3. Missing authenticated staff Playwright state  
4. Missing valid proposal fixture  
5. Manual accessibility verification beyond axe  

UX10 did **not** resolve these.

---

## 16. Future marketing enhancements

- Capture staff inquiries / Booking Coach / schedule once TEST auth exists  
- Proposal tier comparison visual with safe fixture  
- Designed OG/social card  
- Lead-capture / contact workflow when product-approved  
- Privacy & terms pages  
- Optional case studies only with real customer permission  

---

## Validation summary

| Check | Status |
|---|---|
| `corepack pnpm lint` | **PASSED** |
| `corepack pnpm typecheck` | **PASSED** |
| `corepack pnpm test:unit` | **PASSED** (after claim-copy fix) |
| `corepack pnpm build` | **PASSED** |
| Public Playwright + marketing | **PASSED** (46/46) |
| Focused integration | **NOT RUN** (no backend contract changes) |

**STOP.** UX10 is the final planned visual redesign phase.
