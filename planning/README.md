# Planning

This folder is the living technical planning workspace for MagicCRM. It is **not** production application code.

Use it to decide architecture, record trade-offs, and specify work before implementation. Keep product copy, marketing, and the full PRD out of these files unless a planning document truly needs a short excerpt.

## Subfolders

### `architecture/`

System architecture documents. Current implementation notes:

- `database.md`
- `multi-tenancy.md`
- `authentication.md`
- `authorization.md`
- `team-management.md`
- `client-onboarding.md`
- `inquiries.md`
- `ai-sales-agent.md`
- `ui-conventions.md`

The product source of truth remains `MAGICCRM_SAAS_ARCHITECTURE.md`. Expected later examples:

- `system-overview.md`
- `multi-tenancy.md`
- `authorization.md`
- `eventing.md`
- `integration-architecture.md`

### `decisions/`

Architecture Decision Records. Use sequential filenames:

```text
ADR-001-database-and-multi-tenancy.md
ADR-002-clerk-organizations-and-tenant-context.md
ADR-003-magiccrm-security-groups-and-permissions.md
ADR-004-team-invitations-and-client-bootstrap.md
ADR-005-ai-sales-agent.md
```

### `phases/`

Implementation phase plans. Expected later examples:

```text
phase-00-foundation.md
phase-01-tenancy.md
phase-02-catalog.md
```

### `features/`

Detailed feature specifications written before implementation.

### `database/`

Schema diagrams, data-model notes, indexing strategy, and migration planning.

### `api/`

Internal API contracts, server actions, route handlers, and external API design.

### `ai/`

AI agent architecture, prompts, tool contracts, eval strategy, and handoff rules.

### `security/`

Threat models, security requirements, authorization design, and audits.

### `testing/`

Test strategy, critical-path test cases, and QA plans.
