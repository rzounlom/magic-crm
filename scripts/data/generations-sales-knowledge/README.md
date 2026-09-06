# Generations AI Sales Knowledge — Development Seed

This package contains 41 curated SalesKnowledgeItem-style records for the MagicCRM AI Sales Agent MVP, plus sales guidance and a verification queue. AdventurePlex regular operating hours are published tenant knowledge. Raceway regular hours remain in the verification queue and must not be invented.

## Files
- `sales-knowledge.json` — seed-ready records
- `sales-guidance.json` — internal AI qualification/recommendation guidance
- `needs-verification.json` — conflicts/unanswered questions that should not become confident production claims
- `manifest.json` — metadata
- `SOURCES.md` — public sources

## Raceway
Generations Raceway is included in the same tenant for development, tagged with `locationLabel: Generations Raceway`. This makes later migration to a separate Location/Organization straightforward.

## Import rules
The Cursor import should target one explicitly supplied organization slug, be idempotent, never seed Generations data into global tenant provisioning, and skip `needs-verification.json` as authoritative customer-facing knowledge. If the current schema lacks `locationLabel` or `sourceUrl`, preserve those details in `details`/`salesNotes` rather than changing schema only for this seed.
