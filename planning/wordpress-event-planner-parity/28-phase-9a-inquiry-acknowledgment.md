# Phase 9A — Customer inquiry acknowledgment + email infrastructure

## 1. Existing email infrastructure findings

| Area | Finding |
| --- | --- |
| Provider adapter | `src/server/communications/email-provider.ts` already existed with `none` (default) and `console`. No Resend/SMTP/SendGrid package was installed. |
| Templates | Quote path uses `personalEventPlanNotification`; plan/booking drafts live in `emit.ts`. No inquiry-ack template existed. |
| Inquiry submit | `createPublicWpEventInquiry` persisted the inquiry + private calc metadata, then returned a thank-you token. **No outbound email.** |
| Logging | `CommunicationEvent` + audit actions for quote / plan-selection / booking stubs. |
| Idempotency | Quote delivery keyed `employee_approved_quote:{inquiryId}:{planId}:{total}`. |
| Tenant sender | Organization model has **no** From/reply-to fields. From address is env `EMAIL_FROM` when Resend is enabled; body uses tenant `organization.name`. Callers cannot override From. |
| Consent / validation | WP intake validates email via schema; acknowledgment re-checks with `isValidInvitationEmail`. |
| Live credentials | None assumed. Production stays on `EMAIL_PROVIDER=none` until explicitly configured. |

**Decision:** Extend the existing adapter and `CommunicationEvent` path. Do not add a parallel mailer.

## 2. Provider selected and configuration

**Provider:** Resend (HTTP `fetch`, no new dependency), behind env opt-in.

| Variable | Purpose |
| --- | --- |
| `EMAIL_PROVIDER` | `none` (default) \| `console` \| `resend` |
| `RESEND_API_KEY` | Required for `resend` |
| `EMAIL_FROM` | Required for `resend` (verified domain sender) |

Missing Resend credentials while `EMAIL_PROVIDER=resend` falls back to `NullEmailProvider` (safe skip / fail closed). Resend requests time out after 10s and never log API keys.

## 3. Inquiry acknowledgment implementation

- Kind: `COMMUNICATION_KINDS.INQUIRY_ACKNOWLEDGMENT`
- Copy: `src/lib/event-planner/inquiry-acknowledgment.ts`
- Send orchestration: `src/server/services/inquiry-acknowledgment-service.ts`
- Hook: soft-fail `trySendInquiryAcknowledgment` after successful `createPublicWpEventInquiry`
- Subject: `We received your event request`
- Body thanks the customer, names the venue, states an employee will follow up, and explicitly does **not** reserve/price/book

## 4. Idempotency and failure handling

### Atomic claim

1. Insert `CommunicationEvent` (`QUEUED` or immediate `SKIPPED`) **before** any provider call.
2. Partial unique index `communication_events_inquiry_acknowledgment_unique` on `(organizationId, inquiryId)` where `kind = INQUIRY_ACKNOWLEDGMENT` makes the insert the claim.
3. Concurrent losers receive `P2002`, load the winner’s row, and **do not** call the provider.
4. Claim winner calls the provider (Resend also gets HTTP `Idempotency-Key: inquiry_acknowledgment:{inquiryId}`), then updates the same row to `SENT` / `FAILED` / `SKIPPED`.

### Retry / SKIPPED after activation

| Existing status | Behavior |
| --- | --- |
| `SENT` | Idempotent return; never resend |
| `FAILED` | Idempotent return; no automatic retry (explicit ops tooling later) |
| `SKIPPED` (`NO_EMAIL_PROVIDER` or `INVALID_EMAIL`) | Idempotent return; **not** backfilled when email is later activated |
| `QUEUED` (winner crashed mid-send) | Idempotent return; no uncontrolled resend |

**No historical backfill.** Enabling Resend only affects **new** successful inquiry creates. Prior `SKIPPED` acknowledgments stay skipped until an explicit future resend tool is built and approved.

Provider failure / timeout never duplicates or invalidates the inquiry.

## 5. Quote-delivery separation

Acknowledgment never calls `approveAndSendWpStaffQuote` / `EMPLOYEE_APPROVED_QUOTE`.

Policy unchanged:

| Source | Customer quote delivery |
| --- | --- |
| `approved_plugin_baseline` | Blocked (internal draft/approve OK) |
| `plugin_defaults` | Blocked |
| `tenant_live` + verified readiness | Eligible (staff permission + explicit approve) |

## 6. Activation steps (real inquiry emails)

1. Apply migration `20261110140000_inquiry_acknowledgment_idempotency` to Production (if not already applied by deploy process).
2. Verify a sender domain in Resend.
3. Set Production (or staging) secrets: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=…`, `EMAIL_FROM=Events <noreply@your-domain>`.
4. Confirm `APP_URL` is correct (unchanged requirement for quote links; not required for ack).
5. Submit a test WP inquiry on a non-production tenant first; confirm one `INQUIRY_ACKNOWLEDGMENT` `SENT` row and inbox receipt.
6. Confirm no `EMPLOYEE_APPROVED_QUOTE` row was created by the inquiry submit.
7. Only then enable the same vars on Production after owner approval.

Until those vars are set, acknowledgments remain `SKIPPED` / `NO_EMAIL_PROVIDER`.
