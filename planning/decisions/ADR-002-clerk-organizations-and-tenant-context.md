# ADR-002 — Clerk Organizations and tenant context

## Status

Accepted

## Context

MagicCRM is a multi-tenant SaaS product. Employees need authenticated identity, organization membership, and a trusted server-side tenant context before any CRM or booking work.

## Decision

- Clerk supplies identity, sessions, organization membership, and the active organization.
- MagicCRM maps `Organization.clerkOrganizationId` to an internal Organization.
- `UserProfile` is a per-organization membership: unique on `(organizationId, clerkUserId)`.
- `getRequestContext()` derives tenant scope from trusted Clerk auth plus those mappings.
- MagicCRM will own fine-grained authorization later (Security Groups). Clerk roles are not that system.

## Alternatives considered

### Browser-selected tenant IDs

Rejected. Query params, headers, and client state are not authorization.

### Clerk roles as the full permission system

Rejected. Fun-center staff need tenant-defined groups (Front Desk, Event Sales, etc.). Clerk org admin/member is too coarse and not portable.

### One Clerk user per tenant

Rejected. The same person may work at more than one fun center or switch between a demo tenant and a customer tenant.

### Custom authentication

Rejected. Clerk already provides sessions, organizations, and invitations. Building that in Phase 2 would delay a trustworthy tenant boundary.

## Consequences

- Schema no longer treats `clerkUserId` as globally unique.
- Provisioning must be idempotent and race-safe.
- Integration tests inject trusted Clerk auth and use a dedicated test database.
