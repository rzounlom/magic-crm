# AI sales agent (Phase 3A)

The customer-facing path is the **Personal Event Planner** (structured form → recommendations → selection). This document describes the leftover Event Assistant used for employee-resumed conversation turns. It is not a Catalog, Booking, or communications platform.

Public intake no longer asks follow-up questions in chat. Recommendation ranking/copy is deterministic from tenant `SalesKnowledgeItem` rows in `src/server/event-planner/`. Do not let a model invent prices, capacities, hours, or availability.

## Agent boundary

`SalesAgentService` (`src/server/services/sales-agent-service.ts`) is the only orchestration path.

Inbound customer text is persisted first. The service then loads tenant-scoped inquiry + conversation history + versioned instructions, calls a `SalesAgentModel`, executes tools, persists the customer-visible reply, updates inquiry state, and writes `AiUsage`.

Route handlers and React components never call OpenAI.

There is no organization entitlement or paid AI plan. Operational enablement is:

1. Server `OPENAI_API_KEY` present
2. Inquiry `aiHandlingEnabled === true`

A missing key still creates the inquiry and shows the safe fallback. That is not a billing entitlement.

## OpenAI Responses API

Transport lives in `src/lib/ai/openai-sales-agent-client.ts`.

- Official `openai` Node SDK **6.17.0**
- `client.responses.create(...)`
- `store: false` — MagicCRM PostgreSQL is the durable conversation store
- `strict: false` on function tools because optional qualification fields are not all required
- `max_output_tokens` is set by the service (700)
- At most 4 tool rounds and 4 calls per round
- Model id comes from `OPENAI_SALES_MODEL`, defaulting to `gpt-4.1-mini` when unset

`previous_response_id` and OpenAI-hosted conversations are not used. If they are added later, they remain provider metadata only.

## Durable history

`ConversationMessage` rows are the source of truth. Each turn replays customer / assistant text from PostgreSQL. Hidden chain-of-thought is never stored.

## Tool model

Tools are application-owned. The model never supplies `organizationId`. The runtime injects the current tenant, inquiry, and conversation.

| Tool | Effect |
| --- | --- |
| `search_sales_knowledge` | Tenant-scoped search of active `SalesKnowledgeItem` rows. Terms are normalized (punctuation, stop words). Candidates are ranked so location and title matches beat incidental word hits. |
| `get_inquiry_details` | Qualification fields for the current inquiry only |
| `update_inquiry_details` | Whitelisted qualification fields only |
| `request_human_handoff` | `READY_FOR_HUMAN`, pause AI, audit |

There are no booking, availability, payment, or SQL tools. Live inventory must go through `checkResourceAvailability`, not a model tool.

## Tenant scoping

Public intake resolves the organization from the URL slug. Hidden form `organizationId` is not trusted and is not accepted.

Public continuation uses an opaque 32-byte token. Only the SHA-256 hash is stored (`Conversation.publicTokenHash`). The token maps to exactly one conversation.

Employee routes use `RequestContext` + `crm.inquiries.view` / `crm.inquiries.manage`.

AI tools use `updateMany` / `findFirst` with both `id` and `organizationId`.

## Prompt-injection protections

Customer text is untrusted data. Instructions say so. That is not the security boundary.

- Tenant authority is injected, never read from the model
- Tool args are Zod-validated after the model returns them
- Update whitelist cannot change status, assignment, organization, or booking state
- Public pages never render employee notes, usage rows, or tool metadata
- The model is not given other inquiries, other tenants, or API keys

## Handoff

Handoff is a required-human-action boundary, not a signal that a lead is valuable. Preferred date/time, guest count, pricing questions, and a well-qualified inquiry must not trigger it.

`request_human_handoff` is accepted only when the latest customer message needs a person: an explicit request for a human, live availability / reserve / book / hold, or staff approval the customer wants escalated. The runtime evaluates that policy in `src/server/ai/handoff-policy.ts` and declines premature tool calls without disabling AI.

Accepted `request_human_handoff` and employee **Take over** both set `aiHandlingEnabled = false` and `READY_FOR_HUMAN`. Later customer messages persist but do not call the model until an authorized employee clicks **Resume AI**.

Provider timeouts, 429/5xx, malformed or empty model output, and tool-validation errors are transient. They may set `NEEDS_FOLLOW_UP` and persist a safe fallback, but they must not disable AI or write handoff metadata. The next customer message retries the model.

## Usage tracking

Each turn writes `AiUsage`: model, response id, token counts when returned, latency, success/failure, tenant, inquiry. This is operational cost data, not billing.

## Sales knowledge

`SalesKnowledgeItem` is a temporary AI-ready knowledge layer. Phase 3 Catalog may replace or back it. Do not hardcode offerings in prompts. Do not put Generations-specific defaults in provisioning.

MVP knowledge rules:

- Knowledge is tenant-owned and edited through the existing admin knowledge UI or an explicit slug-targeted import. Customers and the model cannot choose `organizationId`.
- Location labels are stored on each item (`Location:` prefix in `details`). AdventurePlex facts must not be answered as Raceway facts, and the reverse.
- Verified operating hours are published tenant knowledge, not prompt text and not a public-web lookup. Regular hours are not live attraction or event availability.
- If hours or another destination-specific fact is asked without enough location context, and the tenant has more than one destination, the assistant asks which destination. Missing hours for one destination are not filled from another.
- If knowledge is absent, the assistant says so. It must not invent prices, hours, or age/height eligibility.
- A normal knowledge gap does not trigger human handoff. Live availability and reservation requests still do, until inventory/booking tools exist.
- Runtime customer answers do not search the public web.

Development-only import (idempotent, requires an existing slug and `--confirm IMPORT`):

```bash
corepack pnpm tenant:import-sales-knowledge -- --slug <organizationSlug> --confirm IMPORT
```

The curated dataset in `scripts/data/generations-sales-knowledge/` is imported only into the chosen tenant. It is not part of organization provisioning. `needs-verification.json` is never written as authoritative knowledge. Resolved hours now live in `sales-knowledge.json` as a tenant POLICY item. `sourceUrl` is kept in the dataset files only and is not stored or sent to customers. `locationLabel` is preserved as a `Location:` prefix in `details` so AdventurePlex and Raceway stay distinct inside one tenant. Admins can change hours later by editing that knowledge item.

## Future email

`Conversation.channel` is `WEB | EMAIL | SMS`. Only WEB is implemented. Email should reuse `runSalesAgentTurn` with a normalized inbound message. Do not fork agent logic per channel.

## Rate limiting

`RateLimiter` is a port. The current implementation is in-process memory (5 intakes / 10 minutes / key, 10 messages / 10 minutes / conversation). Production public launch needs a distributed limiter before wide exposure.

## Customer data sent to the model

Sent when present:

- customer first/last name, email, phone
- event type, occasion, desired date/time, guest counts, budget range
- customer notes and the agent-written internal summary
- conversation messages
- matching tenant sales-knowledge fields (including internal sales notes for the current tenant only)

Not sent:

- other customers or inquiries
- employee-only notes (`employeeInternalNotes`)
- security groups, permissions, audit rows
- API keys or prompts from other tenants

## Relationship to later phases

- **Catalog** may become the source behind `search_sales_knowledge`
- **Booking** must not be claimed by this agent
- **Email** should attach to `Conversation.channel = EMAIL` and the same service
