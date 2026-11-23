# Phase 12N — Employee workflow readiness audit

**Date:** 2026-11-22  
**Baseline:** `main` @ `db4eb74` (includes PR #30 merge `82ce30d` + 12M report)  
**Branch:** `phase-12n-employee-workflow-readiness-audit`  
**Nature:** Audit + evidence only. **No business-rule changes. No merge/deploy.**

---

## Executive readiness verdict

**Conditional operational readiness: YES for permitted daily work on synthetic Test Center B.**

Administrators and Event Sales can navigate Home → Inquiries → Staff quote (edit / availability / internal approve) → Bookings → Schedule without unauthorized actions or false READY TO BOOK on WordPress inquiries. Front Desk can use Bookings and Schedule, understand HOLD vs Booked, and is correctly blocked from inquiries and booking creation.

**Customer quote delivery remaining blocked is intentional — not a defect.**

Remaining friction is mostly **copy, attention hierarchy, and coverage gaps** (P2/P3), not permission or data-integrity failures. No P0 found in this audit.

**Answer to the phase question:** Employees can complete their *permitted* workflows confidently enough for internal prep and schedule ops; the main gaps that still hurt readiness are (1) payment-flavored “unpaid” pending-booking copy, (2) a strong Contact-customer CTA while delivery is unavailable, (3) dense catalog-discrepancy interpretation on quotes, and (4) incomplete automated coverage of booking-detail / HOLD-mutation paths in the employee suite.

---

## 1. Baseline

| Item | Status |
|---|---|
| Production | **Ready** (`magic-142084vsn…` / prior `magic-kq7q3t05q…`; alias `magic-crm-eta.vercel.app`) |
| Clerk TEST auth | Present (`playwright/.clerk/*`, Phase 12I ticket flow) |
| E2E | Quote **7**; employee `@phase-12j`/`12l`/`12m` **48** passed / **63** skipped this run |
| Intentional restrictions | `canDeliver: false`; no payment collection; Front Desk no inquiries/quote/create; Event Sales no price override; HOLD ≠ confirm; Scenario Lab untouched |
| Prior open owner decision | Front Desk inquiry access (12E E05) — **still intentional restriction**, not a bug |

Screenshots: `docs/design/phase-12n-screenshots/` (43 files).  
Journey JSON: `planning/employee-ux/phase-12n/journey-evidence.json`.  
Audit script: `scripts/phase-12n-workflow-audit.mjs` (read-only).

---

## 2. Role-based journey results

### Administrator — PASS (permitted path)

| Step | Result | Evidence |
|---|---|---|
| Sign-in / Home | Dashboard loads | `admin-home-1440.png` |
| Inquiry queue | Active queue + “Ready for Live Agent” section present | `admin-inquiries-1440.png` |
| Open WP inquiry | Staff review banner; not LA READY TO BOOK | `admin-inquiry-detail-1440.png` |
| Staff quote | Dollar unit fields; Check availability; Approve internal quote | `admin-staff-quote-1440.png` |
| Bookings / Schedule | New Booking visible; HOLD legend | `admin-bookings-1440.png`, `admin-schedule-1440.png` |
| Settings (Hours) | Reachable | `admin-hours-1440.png` |

### Event Sales — PASS (permitted path)

| Step | Result | Evidence |
|---|---|---|
| Queue / WP quote | Unit price **locked**; delivery gated; approve internal available | `sales-staff-quote-1440.png` (`unitPriceLocked: true`) |
| Bookings / Schedule | New Booking + Create Event present | journey evidence |
| Denied admin routes | Permission panel on Resources | `sales-resources-denied-1440.png` |

### Front Desk / Operations — PASS within policy

| Step | Result | Evidence |
|---|---|---|
| Home | Nav: Home / Bookings / Schedule only; Today bookings | `desk-home-1440.png` (`hasInquiriesNav: false`) |
| Inquiries URL | Permission denied | `desk-inquiries-denied-1440.png` |
| Bookings | List OK; **no** New Booking | `desk-bookings-1440.png` |
| `/app/bookings/new` | Server denial panel | `desk-new-booking-denied-1440.png` |
| Schedule | HOLD legend; **no** Create Event | `desk-schedule-1440.png` |

---

## 3. Prioritized findings

### P0 — none

No security, data-integrity, or unintended customer-delivery actions observed in authenticated synthetic journeys.

### P1 — none for *permitted* workflows

Front Desk cannot do inquiries — **intentional**. Do not broaden permissions to “complete” that journey.

### P2 — significant confusion / friction

#### N01 — Pending bookings panel says “unpaid”
- **Roles:** All with Schedule  
- **Steps:** Open `/app/schedule` → Pending bookings  
- **Expected:** Payment-neutral copy (pending confirmation / not occupying inventory)  
- **Actual:** “These are **unpaid** booking requests…” (`pending-bookings-panel.tsx`)  
- **Evidence:** `desk-schedule-1440.png`  
- **Fix:** Presentation copy only — align with Bookings “does not collect payment” language  
- **Business-rule change?** No  

#### N02 — Strong “Contact customer” while delivery unavailable
- **Roles:** Admin, Event Sales  
- **Steps:** Open approved WP inquiry Staff quote  
- **Expected:** Primary next action matches gated delivery (prepare/approve internal / external contact outside CRM)  
- **Actual:** Large **Contact customer** CTA alongside multiple delivery-unavailable warnings  
- **Evidence:** `admin-staff-quote-1440.png`, `sales-staff-quote-1440.png`  
- **Fix:** Demote or relabel CTA when `canDeliver: false` (presentation); keep warnings  
- **Business-rule change?** No  

#### N03 — Catalog discrepancy UX still dense
- **Roles:** Admin, Event Sales  
- **Steps:** Staff quote Step 1 with WP vs catalog amount diffs  
- **Expected:** Clear “what to do next” for discrepancies  
- **Actual:** Warning lists slug-like lines (`food.salad`, `room_laser_extra`) without a single staff decision prompt  
- **Evidence:** quote screenshots  
- **Fix:** Human labels + one-line next action (“refresh from catalog / keep staff edit / escalate”) — presentation  
- **Business-rule change?** No  

#### N04 — Duplicate delivery messaging
- **Roles:** Admin, Event Sales  
- **Expected:** One clear delivery gate  
- **Actual:** Inquiry attention strip + Staff quote yellow banner both stress delivery unavailable (known 12K; still true)  
- **Evidence:** quote screenshots  
- **Fix:** Progressive disclosure / single banner when already approved  
- **Business-rule change?** No  

### P3 — polish

| ID | Issue | Fix |
|---|---|---|
| N05 | Approval provenance shows raw ISO (`approved 2026-11-23T00:11:39…Z`) | Format with org timezone |
| N06 | No dirty-leave warning on quote edits (deferred since 12F) | `beforeunload` / in-app confirm |
| N07 | Occupancy chips = any reservation today, not concurrent capacity | Docs/tooltip only unless product defines concurrency |
| N08 | Front Desk Home left panel is generic (“Use the sidebar…”) | Role-specific next steps (Today bookings / Schedule) |
| N09 | Dense quote editor on 375px (10+ lines) | Already known; keep stacking, consider sticky total |

---

## 4. E2E coverage matrix

Setup tests (**not** counted as workflow): `setup-clerk`, `authenticate administrator|event_sales|front_desk`.

| Workflow | Admin | Event Sales | Front Desk | Automated | Manual (12N) | Expected skips | Gap |
|---|---|---|---|---|---|---|---|
| Nav visibility / denied routes | ✓ | ✓ | ✓ | `@employee-nav` | ✓ | Cross-role | Low |
| Home attention → queue | ✓ | ✓ | n/a | `@employee-home` | ✓ | FD | Low |
| WP inquiry review / tabs | ✓ | ✓ | denied | `@employee-wp` + `@quote` | ✓ | FD | Low |
| Staff quote $ edit / lock / approve UI | ✓ | ✓ | denied | `@quote` (3 workflow) | ✓ | FD | Medium: discrepancy UX unasserted |
| Check availability (UI present) | ✓ | ✓ | — | Indirect via quote | ✓ | — | Medium: no assert on result panel copy |
| LA HOLD≠confirm readiness | ✓ | — | — | `@employee-la` read-only | Partial | — | Medium: mutations in opt-in `@staff-*` only |
| Bookings list / filters / hierarchy | ✓ | ✓ | ✓ | `@phase-12l` | ✓ | Role | Low |
| New Booking gate (UI + page) | ✓ | ✓ | ✓ | `@phase-12m` | ✓ | Role | Low |
| Schedule HOLD legend / filters | ✓ | ✓ | ✓ | `@phase-12l/m` | ✓ | Role | Low |
| Booking **detail** open + resources | — | — | — | Weak | Partial (list only) | — | **High** |
| Schedule block → booking/inquiry | — | — | — | Lifecycle `@staff` opt-in | — | Mutations skipped in employee suite | **High** |
| Quote delivery still blocked | ✓ | ✓ | — | `@quote` | ✓ | — | Low |
| Responsive overflow Home/Inquiries/Bookings/Schedule | ✓ | — | — | `@phase-12j` + 12N script | ✓ | — | Low |
| Keyboard filters | ✓ | — | — | `@phase-12l/m` | — | — | Low |
| Dirty leave on quote | — | — | — | **None** | Noted | — | Medium |
| Production staff click-through | — | — | — | Policy skip | Signed-out only | — | Documented |

**Highest-value gaps:** booking-detail employee coverage; schedule-block navigation without requiring mutation; quote discrepancy/attention hierarchy assertions; optional dirty-leave.

---

## 5. Responsive / a11y

| Viewport | Document overflow (Home, Inquiries, Bookings, Schedule) |
|---|---|
| 375, 430, 768, 1024, 1440, 1920 | **None** (journey script) |

- Schedule intentional horizontal scroll remains; document does not overflow.  
- HOLD legend uses text + dashed vs solid (not color alone).  
- Quote editing remains long on small phones (P3 density).  
- Keyboard: booking filters + schedule toolbar covered in 12L/12M E2E.

---

## 6. Intentional restrictions (not defects)

- `canDeliver: false` / customer email delivery unavailable  
- MagicCRM does not collect payment  
- `finalLivePriceRevalidation: pending` / approved plugin baseline catalog  
- Front Desk: no inquiries, no quote, no New Booking / Create Event  
- Event Sales: no unit-price override  
- HOLD placement / confirmation rules unchanged  
- Scenario Lab / Preview / Production writes not used  

---

## 7. Recommended next implementation phase

**Phase 12O — Employee attention & payment-neutral copy (presentation-only)**

1. Rewrite pending-bookings “unpaid” copy (N01).  
2. Soften / contextualize Contact customer when delivery unavailable (N02).  
3. Humanize discrepancy warnings + one next-action line (N03).  
4. Collapse duplicate delivery banners after internal approval (N04).  
5. Format approval timestamps (N05).  
6. Add employee E2E: open booking detail + schedule block dialog (read-only).  

Do **not** change permissions, pricing, HOLD/confirm, or delivery policy.

---

## 8. Test results (exact)

| Gate | Passed | Failed | Skipped |
|---|---|---|---|
| Typecheck | PASS | 0 | — |
| Lint | PASS (0 errors) | 0 | 4 pre-existing warnings |
| Unit | **1013** | 0 | 1 |
| Production build | PASS | 0 | — |
| Full quote E2E | **7** | 0 | 0 |
| Employee `@phase-12j`/`12l`/`12m` | **48** | 0 | **63** (cross-role) |
| 12N journey audit script | Completed 3 roles + 6 viewports | 0 | — |

---

## 9. Remaining blockers

**None for merge of an audit/docs PR.**  
**None blocking permitted synthetic workflows** after 12C–12M.  

Owner decision still open: whether Front Desk should ever gain inquiry access (out of scope; would be a permission change).

---

## 10. PR status

Docs/evidence-only PR from this branch — **leave open; do not merge automatically; do not deploy as a feature release.**
