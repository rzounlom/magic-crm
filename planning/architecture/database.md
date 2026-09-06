# Database architecture (implementation)

This document describes how MagicCRM currently persists data. The product source of truth remains [`MAGICCRM_SAAS_ARCHITECTURE.md`](./MAGICCRM_SAAS_ARCHITECTURE.md).

## Engine

- **Database:** Neon PostgreSQL
- **ORM:** Prisma **7.10.0** (`prisma` and `@prisma/client` must stay aligned)
- **Runtime adapter:** `@prisma/adapter-neon@7.10.0` (Neon serverless driver, Node.js runtime)
- **Node:** 24.4.1 is the development runtime (Prisma 7.10 requires `^20.19 || ^22.12 || >=24.0`)

Prisma 8 was available only as a release candidate when this foundation was written. It was not selected.

## Connection architecture

Prisma 7 no longer puts `url` / `directUrl` in `schema.prisma`. Connections are split:

| Variable | Used by | Neon endpoint |
| --- | --- | --- |
| `DATABASE_URL` | Next.js runtime via `src/lib/db` | Pooled (`-pooler`) |
| `DIRECT_URL` | Prisma CLI via `prisma.config.ts` | Direct / unpooled |

`DATABASE_URL` is validated by `@/lib/env` and must never be read as `process.env.DATABASE_URL` throughout application code.

`DIRECT_URL` is required for any Prisma command that can connect to or change a database, including:

- `pnpm db:migrate` (`prisma migrate dev`)
- `pnpm db:deploy` (`prisma migrate deploy`)
- `pnpm db:studio`
- `prisma migrate status`
- introspection (`prisma db pull`) and other administrative CLI work

Those commands **fail closed** if `DIRECT_URL` is missing or is the config-parse placeholder. They never silently fall back to localhost.

`pnpm db:validate` and `pnpm db:generate` do not connect. Prisma 7 still requires `datasource.url` while loading `prisma.config.ts`, so those schema-only commands may use an explicit unused placeholder (`postgresql://127.0.0.1:5432/magiccrm_prisma_config_placeholder`). That value is rejected for every connecting command.

Do not hardcode Neon hostnames or credentials. Do not commit `.env` or `.env.local`.

## Prisma Client

- Schema: `prisma/schema.prisma`
- Config: `prisma.config.ts`
- Migrations: `prisma/migrations/`
- Generated client output: `src/generated/prisma` (gitignored; create with `pnpm db:generate`)
- Runtime singleton: `src/lib/db` (`server-only`, reused across Next.js hot reloads)

The application uses the Node/server runtime. Edge runtime is not required for this adapter setup.

Prisma Studio is privileged developer/admin tooling. Treat it like production database access.

## ID strategy

Foundational models use Prisma `cuid(2)` string IDs. They are not sequential and are difficult to enumerate. Tenant isolation still must not depend on obscure IDs — every tenant query also constrains `organizationId`.

## Inquiry date fields

`Inquiry.desiredDate` is a calendar date (`@db.Date`). `Inquiry.desiredStartTime` is a wall-clock string. Together they are event-local, not UTC instants. Employee UI must format them without timezone-shifting the chosen day or hour.

`createdAt` / `updatedAt` (and similar audit timestamps) are UTC instants and should be shown in `Organization.timezone`.

## Currency

`Organization.currency` is an ISO 4217 code (`CHAR(3)`). Future money columns must store integer minor units. Never use floating-point types for money.

## Deletion / referential integrity

Organization deletion does **not** cascade to locations, user profiles, or future business records.

| Relation | `onDelete` | Why |
| --- | --- | --- |
| `Location.organization` | `Restrict` | Deleting a tenant must not erase locations or later customers/events/payments. |
| `UserProfile.organization` | `Restrict` | Same — business and audit data must not disappear accidentally. |
| `UserProfile.defaultLocation` | `Restrict` | A location cannot be deleted while any same-tenant profile still points at it. |
| `SecurityGroup.organization` | `Restrict` | Tenant delete must not erase authorization graph accidentally. |
| `AuditLog.organization` | `Restrict` | Audit history is preserved. |
| `TeamInvitation.organization` | `Restrict` | Invitation history is preserved with the tenant. |
| `TeamInvitationSecurityGroup.invitation` | `Cascade` | Invitation delete removes queued groups. |
| `TeamInvitationSecurityGroup.securityGroup` | `Restrict` | A group cannot disappear out from under a queued assignment without application handling. |
| `Inquiry.organization` / `Conversation.organization` / `ConversationMessage.organization` | `Restrict` | Leads and threads stay with the tenant. |
| `Conversation.inquiry` | `Restrict` | Deleting an inquiry must be an explicit application action. |
| `ConversationMessage.conversation` | `Cascade` | Message history is owned by the conversation only. |
| `SalesKnowledgeItem.organization` | `Restrict` | Temporary AI knowledge is tenant-owned. |
| `AiUsage.organization` / `AiUsage.inquiry` | `Restrict` | Usage metadata is retained for later pricing analysis. |
| `SecurityGroupPermission.securityGroup` | `Cascade` | Group delete removes assignments. |
| `SecurityGroupMember.securityGroup` | `Cascade` | Group delete removes memberships. |
| `SecurityGroupMember.userProfile` | `Cascade` | Profile delete removes memberships only. |
| `SecurityGroupPermission.permissionDefinition` | `Restrict` | Deactivate catalog keys instead of deleting them. |

### Same-tenant default location

`UserProfile.defaultLocationId` must not point at another organization's location.

The database enforces this with:

1. A candidate unique key on `locations (organizationId, id)`
2. A composite foreign key:

```text
user_profiles (organizationId, defaultLocationId)
    → locations (organizationId, id)
```

`defaultLocationId` remains nullable. When it is null, PostgreSQL MATCH SIMPLE does not apply the composite FK (the profile still belongs to its organization via the organization Restrict FK).

Delete behavior is `ON DELETE RESTRICT` in both Prisma 7.10 and PostgreSQL. That avoids schema drift: Prisma cannot represent PostgreSQL 15 column-subset `SET NULL ("defaultLocationId")` without either warning or nulling `organizationId`.

A future location-delete application service must, in one transaction:

1. Clear `defaultLocationId` on UserProfiles in that organization that reference the location
2. Delete the location

That service is not implemented in this foundation. There is no `db:reset` script.

## Indexing

- `Organization.slug` unique globally
- `Organization.clerkOrganizationId` unique, nullable
- `Location` unique on `(organizationId, slug)` — tenant-scoped, not global
- `Location` unique on `(organizationId, id)` — candidate key for same-tenant default-location FK
- `Location` indexes: `(organizationId)`, `(organizationId, active)`
- `UserProfile` unique on `(organizationId, clerkUserId)` — one Clerk user may belong to many tenants
- `UserProfile` unique on `(organizationId, id)` — candidate key for same-tenant security-group membership
- `UserProfile` indexes: `(organizationId)`, `(organizationId, defaultLocationId)`, `(clerkUserId)`
- `UserProfile.email` is nullable and **not** unique — display snapshot only
- `SecurityGroup` unique on `(organizationId, name)` and `(organizationId, systemKey)`
- `SecurityGroupMember` unique on `(securityGroupId, userProfileId)` with composite same-tenant FKs
- `SecurityGroupPermission` unique on `(securityGroupId, permissionDefinitionId)`
- `TeamInvitation` unique on `clerkOrganizationInvitationId`; pending unique on `(organizationId, emailNormalized)` via a partial SQL index
- `TeamInvitationSecurityGroup` unique on `(teamInvitationId, securityGroupId)` with same-tenant composite FKs
- `Organization.onboardingStatus` indexed for platform recovery
- `Inquiry` unique on `(organizationId, id)`; indexes `(organizationId, status, createdAt)` and `(organizationId, customerEmailNormalized)`
- `Conversation` unique on `publicTokenHash` and `(organizationId, id)`
- `ConversationMessage` unique on `(conversationId, clientSubmissionId)` for idempotent public submits
- `SalesKnowledgeItem` unique on `(organizationId, id)`; index `(organizationId, active, type)`
- `AiUsage` indexed on `(organizationId, createdAt)`

Future tenant tables should lead compound indexes with `organizationId`.

## Migration workflow

Development (requires `DIRECT_URL`):

```bash
pnpm db:migrate
```

Production / CI apply-only:

```bash
pnpm db:deploy
```

Review every generated SQL file before applying.

Committed migrations:

- `20260830200000_tenant_foundation` — Organization, Location, UserProfile
- `20260830220000_user_profile_default_location_same_tenant` — same-tenant default location FK
- `20260830221500_user_profile_default_location_restrict` — composite FK `ON DELETE RESTRICT`
- `20260830223000_user_profile_org_membership` — UserProfile unique on `(organizationId, clerkUserId)`
- `20260831051500_security_groups_and_audit` — PermissionDefinition, SecurityGroup, membership, AuditLog
- `20260831060000_user_profile_identity_display` — UserProfile name/email/avatar display snapshot
- `20260902070000_team_invitations_and_onboarding` — TeamInvitation, queued groups, Organization.onboardingStatus
- `20260906140000_ai_intake_sales_agent` — Inquiry, Conversation, ConversationMessage, SalesKnowledgeItem, AiUsage

## Seed / reference data

Schema lives in Prisma migrations. Permission catalog rows are application reference data, not migration SQL.

```bash
pnpm db:sync-auth
```

That command upserts `PermissionDefinition` rows from `PERMISSION_CATALOG` and ensures default security groups for every existing organization. It does not reset tenant data. Removed catalog keys are marked inactive, never deleted.

There is no generic seed that creates a special-cased tenant. Production startup must never depend on seed execution.

`pnpm tenant:import-sales-knowledge -- --slug <slug> --confirm IMPORT` is a development-only, idempotent helper for the named tenant. It does not run during provisioning and does not hardcode Generations into application defaults.

Future development seeds should use generic names such as “MagicCRM Development Organization” / “Main Location”. Generations Adventureplex configuration belongs in tenant data, not in application code.

## Testing

Unit tests cover environment validation, feature keys, request-context mapping, and tenant-scoped repository query behavior.

Integration tests run only against the dedicated Neon TEST database (`pnpm test:db:prepare` then `pnpm test:integration`). See [`../testing/database-integration-strategy.md`](../testing/database-integration-strategy.md). Never point automated tests at production or a developer’s normal Neon branch.

## Future scaling

Shared tenant-scoped PostgreSQL is the initial topology. Repository/service boundaries keep storage topology out of domain logic so a later dedicated-database option for selected enterprise tenants remains possible without rewriting features.
