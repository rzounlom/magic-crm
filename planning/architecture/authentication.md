# Authentication (implementation)

This document describes how MagicCRM currently authenticates employees. Tenant mapping lives in [`multi-tenancy.md`](./multi-tenancy.md).

## Responsibilities

### Clerk owns

- Identity and sessions
- Sign-in / sign-up
- Organization membership
- Active organization selection / switching
- Organization invitations (later)

### MagicCRM owns

- Internal `Organization`, `Location`, and `UserProfile` records
- Trusted `RequestContext`
- Tenant-scoped repositories
- Future Security Groups and permissions (Phase 2B)
- Future commercial entitlements

Clerk organization admin/member roles are only for Clerk-side organization administration. They are not MagicCRM’s permission model.

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

Personal Clerk accounts cannot use the employee app. The user must choose or create a Clerk Organization (`OrganizationSwitcher` uses `hidePersonal`).

Provisioning reads only the Clerk session (`userId`, `orgId`, `orgSlug`). It does not call Clerk’s HTTP API on each request. Organization display names are refined later if needed.

## Initial tenant administration

The first user who creates a Clerk Organization is a Clerk organization admin. That is enough for Clerk-side invites and switching.

Phase 2B will introduce MagicCRM Security Groups. Do not add a `role` field to `UserProfile` as a shortcut.
