# Phase 12E — WordPress vs Live Agent findings

Do **not** merge these workflows. Document confusion only.

## WordPress `PUBLIC_EVENT_REQUEST`

Evidence: Production detail `…/inquiries/rtq1097dh0xlzm15x25vvcoc` (contact redacted in screenshots).

### Stage B — Understand

| Question | Answerable quickly? | Where |
|---|---|---|
| Who is the customer? | Yes | Header name + contact line |
| Event type? | Yes | Header |
| When? | Yes | Header datetime |
| Guests? | Yes | Adults/children/total + duration |
| Attractions? | Yes | Overview preferences |
| Food / private room? | Yes | Overview Food / Private space |
| Budget? | Yes | Overview (Flexible or $) |
| Additional requests? | Partial | Customer notes when present; occasion on Recommendations intake |

**Overview quality:** Useful working summary for prefs; **Customer activity funnel is wrong for WP** (shows Live Agent stages). Status banner correctly says public form / no package.

### Recommendations

- Main vs Alternative 1–3 differences are understandable (price, attractions, itinerary).
- Private pricing labeled (“Private recommendation (staff only)”).
- Preparation / scheduling warnings are human-readable.
- Technical status line (`approved_plugin_baseline`, catalog revision, ISO timestamps) is **staff-hostile** in the primary panel.
- Badge “Recommendations 10” counts warnings; employees may think 10 recommendations exist.

### Notes / return

- Activity & notes findable; note composer labeled “Internal / customer follow-up note” — ambiguous whether customer-visible.
- Return via “Back to inquiries” works; queue still shows draft meta (`Staff draft — … · Not validated`).

## Legacy Live Agent

Evidence: Ada Lovelace synthetic fixture `…/inquiries/m3za922qcweghux1j15qyg4m`.

### What is clear

- **READY TO BOOK** used appropriately (customer selected Recommended @ $1,500).
- Booking coach sequence and HOLD ≠ Confirm copy are strong.
- Confirm disabled until claim; Place HOLD available.
- Availability panel: “Checking availability does not reserve rooms.”
- Deposit messaging: 25% estimated, payment not collected — correct.

### Friction

- Duplicate “Start working” blocks in the accessibility tree / page stack.
- History includes raw keys (`communication plan_selection_skipped`).
- Dense HOLD readiness + confirmation readiness panels require long scroll on mobile.
- Queue still shows ALL-CAPS banner on the card — loud but accurate for LA.

## Cross-path confusion (do not merge — clarify)

| Concept | WP presentation | LA presentation | Risk |
|---|---|---|---|
| Selected plan | Staff draft may set `selectedEventPlanId` | Customer selection | Funnel says “Customer selected plan” on WP |
| READY TO BOOK | Never on WP status chip (good) | Banner + queue | Same queue section houses both |
| Quote path | Staff quote tab + internal approve | Plan totals on workspace | Different verbs for “prepare money” |
| Hold | Check availability on quote; holds discouraged until approved | First-class HOLD | Employees may seek HOLD on WP too early |
| Delivery | Explicitly blocked | N/A (book path) | WP “before customer send” urgency |

**Suggested language (not implementation):** rename queue section to “Needs staff follow-up”; keep WP/LA chips distinct; WP funnel stages → Submitted → Estimate ready → Quote drafted → Internally approved → (Delivery blocked).
