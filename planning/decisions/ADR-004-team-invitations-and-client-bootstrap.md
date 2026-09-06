# ADR-004 — Team invitations and client bootstrap

## Status

Accepted

## Context

Phase 2B gave tenants Security Groups. Tenants still could not invite employees through MagicCRM, and new clients still depended on someone creating a Clerk Organization by hand. The first MagicCRM Administrator for a brand-new client could be “whoever with `org:admin` hits `/app` first.”

Clerk already owns Organization invitations and membership. MagicCRM must not create fake UserProfiles before a person exists as a Clerk member.

## Decision

### Clerk owns invitations and membership

Employee invites call Clerk’s Backend Organization Invitation API (`createOrganizationInvitation`, `revokeOrganizationInvitation`) with the **current** `clerkOrganizationId` from trusted `RequestContext`. Normal invites use Clerk role `org:member`. There is no resend endpoint in the installed SDK; “Send new invitation” revokes then creates.

### MagicCRM owns invitation intent

`TeamInvitation` stores email (normalized for lookup, original for display), inviter, expiration, status, Clerk invitation id, optional `firstAdminIntent`, and queued groups via `TeamInvitationSecurityGroup`. Email is not unique globally and is not authorization.

No UserProfile is created at invite time. Queued groups apply on first `/app` visit after Clerk membership exists, inside a transaction that locks the invitation row.

Local `TeamInvitation.status` is a workflow cache, not an indefinitely authoritative copy of Clerk. Team invitation administration reconciles current-tenant pending rows from Clerk (`getOrganizationInvitationList` / `getOrganizationInvitation`) before display and before revoke/send-new. Reconciliation updates status only. It is not an authorization path and does not apply queued Security Groups.

### First-admin explicit assignment

`createClientTenant` is platform-internal. It creates the Clerk Organization, MagicCRM tenant, default groups, and a `TeamInvitation` whose `firstAdminIntent` queues Administrators. The preferred future customer flow is platform create → admin invited → admin accepts → Administrators applied → tenant self-manages Team.

The empty-Administrators + Clerk `org:admin` bootstrap remains only as recovery for legacy/development tenants.

### Partial external-system failure

Clerk and PostgreSQL are not one transaction. Idempotency is: reuse Clerk orgs tagged for MagicCRM onboarding, reuse MagicCRM rows by slug, resume a missing first-admin invitation, and compensate-revoke a Clerk invitation if the MagicCRM insert fails.

## Alternatives considered

### Create a placeholder UserProfile at invite time

Rejected. There is no Clerk user yet. A fake profile would collide with later provisioning and confuse membership.

### Authorize Team with Clerk `org:admin`

Rejected. MagicCRM permissions (`users.view` / `users.manage`) are the product authorization model.

### Invite as Clerk `org:admin` from the employee UI

Rejected. Tenant admins must not accidentally grant Clerk organization admin. MagicCRM groups grant application access.

### Trust a form email to mark an invitation accepted

Rejected. Acceptance uses server-side Clerk `currentUser()` emails plus current Organization membership.

## Consequences

- Schema adds `TeamInvitation`, queued group assignments, and `Organization.onboardingStatus`.
- Tests inject an `OrganizationDirectory` fake; they do not call live Clerk.
- Platform client creation is a CLI (`pnpm tenant:create`) until a platform-admin console exists.
