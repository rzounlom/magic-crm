# 4. Single-page intake design

- Route: `/inquire/[organizationSlug]` (ACTIVE orgs only)
- One responsive form (sections 01–05), not a multi-step wizard
- MagicCRM `PublicCustomerShell` + WP hierarchy (step labels, required asterisks, attraction fieldsets)
- CTA: **Submit Event Request**
- Footer: inquiry does not reserve a date or confirm pricing
- Success: thank-you confirmation only — no redirect to `/plan/[token]`
- Honeypot + rate limit retained
- Existing wizard remains available only if explicitly retained behind a dead path; default public path uses the WP-parity form once the UI slice ships
