# MagicCRM Design North Star

**Status:** Future product-wide design direction. Not an active implementation phase.  
**Scope:** Vision, principles, exploration tokens, and UX phase sequence only.  
**Do not implement from this document until an explicit UX phase is authorized.**

Related current implementation notes: [`ui-conventions.md`](./ui-conventions.md).  
Architecture invariant: MagicCRM owns engines; organizations own configuration. Generations Adventureplex is never a shared-component branding special case.

---

## Vision

Create a world-class, modern, intentional SaaS interface that combines:

1. **Airbnb-inspired UX and component quality** — generous spacing, refined cards, subtle surfaces, clear information hierarchy, approachable controls, effortless navigation, and exceptional responsive behavior.
2. **PayPal-inspired color language** — deep navy, trustworthy blues, clean whites, restrained neutrals, confident primary actions, and professional financial clarity.
3. **MagicCRM’s own identity** — premium, approachable, fast, intuitive, and built for event venues, entertainment businesses, and their customers.

These are **design references**, not instructions to reproduce proprietary logos, layouts, or components exactly. Do not copy Airbnb or PayPal branding or proprietary assets.

---

## Core principles

- Every screen should have an obvious purpose and primary action.
- Information should be easy to scan in seconds.
- Minimize visual noise without hiding essential functionality.
- Use whitespace intentionally.
- Use consistent spacing, typography, elevation, and corner radii.
- Prefer clear labels over decorative icons alone.
- Keep data-heavy CRM workflows efficient.
- Use responsive tables, drawers, cards, and navigation appropriate to each device.
- Ensure excellent keyboard accessibility, visible focus states, sufficient contrast, and reduced-motion support.
- Make customer-facing proposals feel premium and trustworthy.
- Make employee workflows fast, predictable, and forgiving.
- Design for mobile from the beginning.

---

## Proposed visual direction (exploration only)

Initial exploration tokens — **not approved final colors**:

| Token role | Exploration value |
|---|---|
| Deep navy | `#001C64` |
| Brand blue | `#003087` |
| Action blue | `#0070E0` |
| Soft canvas | `#F5F7FB` |
| White surfaces | `#FFFFFF` |

Use **semantic status colors separately** for success, warning, error, and informational states. Do not overload brand blues as status signals.

Organization / location branding remains tenant configuration. Shared MagicCRM shells and primitives must stay brand-neutral enough to host tenant identity without hardcoding Generations (or any other tenant) into shared components.

---

## Future implementation sequence

Do **not** auto-start these phases. Authorize each phase explicitly. Do **not** interrupt the scheduling/booking safety roadmap with redesign work.

### Phase UX1 — Design audit and information architecture

Inspect all current pages, components, workflows, responsive behaviors, and inconsistencies. Produce a prioritized redesign plan. **No broad code changes.**

### Phase UX2 — Design tokens and component system

Create a consistent reusable visual foundation using the existing Next.js, React, and Tailwind stack. Avoid unnecessary new dependencies.

### Phase UX3 — Navigation and application shell

Redesign desktop navigation, mobile navigation, page headers, content widths, and responsive layouts.

### Phase UX4 — Core staff workflows

Redesign dashboard, inquiries, CRM, booking calendar, proposals, and relevant operational screens.

### Phase UX5 — Customer-facing experiences

Redesign event intake, proposal review, booking requests, and future checkout flows.

### Phase UX6 — Mobile, accessibility, and visual quality assurance

Test across viewport sizes, interaction states, keyboard navigation, accessibility, and actual business workflows.

---

## Non-negotiables

- Tenant configuration and organization branding must remain supported.
- Never hardcode Generations branding into shared MagicCRM components.
- Do not change pricing, booking, tax, promotion, resource, or payment business logic during visual redesign phases.
- Do not introduce layout shifts or hydration regressions.
- Do not reduce data density where staff need efficient workflows.
- Do not copy Airbnb or PayPal branding or proprietary assets.
- Every redesigned page must pass responsive and accessibility review.
- Prefer polished, cohesive components over flashy animations.

---

## Separation from current roadmap

Current booking safety / scheduling work (for example R2D.*) proceeds independently.

This north star:

- Documents future UX direction only.
- Does not authorize UI implementation.
- Does not start UX1 automatically.
- Does not modify runtime application code by itself.
