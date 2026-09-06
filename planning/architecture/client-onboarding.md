# Client tenant onboarding (implementation)

Platform-internal provisioning of a new MagicCRM client. This is **not** a public self-service signup flow and is **not** exposed to tenant employees.

## Target future flow

```text
MagicCRM platform creates tenant
        ↓
first admin invited (explicit Administrators intent)
        ↓
first admin accepts Clerk invitation and signs into /app
        ↓
UserProfile provisioned
        ↓
Administrators assignment applied from TeamInvitation
        ↓
client admin self-manages employees from MagicCRM Team
```

Legacy / development tenants that were created by a person in the Clerk Dashboard still use the older recovery path: if Administrators is empty, the first provisioner who is a Clerk `org:admin` is bootstrapped. That race is **not** the preferred customer onboarding path.

## Service

`createClientTenant({ organizationName, adminEmail, timezone?, currency? })`

Orchestration:

1. Validate input.
2. Find or create a Clerk Organization (slug from the name). New Clerk orgs are tagged with private metadata `magiccrmClientOnboarding`.
3. Create or reuse the MagicCRM `Organization` (`onboardingStatus` starts `PROVISIONING`).
4. Create `Main Location` if missing.
5. Ensure default Security Groups and permission catalog rows.
6. Send a Clerk Organization invitation as `org:member` to the admin email, with the same trusted `${APP_URL}/accept-invitation` return URL as tenant employee invites.
7. Persist `TeamInvitation` with `firstAdminIntent` and queue the Administrators group.
8. Set `onboardingStatus` to `AWAITING_ADMIN`.
9. Audit `tenant.client_created`, `tenant.admin_invited`, `employee.invited`.

When the admin accepts and visits `/app`, queued Administrators membership is applied and status becomes `ACTIVE`. If Clerk accepts the invitation but the admin has not completed `/app` provisioning, Team invitation administration may reconcile the local row to `ACCEPTED` without applying Administrators. Groups still apply only on the trusted first-sign-in path.

## CLI

```bash
pnpm tenant:create -- --organization-name "Riverside Fun Center" --admin-email admin@riverside.example --timezone UTC --currency USD --confirm CREATE
```

The command requires `CREATE` confirmation before calling Clerk. Secrets come from the environment (`CLERK_SECRET_KEY`, `DATABASE_URL`), not CLI flags.

## Onboarding status

| Status | Meaning |
| --- | --- |
| `PROVISIONING` | Clerk and/or MagicCRM tenant rows are being created |
| `AWAITING_ADMIN` | First-admin invitation is pending |
| `ACTIVE` | First admin accepted, or the tenant was session-provisioned (default) |
| `FAILED` | Reserved for unrecoverable failures; retry moves back to `PROVISIONING` |

Existing session-provisioned organizations default to `ACTIVE`. Status is a small recovery signal, not a workflow engine.

## Idempotency / partial failure

Clerk cannot be rolled back by a PostgreSQL transaction.

- Retry with the same organization name reuses the MagicCRM row and the Clerk Organization when it was created by MagicCRM onboarding metadata.
- If a Clerk Organization with that slug exists **without** MagicCRM metadata, the command fails closed rather than attaching to an unrelated org.
- If the Clerk invitation fails after the tenant row exists, status stays `PROVISIONING` / incomplete and a retry sends the invitation.
- If MagicCRM persistence fails after Clerk created an invitation, MagicCRM attempts a compensating Clerk revoke.

Do not treat `createClientTenant` as a tenant-employee API. There is no server action for it.

## Related

- [`team-management.md`](./team-management.md)
- [`multi-tenancy.md`](./multi-tenancy.md)
