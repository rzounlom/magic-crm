# MagicCRM SaaS / Multi-Tenant Architecture Addendum

## Decision

MagicCRM will be built as a multi-tenant SaaS product from the first production commit.

Generations Adventureplex is tenant #1, not a hard-coded special case.

The initial release may expose only the functionality Generations needs, but the application architecture, database schema, authorization model, integration model and provisioning model must support onboarding additional fun centers without redesigning the system.

---

# 1. Core Tenant Hierarchy

```text
MagicCRM Platform
  -> Tenant / Organization
      -> Locations
          -> Resources / Inventory
          -> Catalog Overrides
          -> POS Devices / Readers
      -> Users
      -> Security Groups
      -> Integration Connections
      -> Customers
      -> Inquiries
      -> Proposals
      -> Events
      -> Payments
      -> Communications
```

The word `Organization` may be used internally in code and mapped to "Client" or "Company" in the UI.

Every tenant-owned record MUST be scoped by `organizationId`.

Location-owned records MUST also include `locationId`.

No query may rely on a browser-supplied organization ID as authorization.

---

# 2. Authentication vs Authorization

## Clerk owns identity

Use Clerk for:

- authentication
- sessions
- passwordless/social authentication if desired
- MagicCRM organization membership
- organization invitations
- active organization context
- basic tenant admin/member identity
- future SSO support

Clerk Organization ID should be stored/mapped to MagicCRM `Organization.clerkOrganizationId`.

## MagicCRM owns fine-grained authorization

Do NOT depend on Clerk custom roles as the only security model.

MagicCRM must support tenant-admin-created security groups such as:

- Event Sales
- Managers
- Front Desk
- POS Only
- Accounting
- Marketing
- Operations
- Waiver Management
- Read-Only Supervisors
- Custom group created by the client

This is an application-level RBAC model.

Recommended schema:

### PermissionDefinition

Platform-defined permission catalog.

Examples:

```text
crm.inquiries.view
crm.inquiries.manage
crm.customers.view
crm.customers.manage

events.view
events.create
events.edit
events.confirm
events.cancel

calendar.view

catalog.view
catalog.manage

inventory.view
inventory.manage
inventory.override

pos.access
pos.discount
pos.refund
pos.cash_payment

payments.view
payments.collect
payments.refund

waivers.view
waivers.manage

communications.view
communications.send
communications.manage_automation

reports.view

users.view
users.manage

security_groups.view
security_groups.manage

integrations.view
integrations.manage

organization.settings.manage
location.settings.manage
```

### SecurityGroup

```text
id
organizationId
name
description
isSystem
createdAt
updatedAt
```

### SecurityGroupPermission

```text
securityGroupId
permissionKey
```

### SecurityGroupMember

```text
securityGroupId
userProfileId
```

A user can belong to more than one group.

Effective permissions are the UNION of all permissions from all groups.

Tenant `OWNER` / `TENANT_ADMIN` remains a protected high-level administrative concept.

Do not permit an ordinary client-created group to grant platform-owner permissions.

---

# 3. Platform Roles vs Tenant Roles

Keep two authorization planes separate.

## MagicCRM Platform Staff

These are YOUR future SaaS-company employees.

Examples:

```text
PLATFORM_SUPER_ADMIN
PLATFORM_SUPPORT
PLATFORM_BILLING
PLATFORM_READ_ONLY
```

These users can support multiple tenants depending on explicit policy.

Platform access MUST be separately audited.

Do not make platform staff regular tenant members merely to access support tools.

## Tenant Users

These are Generations employees or employees of future MagicCRM clients.

Tenant users receive access from tenant security groups.

Example:

```text
Jane:
  Event Sales
  Reports

Tom:
  Front Desk
  POS Only

Sarah:
  Managers
  Accounting
```

---

# 4. Tenant Provisioning

Create an explicit provisioning service.

Conceptual API:

```text
provisionOrganization({
  companyName,
  adminUserId,
  primaryLocation,
  timezone,
  currency
})
```

Provisioning should:

1. Create Clerk Organization or map an existing one.
2. Create MagicCRM Organization.
3. Create primary Location.
4. Assign first user as Tenant Admin.
5. Create default security groups.
6. Create default permission mappings.
7. Seed optional starter catalog template.
8. Create organization settings.
9. Create integration configuration placeholders.
10. Emit `organization.provisioned` event.
11. Log audit event.

Never scatter onboarding side effects throughout React components.

---

# 5. Default Security Groups

New clients should receive sensible defaults:

## Administrators

All tenant permissions except platform-only controls.

## Event Sales

- CRM
- customer history
- proposals
- events
- calendar
- communications
- availability read

No user/security administration.

## Front Desk

- POS
- customer lookup
- attraction scheduling
- limited event lookup
- collect permitted payments

No pricing administration.

## Operations

- today's events
- calendar
- event notes
- waivers
- operations checklist
- inventory view

## Accounting / Managers

- payments
- refunds if configured
- balances
- reports

Clients may:

- rename non-system groups
- create new groups
- add/remove users
- change group permissions

Protected system groups must remain recoverable.

---

# 6. Module-Level Permissions

The UI should be permission-aware.

A user without CRM access should not even see CRM navigation.

However, hiding navigation is NOT security.

Every server route, action and service operation must also enforce permission.

Pattern:

```text
requirePermission({
  organizationId,
  userId,
  permission: "events.confirm"
})
```

Authorization should be centralized and testable.

Do not write arbitrary role-name checks throughout the app.

Bad:

```text
if (user.role === "manager") ...
```

Preferred:

```text
await requirePermission("events.confirm")
```

---

# 7. Tenant Data Isolation

## Initial recommendation

Use a shared MagicCRM PostgreSQL database with tenant-scoped rows for the initial SaaS launch.

Reasons:

- simpler Prisma migrations
- simpler reporting
- simpler development
- easier transactional relationships
- lower provisioning complexity
- appropriate while tenant count is modest

Every tenant table uses `organizationId`.

Add indexes with organization as the leading component for high-use tenant queries where appropriate.

Examples:

```text
@@index([organizationId, status])
@@index([organizationId, createdAt])
@@unique([organizationId, normalizedEmail])
```

Where customer identity should be unique only inside a tenant, never create global uniqueness accidentally.

## Future isolation option

Preserve repository/service boundaries so selected enterprise clients could later use dedicated databases/projects if needed.

Do NOT implement database-per-tenant in Phase 0.

Neon supports dedicated project-per-tenant architectures if stronger workload/data isolation becomes valuable later, but that introduces provisioning, migration and control-plane complexity.

Storage topology should be an infrastructure evolution, not something business logic depends on.

---

# 8. Tenant Integrations / Keys

A critical distinction:

Not every tenant should necessarily supply every key.

## Platform-owned credentials

MagicCRM will generally own:

- OpenAI API credential
- Clerk application credentials
- QStash credentials
- core application infrastructure credentials
- error monitoring credentials

Usage/cost is attributed internally by `organizationId`.

This produces a consistent supported product.

## Tenant-owned connections

A tenant may own/connect:

- Stripe account
- email sending identity/account
- SMS provider configuration if BYO provider is supported
- waiver provider
- accounting integration
- custom webhooks
- future marketing integrations

Do not expose raw integration secrets after creation.

Recommended:

### IntegrationConnection

```text
id
organizationId
provider
status
externalAccountId
secretReference
configurationEncrypted
createdAt
updatedAt
lastVerifiedAt
```

Secrets should be encrypted or stored in an appropriate secret store.

Database records should preferentially contain a reference rather than plaintext secrets.

---

# 9. Stripe SaaS Direction

For Generations initially, MagicCRM can integrate with the Generations Stripe account.

For future SaaS clients, design the payment domain so each organization resolves its own payment account/configuration.

Potential long-term path:

```text
MagicCRM
  -> Stripe Connect platform
      -> Generations connected account
      -> Fun Center B connected account
      -> Fun Center C connected account
```

Do not make Connect a Phase 0 requirement.

Do ensure every payment operation resolves a tenant-specific `PaymentAccount` abstraction rather than reading one globally hard-coded Stripe account ID.

---

# 10. AI Agent Tenant Isolation

Each client's AI sales agent behaves using THAT tenant's:

- catalog
- prices
- hours
- policies
- resources
- availability
- waiver rules
- tone settings
- escalation settings
- email identity
- business name
- location details

Never share retrieval context across organizations.

All AI tool calls carry server-derived organization context.

The model never gets to choose `organizationId`.

Bad tool schema:

```text
getCatalog(organizationId)
```

Preferred application wrapper:

```text
getCatalog()
```

where server execution already knows the authenticated/inquiry tenant.

AI interaction logs must include tenant attribution for:

- cost reporting
- quality metrics
- troubleshooting
- auditing

---

# 11. Tenant AI Configuration

Add later:

### AgentConfiguration

```text
organizationId
displayName
brandVoice
salesStyle
humanHandoffThreshold
autoReplyEnabled
autoFollowUpEnabled
largeEventGuestThreshold
largeEventDollarThreshold
approvedClaims
prohibitedTopics
businessSpecificInstructions
```

Do not allow clients to replace the platform security/system prompt.

Tenant instructions are a subordinate configuration layer.

---

# 12. Tenant Branding

Future clients should configure:

- company name
- logo
- primary brand color
- contact email
- phone
- website
- customer proposal branding
- email sender identity
- receipt branding
- waiver branding

Keep the employee application visually consistent across tenants.

Avoid fully custom tenant CSS.

---

# 13. Subscription / Entitlement Model

Even before subscription billing is implemented, introduce a conceptual feature entitlement boundary.

Examples:

```text
CRM
AI_AGENT
ONLINE_BOOKING
POS
TERMINAL_PAYMENTS
WAIVERS
AUTOMATED_COMMUNICATIONS
ADVANCED_REPORTING
MULTI_LOCATION
SSO
```

Later plans could map to:

```text
STARTER
PRO
ENTERPRISE
```

Do not hard-code pricing-plan checks into UI.

Use:

```text
hasFeature("AI_AGENT")
```

separately from:

```text
hasPermission("crm.inquiries.manage")
```

Entitlement answers:
"Did this customer purchase this module?"

Permission answers:
"May this employee use it?"

These are NOT the same thing.

---

# 14. Tenant-Safe Domain Service Rule

Every tenant-aware service should receive a trusted application context.

Example:

```ts
type RequestContext = {
  userId: string;
  organizationId: string;
  locationId?: string;
  permissions: Set<PermissionKey>;
};
```

Repository APIs should make unscoped access difficult.

Preferred:

```text
customerRepository.findById(ctx.organizationId, customerId)
```

Avoid:

```text
customerRepository.findById(customerId)
```

unless it is explicitly platform-internal.

---

# 15. Audit Requirements

Audit at minimum:

- user invited
- user removed
- security group created
- permission changed
- user added/removed from group
- integration connected/disconnected
- catalog price changed
- inventory overridden
- proposal confirmed
- refund
- payment adjustment
- privileged platform support access

Audit records:

```text
organizationId
actorUserId
actorType
action
resourceType
resourceId
before JSON optional
after JSON optional
createdAt
requestId
```

---

# 16. Onboarding Experience

Future client onboarding should feel like a guided setup wizard.

## Step 1 — Company

- business name
- timezone
- currency
- contact details

## Step 2 — Location

- address
- hours
- tax settings

## Step 3 — Offerings

Choose starter templates or create:

- attractions
- party packages
- group packages
- food

## Step 4 — Inventory

- bowling lanes
- axe lanes
- party rooms
- kart capacity
- other resources

## Step 5 — Payments

Connect Stripe.

## Step 6 — Email

Verify/connect sending identity.

## Step 7 — Team

Invite employees.

## Step 8 — Security

Assign users to security groups.

## Step 9 — AI Agent

Configure business tone, handoff rules and automation settings.

## Step 10 — Test

Run a test inquiry -> proposal -> booking.

Then:

```text
GO LIVE
```

---

# 17. Generations Adventureplex Rule

Never write:

```text
if company === "Generations" ...
```

Generations-specific setup belongs in:

- seed data
- tenant configuration
- catalog records
- resource records
- policies
- integrations

Anything Generations needs that another fun center could reasonably need should be implemented as a configurable product capability.

---

# 18. Revised Phase Priorities

The overall roadmap remains, but foundation changes to:

### Phase 0
Tenant-aware repository and code standards.

### Phase 1
Clerk Organizations + MagicCRM Organization + Location + tenant admin.

### Phase 1B
Permission definitions, security groups, group membership, authorization service.

### Phase 2
Tenant-scoped catalog/admin.

### Phase 3
Tenant/location-scoped resource inventory.

All following phases MUST be tenant scoped.

---

# 19. SaaS Architecture Acceptance Tests

Before onboarding customer #2, automated tests must prove:

1. Tenant A cannot read Tenant B customers.
2. Tenant A cannot guess Tenant B record IDs to access resources.
3. Tenant A cannot see Tenant B catalog.
4. Tenant A cannot see Tenant B availability.
5. Tenant A cannot see Tenant B communications.
6. Tenant A cannot access Tenant B reports.
7. AI conversation for Tenant A cannot retrieve Tenant B data.
8. User permission groups are isolated by tenant.
9. Client admins cannot grant platform permissions.
10. Tenant integrations resolve to the correct tenant.
11. Stripe webhooks resolve payments to the correct organization.
12. Background jobs retain tenant context.
13. Support/admin cross-tenant access is explicitly authorized and audited.

These tests are release blockers.


---

# 20. Entitlements vs Permissions

MagicCRM must support modular commercial access independently from employee permissions.

This is a hard architecture boundary.

Tenant security groups control employee access.

MagicCRM/platform billing or support systems control organization entitlements.

Recommended API boundaries:

```ts
requireEntitlement(ctx, "AI_SALES_AGENT");
requirePermission(ctx, "ai.manage");
```

Never use pricing plan names directly inside domain or UI feature logic.

Initial module keys:

```text
CORE_CRM
EVENT_BOOKING
ONLINE_BOOKING
POS
OPERATIONS
COMMUNICATIONS
AI_SALES_AGENT
ADVANCED_ANALYTICS
MULTI_LOCATION
SSO
```

Future pricing plans map to these entitlements rather than features checking plan names.

Tenant administrators may manage security groups, but may not grant commercial modules their organization has not purchased.
