# R2C.2 — Fail-Closed Tax Engine Foundation

**Status:** Implemented foundation; **no Generations tax activation**.  
**Related:** R2C.1 research docs in this folder.

## Activation gates

Tax becomes chargeable only when all are true:

1. `OrganizationTaxSettings.calculationEnabled = true`
2. `OrganizationTaxSettings.collectionEnabled = true` (R2C.2 leaves this false; amount due ignores tax anyway)
3. Location tax profile with `jurisdictionResolved` + `jurisdictionCode`
4. Safe `taxTimeZone` (or non-UTC location timezone)
5. Explicit product classifications with TAXABLE/EXEMPT
6. Approved + verified + active rate covering the tax date (no overlaps)
7. Bundle policy when product is a package

Absent settings → status `DISABLED` (not zero tax).

## Generations notes

- Org timezone: `America/Indiana/Indianapolis`
- DEV location timezone still `UTC` — **not overwritten** in R2C.2
- Calculator treats bare `UTC` location timezone as `UNRESOLVED_TIMEZONE` unless `LocationTaxProfile.taxTimeZone` is set
- No Generations rate/classification/activation rows are seeded

## Pipeline

```
priceProduct → inclusions → applyPromotions → calculateTax (diagnostics) → deposit on pre-tax total
```

`Booking.taxCents` remains `0` on amount due. `payload.taxBreakdown` may hold diagnostics.

## Rate precision

`rateBps`: 10_000 = 100%, 700 = 7.00%. Finer than 0.01% unsupported in this foundation.
