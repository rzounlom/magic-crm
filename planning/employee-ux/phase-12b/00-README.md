# Phase 12B — Holistic employee UX audit & redesign proposal

**Status:** Design / planning only. No Production runtime changes. Do not merge until owner review.  
**Branch:** `phase-12b-employee-ux-redesign-proposal`  
**Baseline:** Production `e69d7f8` (post Phase 12A)  
**Date:** 2026-11-22

## Purpose

Pause feature work and define a coherent redesign direction for the **entire authenticated employee experience** — shared shell, homepage, navigation, and page foundations — so MagicCRM feels like a polished business workspace rather than a development utility.

Public landing and public inquiry already set a polish benchmark. The internal app should match that quality bar while staying optimized for operational work.

## Documents in this package

| File | Contents |
|---|---|
| [01-current-state-audit.md](./01-current-state-audit.md) | UX findings across shell and modules |
| [02-route-inventory.md](./02-route-inventory.md) | Full authenticated route inventory |
| [03-navigation-architecture.md](./03-navigation-architecture.md) | Proposed IA, sidebar, org/location, Public Inquiry |
| [04-employee-dashboard.md](./04-employee-dashboard.md) | Proposed `/app` dashboard hierarchy (data-honest) |
| [05-design-system.md](./05-design-system.md) | Internal design-system specification |
| [06-page-principles-and-roadmap.md](./06-page-principles-and-roadmap.md) | Per-page principles + phased rollout |
| [07-risks-and-owner-decisions.md](./07-risks-and-owner-decisions.md) | Risks, migration, decisions needing owner review |
| [mockups/](./mockups/) | Desktop/mobile wireframe concepts (non-implemented) |
| [screenshots/](./screenshots/) | Authorized captures when available |

## Explicit non-goals (this phase)

- No Production behavior changes, merges, or deployments
- No Vercel Preview
- No changes to intake, Event Planner 3.5.0, pricing, quotes, bookings, availability, hours, permissions, email, payments
- No public landing / public inquiry redesign
- No WordPress plugin / Scenario Lab changes
- No individual page redesign implementations yet (foundation only)

## Recommended next phase

**Phase 12C:** Shared application shell (sidebar + top bar), permission-aware nav, and employee homepage dashboard — without rewriting inquiry/booking domain logic.
