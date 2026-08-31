# Authentication (implementation)

This document describes how MagicCRM currently authenticates employees. Tenant mapping lives in [`multi-tenancy.md`](./multi-tenancy.md).

## Responsibilities

### Clerk owns

- Identity and sessions
- Sign-in / sign-up
- Organization membership
- Active organization selection / switching
- Organization invitations

### MagicCRM owns

- Internal `Organization`, `Location`, and `UserProfile` records
- Trusted `RequestContext`
- Tenant-scoped repositories
- Future Security Groups and permissions (Phase 2B)
- Future commercial entitlements

Clerk organization admin/member roles are only for Clerk-side organization administration and a one-time MagicCRM Administrators bootstrap when that group is empty. They are not MagicCRM’s permission model. See [`authorization.md`](./authorization.md).

## Trust boundary

```text
Clerk session
        ↓
readTrustedClerkAuth()          trusted clerkUserId + clerkOrganizationId
        ↓
provisionOrganization()         idempotent MagicCRM records
        ↓
getRequestContext()             internal organizationId + userProfile id
        ↓
repositories                    SQL always includes organizationId
```

Browser-provided organization IDs, query params, headers, and form fields are never tenant authorization.

`clerkMiddleware()` in `src/proxy.ts` keeps the Clerk session available and requires a signed-in user for `/app`. Next.js middleware redirects must use an absolute sign-in URL. Middleware is not sufficient authorization. Server pages and services still resolve `RequestContext`.

If Clerk keys are missing (common on a first Vercel deploy), middleware must not crash. Public routes still render; `/app` redirects to sign-in. `src/proxy.ts` must not import `@/lib/env`, because that module requires `DATABASE_URL`.

Do not pass `secretKey` into `clerkMiddleware()` options. Clerk treats that as dynamic keys and then requires `CLERK_ENCRYPTION_KEY`. Let Clerk read keys from the environment.

## Employee routes

| Area | Auth |
| --- | --- |
| `/` | Public marketing/landing |
| `/sign-in`, `/sign-up` | Public Clerk screens |
| `/app` | Signed-in employee application |

Personal Clerk accounts cannot use the employee app. The user must have an active Clerk Organization (`OrganizationSwitcher` uses `hidePersonal`). Clerk 7.8.3 has no `hideCreateOrganization` prop. Employee UX hides the create action via the official `appearance.elements` API (`organizationSwitcherPopoverActionButton__createOrganization`). Tenant creation is Clerk Dashboard / platform-controlled. Membership and switching still use Clerk Organizations.

Provisioning reads only the Clerk session (`userId`, `orgId`, `orgSlug`). The session JWT does **not** include an organization display name, so first provision stores the slug as `Organization.name`. That is a later organization metadata synchronization concern. Do not add a Clerk HTTP call on every request. Do not add webhooks solely for cosmetic name sync.

## Employee identity display snapshot

Clerk remains the source of authentication identity. MagicCRM stores a small **display snapshot** on `UserProfile`:

- `firstName`, `lastName`, `displayName`, `email`, `avatarUrl`

This snapshot is for employee administration labels (Security Groups). It is **not** authorization. `clerkUserId` remains the external identity key. `email` is not unique and is never used as tenant authority.

When a UserProfile is created, or when an existing profile is missing `displayName` and `email`, the next authenticated `/app` visit reads the current Clerk user **once** (`currentUser()`) and persists the snapshot. That write updates **all** UserProfiles with the same `clerkUserId`, because name/email/avatar belong to the Clerk identity, not the tenant.

Security administration may also refresh missing snapshots for **other** employees in the current tenant. That path:

- loads UserProfiles in `RequestContext.organizationId` that are missing both `displayName` and `email`
- resolves those Clerk user IDs with Clerk’s batched backend `users.getUserList({ userId })` (up to 100 IDs per call)
- persists snapshots only onto UserProfiles in the current organization
- never accepts Clerk user IDs from the browser; IDs come from tenant-scoped PostgreSQL rows
- requires `users.manage` or `security_groups.manage`

After those fields are populated, Security Groups and other pages read PostgreSQL only. Do not call Clerk per employee while rendering a member list.

“Unknown employee” is a fallback when Clerk has no usable name/email for that user, or the identity provider lookup failed. Administrators can retry with **Refresh employee details**.

Future Clerk user-update webhooks may refresh this snapshot. They are not implemented in this patch.

## Manual browser verification (Phase 2)

Completed against Clerk development auth and the employee `/app` shell:

| Check | Result |
| --- | --- |
| Clerk sign-in | Passed |
| Authenticated `/app` access | Passed |
| Organization A provisioned | Passed |
| Organization B provisioned | Passed |
| Organization switching | Passed |
| Same Clerk user in both organizations | Passed |
| RequestContext follows the active Clerk organization | Passed |
| Refresh does not duplicate Organization / Location / UserProfile | Passed |
| Invited second user accepted access and signed in | Passed |
| Invited second user accessed the Generations organization | Passed |
| Invited second user did not see MagicCRM Test Center B | Passed |
| Invited second user could not switch to the second organization | Passed |

This invited-user check confirms Clerk organization membership isolation in the live employee UX. It supplements, and does not replace, the PostgreSQL tenant-isolation tests.

## Initial tenant administration

The first user who creates a Clerk Organization is a Clerk organization admin. That is enough for Clerk-side invites and switching.

Phase 2B will introduce MagicCRM Security Groups. Do not add a `role` field to `UserProfile` as a shortcut.
