# Inquiries (Phase 3A)

Inquiry is the CRM lead / event-sales anchor. This phase implements public web intake, an AI conversation thread, and a minimal employee inbox. It does not implement proposals, booking, payments, or a full pipeline board.

## Public intake

Route: `/inquire/[organizationSlug]`

Public customer routes (`/inquire/*`, `/conversation/*`) each wrap `PublicCustomerShell` in their App Router layout. They do not reuse `EmployeeShell` or the marketing `SiteShell`. The customer header is brand-only — no employee sign-in, Clerk `UserButton`, `OrganizationSwitcher`, or `/app` navigation. Employee sign-in stays on the MagicCRM landing page.

The slug is resolved server-side. Only organizations with `onboardingStatus = ACTIVE` accept inquiries. Invalid or inactive slugs return 404. The form never accepts a browser-supplied `organizationId`.

After a valid submit:

1. Create `Inquiry` (`NEW`, `source = WEB`)
2. Create `Conversation` (`channel = WEB`) with a hashed public token
3. Persist the intake as an inbound customer message
4. Run the sales agent
5. Redirect to `/conversation/{opaqueToken}`

No customer account is created. Email sending is not required for this MVP.

## Customer continuation

`/conversation/{token}` grants access only to that conversation’s customer-visible messages (customer, assistant, employee, and safe system fallback). Employee notes, usage, and other inquiries are not included.

Additional messages use a per-submit `clientSubmissionId`. Duplicate ids are rejected (`DUPLICATE_SUBMISSION`).

If `aiHandlingEnabled` is false, the message is stored and no automatic reply is generated. That flag is explicit ownership: `request_human_handoff` or employee **Take over**. Transient provider/model failures must not set it.

## Employee UI

- `/app/inquiries` — `crm.inquiries.view`
- `/app/inquiries/[id]` — same view permission
- Take over / Resume AI / employee web reply — `crm.inquiries.manage`

Front Desk does not receive inquiry permissions. Event Sales can view/manage inquiries and view AI knowledge. Administrators have all keys. `ai.manage` is required to create/edit sales knowledge (`/app/admin/ai/knowledge`).

## Status workflow

AI-stage statuses used now:

| Status | Meaning |
| --- | --- |
| `NEW` | Just created, before the first agent turn finishes |
| `AI_ENGAGED` | Agent is handling the inquiry |
| `AWAITING_CUSTOMER` | Agent replied and is waiting |
| `NEEDS_FOLLOW_UP` | Agent failed or the lead needs a human nudge |
| `READY_FOR_HUMAN` | Handoff or employee takeover |
| `DECLINED` | Reserved; no UI yet |
| `BOOKED` | Reserved for the future Booking engine; unused |

### Mapping to the later CRM pipeline

The previously discussed employee pipeline still stands. This phase does not implement it.

| Future CRM stage | AI-stage source |
| --- | --- |
| Needs Follow-up | `NEEDS_FOLLOW_UP` |
| Build Proposal | Human work after `READY_FOR_HUMAN` (not built) |
| Proposal Sent | Later proposal engine |
| Awaiting Customer Response | `AWAITING_CUSTOMER` and later proposal wait |
| Event Booked | Future `BOOKED` after a real reservation |
| Declined | `DECLINED` |

Do not treat `READY_FOR_HUMAN` as booked.

Persisted status enums stay as stored. Employee UI uses `formatInquiryStatus` / `formatInquiryEmployeeStatus` (`src/lib/inquiries/inquiry-status-display.ts`). Examples: `READY_FOR_HUMAN` → Ready for live agent; `AI_ENGAGED` → AI handling; `NEEDS_FOLLOW_UP` → Needs follow-up. Do not show raw enum tokens. When status is already `READY_FOR_HUMAN` and AI is off, do not also append “Live agent”.

## Date/time and phone presentation

`desiredDate` (`@db.Date`) and `desiredStartTime` (wall-clock `HH:mm`) are **event-local** values. Format them with `formatEventLocalDateTime` without converting them as UTC instants. A customer who chose September 11 at 7:00 PM must stay September 11 at 7:00 PM for employees.

`createdAt` / `updatedAt` are UTC timestamps. Convert those with `formatOrganizationTimestamp` into `Organization.timezone` loaded from `RequestContext.organizationId`. Tenant A’s timezone must not format Tenant B’s inquiries.

Phone is stored as normalized 10-digit digits. Display with `formatPhoneDisplay` as `(555) 654-3333`. Malformed legacy values stay unchanged.

## Conversation rendering

Public and employee AI messages share `AssistantMarkdown` (bold, lists, paragraphs, `remark-breaks`, `skipHtml`). Customer, employee, and system text stay escaped plain text.

## Next: Employee Inquiry Workspace MVP

The current `/app/inquiries` list and `/app/inquiries/[id]` thread are a minimal inbox. The next product step is an Employee Inquiry Workspace (assignment, filtering, richer pipeline). Do not treat this polish as that workspace.

Related employee-shell follow-up (not this inbox): sticky authenticated header. See `ui-conventions.md`.

## Channel abstraction

`Inquiry.source` and `Conversation.channel` already include `WEB`, `EMAIL`, and `SMS`. Only WEB is implemented. One inquiry may have multiple conversations later. The current product uses one primary WEB conversation.

## Failure behavior

If the model is missing, the API fails, or a turn produces no customer-visible text, the inquiry and conversation remain. The customer sees a transient fallback that does not claim permanent takeover. Status may become `NEEDS_FOLLOW_UP`. `aiHandlingEnabled` stays true, and `humanHandoffRequestedAt` is not set. The next customer message retries AI.

`READY_FOR_HUMAN` plus `aiHandlingEnabled = false` is reserved for explicit handoff or employee takeover. `NEEDS_FOLLOW_UP` is not human takeover.

## AI enablement vs entitlement

`aiHandlingEnabled` and `OPENAI_API_KEY` are operational. They are not a paid plan. Future entitlement billing must not be inferred from these flags.
