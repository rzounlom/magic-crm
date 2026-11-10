# Phase 9A — Customer inquiry acknowledgment + email infrastructure

## 1. Existing email infrastructure findings

| Area | Finding |
| --- | --- |
| Provider adapter | `src/server/communications/email-provider.ts` already existed with `none` (default) and `console`. No Resend/SMTP/SendGrid package was installed. |
| Templates | Quote path uses `personalEventPlanNotification`; plan/booking drafts live in `emit.ts`. No inquiry-ack template existed. |
| Inquiry submit | `createPublicWpEventInquiry` persisted the inquiry + private calc metadata, then returned a thank-you token. **No outbound email.** |
| Logging | `CommunicationEvent` + audit actions for quote / plan-selection / booking stubs. |
| Idempotency | Quote delivery keyed `employee_approved_quote:{inquiryId}:{planId}:{total}`. |
| Tenant sender | Organization model has **no** From/reply-to fields. From address is env `EMAIL_FROM` when Resend is enabled; body uses tenant `organization.name`. |
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

Missing Resend credentials while `EMAIL_PROVIDER=resend` falls back to `NullEmailProvider` (safe skip).

## 3. Inquiry acknowledgment implementation

- Kind: `COMMUNICATION_KINDS.INQUIRY_ACKNOWLEDGMENT`
- Copy: `src/lib/event-planner/inquiry-acknowledgment.ts`
- Send orchestration: `src/server/services/inquiry-acknowledgment-service.ts`
- Hook: soft-fail `trySendInquiryAcknowledgment` after successful `createPublicWpEventInquiry`
- Subject: `We received your event request`
- Body thanks the customer, names the venue, states an employee will follow up, and explicitly does **not** reserve/price/book

## 4. Idempotency and failure handling

- Key: `inquiry_acknowledgment:{inquiryId}`
- Re-entry with the same key returns the existing `CommunicationEvent` (`idempotent: true`) — no second provider send
- Provider `FAILED` / `SKIPPED` still leaves the inquiry intact
- Unexpected throws are caught by `trySendInquiryAcknowledgment` and audited; inquiry create remains successful

## 5. Quote-delivery separation

Acknowledgment never calls `approveAndSendWpStaffQuote` / `EMPLOYEE_APPROVED_QUOTE`.

Policy unchanged:

| Source | Customer quote delivery |
| --- | --- |
| `approved_plugin_baseline` | Blocked (internal draft/approve OK) |
| `plugin_defaults` | Blocked |
| `tenant_live` + verified readiness | Eligible (staff permission + explicit approve) |

## 6. Activation steps (real inquiry emails)

1. Verify a sender domain in Resend.
2. Set Production (or staging) secrets: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=…`, `EMAIL_FROM=Events <noreply@your-domain>`.
3. Confirm `APP_URL` is correct (unchanged requirement for quote links; not required for ack).
4. Submit a test WP inquiry on a non-production tenant first; confirm one `INQUIRY_ACKNOWLEDGMENT` `SENT` row and inbox receipt.
5. Confirm no `EMPLOYEE_APPROVED_QUOTE` row was created by the inquiry submit.
6. Only then enable the same vars on Production after owner approval.

Until those vars are set, acknowledgments remain `SKIPPED` / `NO_EMAIL_PROVIDER`.
