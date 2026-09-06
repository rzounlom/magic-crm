# Team management (implementation)

This document describes employee administration inside a MagicCRM tenant. Authentication remains in [`authentication.md`](./authentication.md). Authorization remains in [`authorization.md`](./authorization.md).

## Boundaries

| Concern | Owner |
| --- | --- |
| Account identity, sessions, Organization membership | Clerk |
| Organization invitations (email, accept/revoke, expiration) | Clerk |
| Whether a tenant admin may invite or view Team | MagicCRM `users.view` / `users.manage` |
| Invitation intent, queued Security Groups, first-admin intent | MagicCRM `TeamInvitation` |
| Application access after the invitee signs in | MagicCRM Security Groups |

Clerk `org:admin` is not Team authorization. Server actions use `getRequestContext()` and `requirePermission()`.

## UI

`/app/admin/team` lists employees. `/app/admin/team/invitations` lists pending invitations. `/app/admin/team/invite` sends an invitation.

The Team header link renders only when the current user has `users.view`. Direct route access enforces the same permission.

Normal invites always create a Clerk Organization invitation with role `org:member`. The invite UI does not expose Clerk roles.

## Invitation lifecycle

```text
MagicCRM invitation
        ↓
Clerk email
        ↓
Clerk authentication
        ↓
Clerk Organization membership
        ↓
automatic MagicCRM return (${APP_URL}/accept-invitation)
        ↓
UserProfile provisioning
        ↓
queued Security Group assignment
        ↓
invitation accepted
```

`createOrganizationInvitation` includes `redirectUrl` built from trusted server `APP_URL` plus `/accept-invitation`. That is required so Clerk does not finish the flow on `accounts.dev/default-redirect`. See [`authentication.md`](./authentication.md).

Clerk is authoritative for whether the external Organization invitation is pending, accepted, revoked, or expired. MagicCRM persists local workflow status (`TeamInvitation.status`) plus queued groups and `firstAdminIntent`. That local status is not assumed to stay correct forever.

## Reconciliation

Opening `/app/admin/team/invitations` and running Revoke / Send new invitation reconciles **current-tenant** `PENDING` rows against one Clerk Organization invitation list (plus a get-by-id fallback). Stale rows are updated and audited (`employee.invitation_reconciled`).

| Clerk fact | Local status |
| --- | --- |
| pending | PENDING |
| accepted | ACCEPTED |
| revoked | REVOKED |
| expired | EXPIRED |
| missing + current-org member | ACCEPTED |
| missing + not a member | EXPIRED |

Reconciliation never applies queued Security Groups. `ACCEPTED` with `acceptedAt` still null means Clerk accepted the invitation, but the invitee has not completed trusted `/app` provisioning. Groups still apply only on that path.

External Clerk Dashboard changes (revoke, accept) are healed the next time Team invitation administration runs. Deleting a Clerk user does **not** delete MagicCRM `UserProfile`, `TeamInvitation`, or audit history, and does not reuse or re-apply an old invitation.

Employee offboarding (removing membership from MagicCRM) remains deferred.

## Invitation matching

MagicCRM does **not** trust a browser-submitted email to mark an invitation accepted.

After the invitee accepts Clerk’s invitation and visits `/app`:

1. `ensureProvisionedTenant()` creates the UserProfile if needed.
2. MagicCRM reads **primary and verified** emails from `currentUser()` on the server.
3. It finds `TeamInvitation` rows in the **current** `organizationId` with status `PENDING` whose `emailNormalized` is in that set.
4. It locks each row (`SELECT … FOR UPDATE`), applies queued groups once, and marks the invitation `ACCEPTED`.

Clerk invitation IDs are stored for revoke/audit. Clerk’s Backend API in this SDK version has no invitation-id field on the session after accept, so email matching inside the current Organization is the acceptance key. Risks: a user whose verified email set is incomplete will not match until identity is complete; an unverified email is ignored. Email is never authorization by itself — Organization membership from the Clerk session is required.

## Duplicate and existing-member handling

A partial unique index allows only one `PENDING` invitation per `(organizationId, emailNormalized)`. The same email may be invited to other Organizations.

If the email is already a member of **this** Clerk Organization / MagicCRM tenant, invite fails with: “This person is already a member of this organization.” Membership in other tenants is not disclosed.

There is no Clerk “resend” API in the installed Backend SDK. The UI action is **Send new invitation**: reconcile the old row, revoke the previous Clerk invitation when it is still pending, then create a new one. If the old Clerk invitation is already accepted/revoked/expired/missing, MagicCRM does not fail the replace solely because revoke is impossible. If the email is an **active member of the current Clerk Organization**, send-new returns “This person is already a member of this organization.” and does not create another invitation. A leftover `UserProfile` after Clerk user deletion is not treated as active membership.

## Employee removal

Removing an existing employee from the Clerk Organization is **deferred**. Invitation revoke is implemented.

## Related

- [`client-onboarding.md`](./client-onboarding.md)
- [`authorization.md`](./authorization.md)
