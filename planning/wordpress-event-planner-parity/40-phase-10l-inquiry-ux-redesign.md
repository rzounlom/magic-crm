# Phase 10L — Public + employee inquiry UX redesign

**Date:** 2026-11-11  
**Branch:** `phase-10l-inquiry-ux-redesign`  
**Scope:** Visual design, information architecture, responsiveness, usability  
**Non-goals:** Pricing engine, delivery gates, operating hours, schema migrations

## Layout plan (executed)

### Public `/inquire/[organizationSlug]`
- Centered premium column (`max-w-[52.5rem]` / ~840px)
- Ambient gradient canvas + sectioned form cards
- Tenant display name as primary header identity; MagicCRM understated (“Powered by”)
- Segmented choice cards for Yes/No and attraction preferences
- Explicit non-reservation / non-pricing disclaimer retained

### Employee `/app/inquiries/[id]` (WP intake path)
- Compact header with event facts + primary actions
- Status cards: private estimate / availability / quote / delivery
- Corrected WP presentation label: **Event inquiry — staff review required**
- Tabs (mounted, not remounted): Overview · Staff quote · Recommendations · Activity & notes
- Recommendations: warnings visible; itinerary/items collapsed
- Approve CTA: **Approve internal quote** when delivery gated

## Safety confirmation
- No pricing source / revalidation / deposit / hours / permission / email / payment changes
- Synthetic browser evidence only (`magiccrm-test-center-b`)
- No Production customer records created for Generations

## Screenshots
See `assets/phase-10l/`.
