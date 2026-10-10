# R2D.1 — Generations Location Time-Zone Correction

**Tenant:** Generations CRM Test (`mdutc2nkvpafezukeem8942v`)  
**Location:** Main Location (`rysftywo62ve9sao10dk71si`)  
**Correction:** `UTC` → `America/Indiana/Indianapolis`  
**Scope:** Configuration only. Reservation and booking timestamps are never rewritten.

## Path

Customer-entered civil `eventDate` + wall-clock `startTime`  
→ `resolveSchedulingTimeZone(location, organization)`  
→ `occupancyInstants` / `eventLocalToUtc`  
→ UTC `startsAt`/`endsAt` stored  
→ availability overlap on civil `slotDate` + `startMinute`/`endMinute`  
→ customer display via event-local formatters (civil clocks) or `formatTenantTimestamp` (real instants)

## DST policy (explicit)

| Case | Policy |
|---|---|
| Spring-forward gap (e.g. 2026-03-08 02:30) | Fold to pre-transition offset (same instant as 01:30) |
| Fall-back ambiguity (e.g. 2026-11-01 01:30) | First (daylight) occurrence |

## Scripts

- `scripts/preflight-generations-location-timezone.ts` — dry-run
- `scripts/sync-generations-location-timezone.ts` — apply with `--confirm CORRECT_LOCATION_TIMEZONE --organization-id … --location-id …`

Refuse TEST role, `NODE_ENV=production`, non-DEV host, unexpected current TZ, active HOLDs, or future occupancy.
