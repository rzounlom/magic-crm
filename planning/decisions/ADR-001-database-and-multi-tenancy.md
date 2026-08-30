# ADR-001 — Database and multi-tenancy

## Status

Accepted

## Context

MagicCRM is a multi-tenant SaaS platform for fun centers. Generations Adventureplex is the first tenant, but the system must onboard additional organizations without redesigning persistence or domain logic.

The application needs an authoritative transactional store for customers, events, inventory, payments, and communications. Tenant isolation is a release blocker.

## Decision

Use **Neon PostgreSQL + Prisma 7** on a **shared tenant-scoped database**.

- One PostgreSQL database (initially one Neon project/branch per environment).
- Every tenant-owned row includes `organizationId`.
- Location-owned rows also include `locationId` where appropriate.
- Application repositories require trusted `organizationId` in tenant-facing queries.
- Runtime uses the Neon pooled connection (`DATABASE_URL`).
- Prisma CLI migrations and Studio use the direct connection (`DIRECT_URL`).

## Why

- Simpler Prisma migrations than database-per-tenant
- Simpler transactional workflows across related tenant records
- Easier reporting and operational queries
- Lower provisioning complexity while tenant count is modest
- Appropriate for the initial SaaS scale
- Repository/service boundaries keep storage topology out of domain code

## Risks

- Application bugs can cause cross-tenant access if a query omits `organizationId`
- Repository and service discipline is mandatory
- Tenant isolation tests are release blockers
- Shared-database noisy-neighbor and backup/restore blast radius grow with tenant count

## Future options

Selected enterprise customers could later use stronger isolation (dedicated Neon project or database) without rewriting domain logic, provided services continue to receive a trusted `RequestContext` and repositories never assume a single global database identity in business rules.

Database-per-tenant is explicitly out of scope for this foundation.
