# Phase 12K — Staff quote editor usability

**Date:** 2026-11-22  
**Branch:** `phase-12k-staff-quote-editor-usability`  
**PR:** https://github.com/rzounlom/magic-crm/pull/29 (pending create)  
**Scope:** Presentation-only redesign of `WpStaffQuoteDraftPanel`. No pricing, permission, delivery, or booking logic changes.  
**Recommendation:** **Merge** — presentation-only.

---

## 1. UI changes

Reorganized the Staff quote tab into four stages:

1. **Quote summary** — prominent total, subtotal/tax, availability, pricing source; delivery restriction banner retained; catalog discrepancies remain visible; technical metadata (plan date, last edit, WP parity notes, warnings) moved under **Technical details**.
2. **Edit draft** — clearer labels; line items with Quantity vs Unit price ($); required edit reason highlighted; Save uses secondary button styling.
3. **Check availability** — isolated step with copy that it does not HOLD/confirm; secondary button.
4. **Approve internal quote** — primary CTA; explicit “does not email the customer” when delivery is gated.

Also:

- **Refresh draft from private calculation** moved to the header as a secondary action with a confirmation dialog when a draft already exists (warns that staff edits will be discarded).
- Create draft remains primary when no draft exists.
- Dollar inputs and field names unchanged (`lineUnitPriceDollars_*`, `editReason`, etc.) for E2E compatibility.

---

## 2. Before / after screenshots

See `docs/design/phase-12k-screenshots/`:

- Before/after at 375, 768, 1440, 1920
- After shows Step 1–4 hierarchy and clearer action separation

---

## 3. Safeguards preserved

| Control | Status |
|---|---|
| Integer-cent storage / dollar display | Unchanged |
| Override permission gate | Unchanged (read-only unit price when denied) |
| `canDeliver: false` / delivery messaging | Unchanged |
| Approve action / server rules | Unchanged |
| HOLD / booking / catalog / WP plugin / Scenario Lab | Untouched |
| Clerk roles | Untouched |

---

## 4. Role acceptance (Playwright)

Uses Phase 12I/12J auth (`pnpm test:e2e:quote`, employee WP specs).

| Role | Expectation |
|---|---|
| Administrator | Full edit + override + approve UI |
| Event Sales | Edit qty/fields; locked unit $; approve internal |
| Front Desk | No inquiry/quote access (existing denied-route coverage) |

---

## 5. Quality gates

| Gate | Passed | Failed | Skipped |
|---|---|---|---|
| Typecheck | PASS | 0 | — |
| Lint | PASS (0 errors) | 0 | — |
| Unit | **1010** | 0 | 1 |
| Build | PASS | 0 | — |
| Quote E2E | **7** | 0 | 0 |
| Employee WP E2E | **5** (incl. auth setup) | 0 | 0 |

---

## 6. Remaining usability issues

- Inquiry-level delivery warning above tabs can still repeat themes from the Staff quote banner (intentional operational emphasis).
- Long line lists still require scrolling on small phones; cards stack cleanly but density remains high for 10+ lines.
- ISO timestamps in approval records are still raw server strings (out of scope).

---

## 7. PR / Production

Gates green. Merge → Production Ready + read-only smoke (`/`, `/sign-in`, `/app`).
