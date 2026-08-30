# Multi-tenancy (implementation)

This document describes how the current codebase implements the decisions in [`MAGICCRM_SAAS_ARCHITECTURE.md`](./MAGICCRM_SAAS_ARCHITECTURE.md). It does not replace that source of truth.

## Current model

```text
Organization  = tenant
Location      belongs to Organization
UserProfile   belongs to Organization
```

Generations Adventureplex is tenant #1. It is never a code-level special case. No `if (organization === "Generations")` logic is permitted.

## Scoping rules

- Every future tenant-owned record carries `organizationId`.
- Every appropriate location-owned record also carries `locationId`.
- Location slugs are unique per organization (`organizationId + slug`), not globally.
- `UserProfile.defaultLocationId`, when set, must reference a Location in the **same** organization. The database enforces this with a composite foreign key on `(organizationId, defaultLocationId)` and `ON DELETE RESTRICT`.
- Browser-provided `organizationId` is never authorization.

## Trusted RequestContext

`src/server/request-context.ts` defines:

```ts
type RequestContext = {
  userId: string;
  organizationId: string;
  locationId?: string;
};
```

RequestContext values must eventually be derived from trusted authenticated server state:

```text
Authenticated user
        ↓
Trusted server authentication (Clerk — not implemented yet)
        ↓
Active Clerk organization
        ↓
MagicCRM Organization mapping
        ↓
Trusted RequestContext
        ↓
Services / repositories
```

There is no `getRequestContext()` in this phase. Cookies, query parameters, headers, and form fields must not be used to invent tenant identity.

## Repository rule

Tenant-facing lookups include organization scope in the database query itself.

```ts
locationRepository.findById({
  organizationId: ctx.organizationId,
  locationId,
});
```

The query is `WHERE id = $locationId AND organizationId = $organizationId`.

Do not fetch by ID and compare organization afterward. If Tenant A knows Tenant B’s location ID, the lookup must return the same “unavailable” result as a missing row. Isolation does not depend on obscure IDs.

`src/server/repositories/*` implement this pattern for Organization, Location, and UserProfile.

## Platform staff vs tenant employees

`platformRole` is **not** on `UserProfile`.

Platform employees (MagicCRM staff) and tenant employees are different authorization planes. Putting a platform role on the tenant profile would mix those planes and encourage treating support staff as tenant members.

Platform roles belong in a later platform-identity design. Tenant employee authorization will use Security Groups (`PermissionDefinition`, `SecurityGroup`, `SecurityGroupPermission`, `SecurityGroupMember`) — also not implemented yet. `UserProfile` therefore has no `role` field.

## Entitlements vs permissions

Stable feature keys live in `src/types/feature-keys.ts`. They are module identifiers, not pricing plans.

`src/server/policies/entitlements.ts` is a typed boundary for a future `requireEntitlement(...)`. This phase does not store entitlements, evaluate them, or map Starter/Pro/Premium/Enterprise plans.

## Clerk mapping placeholders

- `Organization.clerkOrganizationId` — nullable, unique
- `UserProfile.clerkUserId` — nullable, unique

These exist so Phase 2 can map Clerk Organizations and users. They are not populated in this phase.

## Storage topology

One shared Neon PostgreSQL database with tenant-scoped rows. See [`database.md`](./database.md) and [`../decisions/ADR-001-database-and-multi-tenancy.md`](../decisions/ADR-001-database-and-multi-tenancy.md).
