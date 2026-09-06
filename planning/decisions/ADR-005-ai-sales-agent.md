# ADR-005 — AI sales agent architecture

## Status

Accepted

## Context

Phase 3A needs a usable customer inquiry conversation before Catalog, Booking, or email exist. The agent must qualify event leads from tenant-owned facts without confirming reservations or inventing prices, availability, or policies.

OpenAI still offers older Assistants-style conversation storage. MagicCRM already persists tenant data in PostgreSQL and must remain auditable across tenants.

## Decision

Use the official OpenAI **Responses API** through a narrow `SalesAgentModel` adapter (`openai@6.17.0`). Application code calls `SalesAgentService` only.

Tools are MagicCRM-controlled functions. Tenant id, inquiry id, and conversation id are injected by the trusted runtime. Tool arguments are Zod-validated on the server even after the model schema.

Conversation history is durable in PostgreSQL (`Conversation` / `ConversationMessage`). Responses are created with `store: false`. OpenAI is not the system of record.

`OPENAI_SALES_MODEL` is server configuration with a single application default (`gpt-4.1-mini`). Tenant admins do not pick raw model ids.

## Why not the alternatives

### One giant prompt with all tenant data

Rejected. It overshares customer and catalog-like facts, raises cost, and makes prompt-injection easier. Retrieval stays in `search_sales_knowledge`.

### Direct model database access

Rejected. The model must not run SQL or choose `organizationId`. Tools enforce tenant scope independently of instructions.

### OpenAI as the sole conversation store

Rejected. Vendor lock-in, weaker audit, and harder tenant isolation. PostgreSQL remains authoritative. `store: false` avoids extra durable copies on OpenAI.

### Immediate autonomous booking

Rejected. There is no availability or reservation engine. The agent may gather details and hand off. It must never claim a hold or confirmation.

### Hard-coded Generations prompt

Rejected. Multi-tenant SaaS. Knowledge is tenant-owned `SalesKnowledgeItem` rows. Development sample data is an explicit slug-targeted seed, not provisioning.

### Assistants API legacy design

Rejected. Assistants is the deprecated conversation architecture. Responses API is the current official path and keeps tools/instructions in application code.

## Consequences

- Schema adds Inquiry, Conversation, ConversationMessage, SalesKnowledgeItem, and AiUsage
- Public routes are slug + opaque token, not customer accounts
- Automated tests inject a fake `SalesAgentModel` and never call OpenAI
- Email/SMS can reuse the same agent by adding a channel adapter later
