# 8. Parity-test strategy

## First slice

- WP field validation (required ternary attractions, adults+children bounds, duration Other, budget conditional)
- `createPublicWpEventInquiry` creates Inquiry + Conversation + message metadata
- No Booking row created
- Status `READY_FOR_HUMAN`, sales stage `INQUIRY`
- Honeypot / rate-limit / duplicate `submissionId` behavior
- Existing wizard/createPublicInquiry path remains covered by existing tests

## Later (calculator parity)

Port fixtures from plugin `tests/*` and `docs/*-test-results.txt` (332+ PHP checks): bowling-only, axe-only, mixed, exclusions, open-to-recommend, adult/child/mixed, day specials, packages, food offsets, dining exceptions, duration feasibility, lanes, arcade cents, tax/totals, tenant isolation. Prefer PHP Engine vs TypeScript golden compares; document every mismatch.
