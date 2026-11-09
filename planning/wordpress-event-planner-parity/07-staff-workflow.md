# 7. Staff workflow integration

After public WP submit:

1. Inquiry status → `READY_FOR_HUMAN`
2. `salesStage` stays `INQUIRY` (not `PROPOSAL_READY`)
3. `humanHandoffReason` → `PUBLIC_EVENT_REQUEST` (new reason)
4. Staff opens `/app/inquiries/[id]` and reads original answers from intake message / metadata
5. Staff uses existing tools to regenerate proposals, start Live Agent, book, or close
6. Historical `/plan/{token}` links remain valid for older inquiries

No automatic Booking, hold, or payment from public submit.
