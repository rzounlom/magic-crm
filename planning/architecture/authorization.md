# Authorization (implementation)

This document describes MagicCRM tenant authorization. Authentication and membership remain in [`authentication.md`](./authentication.md) and [`multi-tenancy.md`](./multi-tenancy.md).

## Boundaries

| Concern | Owner |
| --- | --- |
| Who is this person? | Clerk |
| Which organizations do they belong to? | Clerk Organizations |
| What may they do inside this MagicCRM organization? | MagicCRM Security Groups |
| Does the organization have the commercial module? | Future entitlements (not this phase) |

Clerk organization admin/member is not MagicCRM authorization. After an Administrators membership exists, `requirePermission()` reads only MagicCRM database state.

`UserProfile` may store a Clerk identity **display snapshot** (name, email, avatar). That data is for administration labels only. It is not a permission, role, or tenant-membership signal. See [`authentication.md`](./authentication.md).

## Models

- `PermissionDefinition` — platform-owned catalog. Tenants cannot create keys.
- `SecurityGroup` — tenant-owned, unique name per organization. `systemKey` identifies default templates.
- `SecurityGroupPermission` — group to catalog permission. Duplicate assignments are unique-constrained.
- `SecurityGroupMember` — same-tenant composite FKs: `(organizationId, securityGroupId)` and `(organizationId, userProfileId)`.
- `AuditLog` — append-only tenant-scoped security administration events. No tenant edit path.

Organization deletion does not cascade to security groups or audit logs (`Restrict`). Deleting a security group cascades its permissions and members. Deleting a UserProfile cascades that profile’s memberships. Permission definitions are `Restrict` (deactivate instead of delete).

## RequestContext

`RequestContext` remains identity and tenant only. It does not embed permissions.

Effective permissions are resolved per request by `getEffectivePermissions(ctx)` as the **union** of every SecurityGroup the UserProfile belongs to. A WeakMap memoizes that set on the `ctx` object for the rest of the request. There is no Redis/cross-request cache.

## requirePermission

```ts
await requirePermission(ctx, PERMISSIONS.SECURITY_GROUPS_MANAGE, db);
```

Missing permission throws `AuthorizationError("FORBIDDEN")` with user copy: “You don't have permission to perform this action.” UI hiding is not authorization. Mutations use `requirePermission()`.

## System groups

Default groups from `DEFAULT_SECURITY_GROUPS`:

| Group | Purpose |
| --- | --- |
| Administrators | All tenant permissions. Cannot be deleted or renamed. Last member cannot be removed. Required admin permissions cannot be stripped. |
| Event Sales | Customers, inquiries, events, calendar, communications |
| Front Desk | POS, customer lookup, limited events, collect payments |
| Operations | Events, calendar, waivers, inventory view |
| Accounting / Managers | Payments, refunds, reports |

Non-administrator system groups cannot be deleted. Their permissions and membership can be edited.

## Last administrator

Each organization must keep at least one `SecurityGroupMember` on the Administrators system group. Removing the last member fails with `LAST_ADMIN_REQUIRED`. The removal runs in a transaction that locks the group row (`SELECT … FOR UPDATE`) before counting members.

## Bootstrap

**New tenants:** the user who first provisions the organization is added to Administrators.

**Existing tenants:** default groups are created idempotently on provision / `pnpm db:sync-auth`. If Administrators has zero members, the current user is added only when they are a Clerk organization admin (`org:admin`). Invited members are not auto-elevated.

Clerk organization admin is **not** permanent MagicCRM authorization. After Administrators has at least one member, later Clerk admins do not become MagicCRM Administrators automatically. An existing MagicCRM Administrator can add any same-tenant UserProfile to Administrators regardless of that person’s Clerk role.

Recovery CLI (explicit IDs only):

```bash
pnpm auth:bootstrap-admin -- --organization-id <id> --user-profile-id <id>
```

## Reference data vs schema

Schema lives in Prisma migrations. Permission catalog rows are application reference data, synced by `syncPermissionDefinitions()` / `pnpm db:sync-auth`. Removed keys are marked inactive, never deleted.
