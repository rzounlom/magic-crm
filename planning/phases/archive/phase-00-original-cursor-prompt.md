# Cursor Prompt — MagicCRM Phase 0 (Tenant-First SaaS)

Read these files completely before making any change:

- `MAGICCRM_PRD.md`
- `MAGICCRM_CURSOR_RULES.md`
- `MAGICCRM_SAAS_ARCHITECTURE_ADDENDUM.md`

The SaaS addendum overrides any earlier assumption that MagicCRM is a single-tenant application.

## Product assumption

Generations Adventureplex is the first MagicCRM tenant.

It MUST be represented as normal configurable organization data.

Do not hard-code Generations-specific behavior.

MagicCRM must eventually onboard independent fun centers, each with:

- its own organization
- locations
- users
- security groups
- permissions
- catalog
- resources/inventory
- customers
- payments/integrations
- AI agent configuration

## Phase 0 objective

Build ONLY the architectural foundation.

Do NOT implement:

- CRM features
- catalog features
- booking
- inventory
- payments
- AI
- POS
- dynamic security-group administration

## Stack

- Next.js App Router
- TypeScript strict
- Prisma
- Neon PostgreSQL
- Clerk
- Zod
- Vitest
- Playwright
- Vercel-compatible

## Initial database models

Implement only the minimal tenancy/auth foundation:

### Organization

- id
- clerkOrganizationId unique
- name
- slug
- timezone
- currency
- createdAt
- updatedAt

### Location

- id
- organizationId
- name
- slug
- timezone
- active
- createdAt
- updatedAt

Use tenant-safe compound uniqueness where appropriate.

### UserProfile

- id
- clerkUserId
- organizationId
- defaultLocationId nullable
- platformRole nullable
- createdAt
- updatedAt

Do NOT implement one global `role` field intended to become the tenant authorization system.

Tenant security groups will be implemented in Phase 1B.

## Auth architecture

Enable/use Clerk Organizations.

Create a documented mapping:

```text
Clerk Organization
      |
      v
MagicCRM Organization
```

Authentication and membership come from Clerk.

Fine-grained module permissions will come from MagicCRM's database in Phase 1B.

Create a server-side trusted request-context boundary that can later resolve:

```ts
type RequestContext = {
  userId: string;
  clerkUserId: string;
  organizationId: string;
  clerkOrganizationId: string;
  locationId?: string;
};
```

Do not accept `organizationId` from client input as authorization.

## Repository/API rule

Create patterns that make tenant-unscoped access visibly abnormal.

Document examples such as:

```ts
getCustomer(ctx, customerId);
```

not:

```ts
getCustomer(customerId, organizationIdFromRequestBody);
```

Do not implement Customer yet.

## Module entitlement architecture

MagicCRM will eventually be sold as modular SaaS.

Do NOT implement billing or plan logic in Phase 0.

Establish a clean future boundary between organization entitlement and user permission.

Define stable feature keys such as:

```ts
type FeatureKey =
  | "CORE_CRM"
  | "EVENT_BOOKING"
  | "ONLINE_BOOKING"
  | "POS"
  | "OPERATIONS"
  | "COMMUNICATIONS"
  | "AI_SALES_AGENT"
  | "ADVANCED_ANALYTICS"
  | "MULTI_LOCATION"
  | "SSO";
```

Do not create `if (plan === "pro")` style architecture.

Document this decision in the architecture ADRs.

Phase 0 may include a typed feature-key definition and an inert entitlement-policy interface, but must NOT add subscription tables, Stripe Billing, pricing plans, trials, or module-management UI yet.

Future expectation:

```ts
await requireEntitlement(ctx, "AI_SALES_AGENT");
await requirePermission(ctx, "ai.manage");
```

The tenant administrator controls permissions/security groups.

The MagicCRM platform/billing layer controls organization entitlements.

## UI

Create a clean authenticated employee shell.

Organization name and active location should have placeholders/resolved context appropriate for Phase 0.

Navigation may contain disabled placeholders for future modules.

UI should use the MagicCRM design direction:

- deep slate/navy
- calm blue
- neutral backgrounds
- accessible typography
- restrained border/shadow
- very obvious information hierarchy

No generic Bootstrap/admin-template appearance.

## Security

Tests must include:

1. employee app requires authentication
2. missing active organization fails closed
3. mismatched MagicCRM/Clerk organization context fails closed where testable
4. database credentials are server-only
5. organization identifiers are not trusted from arbitrary client form payloads

Add an ADR:

`docs/architecture/ADR-002-multi-tenancy.md`

Document:

- tenant-first architecture
- Generations = tenant #1
- shared tenant-scoped PostgreSQL initially
- why security groups will live in MagicCRM DB rather than relying entirely on Clerk roles
- possibility of dedicated Neon tenant databases later
- tenant integration isolation
- platform staff vs tenant staff separation

## Deferred intentionally

Do not install or implement:

- Stripe
- Stripe Connect
- OpenAI
- QStash
- email provider
- security group UI
- full permission engine

Only add interfaces/placeholders if absolutely necessary to prevent architectural coupling.

## Completion

Return:

1. Files changed
2. Implementation summary
3. Multi-tenant architecture decisions
4. Tests added
5. Validation commands/results
6. Security considerations
7. Risks & concerns
8. Explicitly deferred work
9. Phase 1 handoff notes

If any existing code conflicts with tenant isolation, identify it rather than hiding the conflict behind a shortcut.
