# ADR-003 — MagicCRM security groups and permissions

## Status

Accepted

## Context

Clerk authenticates employees and tracks organization membership. Fun-center tenants need their own groupings (Front Desk, Event Sales, custom teams) with fine-grained capabilities. Clerk org admin/member is too coarse and is not portable to MagicCRM’s product model.

## Decision

MagicCRM owns tenant RBAC:

- `PermissionDefinition` — platform catalog
- `SecurityGroup` — tenant-defined groups
- `SecurityGroupPermission` — normalized assignments
- `SecurityGroupMember` — same-tenant membership

Effective permissions are the union of all groups for the UserProfile.

A protected system group **Administrators** is the tenant-admin path. At least one member must remain. Clerk org admin is used only to bootstrap that group when it is empty.

`RequestContext` stays identity/tenant. Authorization is `requirePermission(ctx, permission)` against the MagicCRM database.

## Alternatives considered

### Clerk roles only

Rejected. Clients must create their own groups. Clerk roles are not the product authorization model.

### Hard-coded roles

Rejected. Tenants differ. Custom groups are required.

### Permission JSON on UserProfile

Rejected. Hard to query, audit, and keep tenant-safe. Normalized relations are the source of truth.

### One role per employee

Rejected. Employees often need a union of groups (Front Desk + Operations).

### Direct permissions per user

Rejected. Group-based administration matches how fun centers staff. Direct per-user grants can be added later if needed.

## Consequences

- Schema adds composite same-tenant FKs for membership.
- Provisioning must create default groups idempotently.
- Existing tenants are backfilled with default groups; admin membership is bootstrapped only when Administrators is empty and the actor is a Clerk org admin, or via the explicit CLI.
