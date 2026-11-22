# Phase 12E — Final usability audit report

**Branch:** `phase-12e-inquiry-workflow-audit`  
**Baseline:** Production https://magic-crm-eta.vercel.app · merge `73c600b` (PR #26) · Event Planner 3.5.0  
**Mode:** Audit + recommendations only — **stopped before implementation**

---

## 1. Executive usability assessment

Phase 12C/12D make **discovery and triage** workable: Home attention tiles, sectioned queue, compact WP header, status strip, and a Live Agent booking coach that separates HOLD from confirmation.

Employees still face **language and quote-editor hazards** that risk wrong prices or wrong assumptions about customer selection/delivery. No P0 blocker for Admin/Event Sales to *open work and prepare a draft*, but six **P1** items should precede deeper feature work. **Blocked customer delivery is intentional and correctly disclosed — not a defect.**

See [01-executive-assessment.md](./01-executive-assessment.md).

---

## 2–3. Workflow map & click measurements

Home → attention tile → focused queue → card = **2 clicks** to detail. Staff quote / Recommendations / Activity each cost **+1 tab**. Live Agent path uses coach steps with claim before Confirm.

Full map: [02-workflow-map-and-clicks.md](./02-workflow-map-and-clicks.md).

---

## 4. Role-based usability matrix

| Role | Inquiries? | Quote approve? | Price override? | HOLD/Confirm? |
|---|---|---|---|---|
| Administrators | Yes | Yes | Yes | Yes |
| Event Sales | Yes | Yes | No | Yes |
| Front Desk | **No** (defaults) | No | No | No |
| Operations | **No** (defaults) | No | No | No |

Detail: [03-role-matrix.md](./03-role-matrix.md).

---

## 5. WordPress inquiry findings

- Header answers who/what/when/guests/contact quickly.
- Overview prefs cover attractions, food, room, budget.
- **Defect:** Customer activity funnel still narrates Live Agent selection stages.
- Recommendations useful but technical pricing status is dense; badge “10” = warnings.
- Delivery gate clear; private estimate labeled staff-only.

---

## 6. Legacy Live Agent findings

- READY TO BOOK used appropriately on Ada synthetic fixture.
- Coach clarifies HOLD optional vs Confirm; Confirm disabled until claim.
- Friction: duplicated Start working / readiness content; raw history keys; long mobile scroll.
- Must remain distinct from WP path (do not merge).

---

## 7. Quote editor usability findings

- Discoverable via Staff quote tab; Save vs Approve internal quote correctly separated.
- **P1:** **Unit cents** with values like `4999` / `55000` vs dollar totals elsewhere.
- Reason-for-edit required is good guardrail; override denial is title-only.
- No page-leave dirty warning; tabs preserve in-memory edits by design.
- Synthetic local write test **not** run (auth expired).

---

## 8. Availability & approval clarity

- Labels exist for Not validated / Available / Unavailable / Needs adjustment / Availability changed.
- Strip + Check availability communicate unchecked vs checked; HOLD ≠ Available ≠ Confirmed is clearer on LA than WP.
- Four stages (draft → internal approve → deliver → confirm) are distinguishable; deliver blocked with policy message (jargon-heavy).

---

## 9. Mobile vs desktop

- Desktop shell/queue strong; phone tabs OK; **quote editing and LA readiness painful on 375**.
- Evidence: [06-mobile-desktop.md](./06-mobile-desktop.md).

---

## 10. Severity-ranked issues

Top P1: E01 Unit cents · E02 WP funnel · E03 policy jargon · E04 queue section title · E05 Front Desk no inquiries · E06 “before customer send” framing.

Full table: [07-severity-and-roadmap.md](./07-severity-and-roadmap.md).

---

## 11. Recommended quick wins

Rename/reformat Unit price; WP funnel labels; plain-language delivery; attention-strip wording; warnings badge; override helper; internal-note label; queue section title → “Needs staff follow-up”.

---

## 12. Recommended workflow improvements

Default Staff quote tab when draft exists; collapse alternatives; sticky mobile save; unsaved guard; humanize LA history; dedupe coach.

---

## 13. Proposed Phase 12F scope

**Employee language & quote clarity** — implement quick wins + selected workflow polish; **no** `canDeliver` enablement, no Scenario Lab, no WP/LA merge, no pricing math changes. Permission template changes only if owner approves L1.

---

## 14. Screenshot & evidence paths

- `docs/design/phase-12e-screenshots/`
- Index: [screenshots/README.md](./screenshots/README.md)

---

## 15. Zero Production changes

Confirmed in [08-production-change-confirmation.md](./08-production-change-confirmation.md): **no Production mutations, no merge, no deploy, no runtime code changes in this phase.**

---

## Mental model checklist

| Distinction | Clear to employee today? |
|---|---|
| Inquiry vs booking | Mostly (WP banner + LA coach) |
| Staff recommendation vs customer selection | **Weak on WP funnel** |
| Private estimate vs staff quote | Mostly (labels present; jargon) |
| Draft vs approved quote | Yes |
| Approved vs delivered | Yes (gated) |
| Availability check vs hold | Stronger on LA |
| Hold vs confirmed booking | Yes on LA |
| Internal note vs customer communication | **Weak** (ambiguous composer label) |

---

## Stop

Audit complete. **Do not implement recommendations until owner review.**
