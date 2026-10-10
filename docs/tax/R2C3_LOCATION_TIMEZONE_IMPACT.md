# R2C.3 — Location Time-Zone Impact Assessment

**Tenant:** Generations CRM Test  
**Observed:** Organization `America/Indiana/Indianapolis` · Location `main` = `UTC`  
**Authorization to change:** **Not granted.** Do not execute correction in R2C.3.

---

## 1. Which field each engine uses

| Engine | Time-zone source | Behavior with current Generations data |
|---|---|---|
| **Booking / holds / occupancy instants** | `resolveSchedulingTimeZone({ locationTimeZone, organizationTimeZone })` | Prefers **location** if it is a valid IANA zone. **`UTC` is valid** → scheduling uses **UTC**, not Indianapolis. |
| **Promotions / weekday pricing** | Civil `eventDate` (`YYYY-MM-DD`) via `weekdayKeyFromIsoDate` | **Ignores** IANA zone for weekday (civil date → UTC weekday of that calendar stamp). Wed/Thu/Fri promo days remain correct when `desiredDate` is the venue civil date. |
| **Tax effective dates / taxTimeZone** | `LocationTaxProfile.taxTimeZone`, else safe location TZ | No tax profile. Bare location `UTC` → calculator would return `UNRESOLVED_TIMEZONE` if calculation were enabled. |
| **Inquiry “today” / historical queues** | Often organization timezone | Uses org Indianapolis for some queue date logic. |

Code references:

- `src/lib/inquiries/tenant-datetime.ts` — `resolveSchedulingTimeZone` / `resolveTenantTimezone`
- `src/server/services/pending-booking-service.ts` — booking window instants
- `src/server/catalog/pricing.ts` — `weekdayKeyFromIsoDate` (`void timeZone`)
- `src/server/catalog/tax.ts` — UTC treated as unsafe for tax without `taxTimeZone`

---

## 2. Is location UTC a placeholder or intentional?

**Most likely placeholder / provisioning default.**

Evidence:

- Org correctly set to `America/Indiana/Indianapolis`.  
- Venue is Mishawaka, Indiana (public site).  
- `create-client-tenant-input.ts` historically allows/defaults timezone handling including UTC.  
- No documented business reason for a Mishawaka venue location to schedule in UTC.

Not proven intentional; treat as **configuration defect** pending authorized correction.

---

## 3. Authoritative venue support for correction

Public Generations AdventurePlex address (Mishawaka, IN) supports using:

`America/Indiana/Indianapolis`

(or another Indiana zone that observes the same civil rules for this county — Indianapolis zone is already on the org).

---

## 4. Before / after impact if location timezone were changed to Indianapolis

Assume change: `locations.timezone` `UTC` → `America/Indiana/Indianapolis` for location `rysftywo62ve9sao10dk71si`.

| Area | Before (UTC) | After (Indianapolis) | Risk |
|---|---|---|---|
| New booking `startsAt`/`endsAt` from local `eventDate`+`startTime` | Interpreted as UTC wall clock | Interpreted as Indiana wall clock | **High** — same clock string becomes a different UTC instant (typically −4/−5 hours) |
| Existing `ResourceReservation` / booking instants already stored | Remain as stored UTC instants | Unchanged unless recomputed | **High** if code recomputes; **OK** if left immutable |
| Promotion weekday on civil `desiredDate` | Unaffected | Unaffected | Low |
| Tax `taxTimeZone` | Would still need profile or safe TZ | Location TZ becomes safe fallback | Medium (tax still disabled) |
| Displays using org TZ vs location TZ | Mixed | More consistent | Low–medium |

**Do not** rewrite historical `startsAt`/`endsAt` or reservations as part of a timezone string fix.

---

## 5. Recommended safe correction plan (not executed)

1. Management confirms venue operating timezone = `America/Indiana/Indianapolis`.  
2. Inventory open holds/bookings that used UTC conversion.  
3. Authorized one-line location update **or** set `LocationTaxProfile.taxTimeZone` for tax only (does **not** fix scheduling).  
4. Prefer fixing `Location.timezone` for scheduling correctness, with a freeze on re-deriving historical instants.  
5. Add a provisioning guard: refuse `UTC` for FEC venue locations when org is non-UTC (future hardening — not R2C.3).

**Prepared but not executed:** no migration/script run in this phase.

---

## 6. Tax activation implication

Even with correct address and 7% rate draft:

- Enabling calculation without `taxTimeZone` or non-UTC location TZ → `UNRESOLVED_TIMEZONE`.  
- Fixing only taxTimeZone without fixing location TZ leaves **booking schedule** on UTC — separate operational defect.

Tax collection must stay disabled until timezone correction is authorized and validated.
