# WordPress intake — Production release notes

## Change

Replace the public multi-step intake wizard with the WordPress Event Planner 3.3.0 single-page form.

- Customer path: `/inquire/[slug]` → submit → `/inquire/[slug]/thanks`
- Staff path: inquiry detail shows WP answers + private calculation snapshot
- No public packages, bookings, holds, or payments from this intake

## Pricing honesty

Private calculations currently use `pricing_source: plugin_defaults`.

Staff banner:

`ESTIMATE — Plugin-default pricing. Verify before sending to customer.`

Customer plan-notification emails are suppressed for `PUBLIC_EVENT_REQUEST` inquiries while pricing is unverified.

## Not claimed

- Live Generations WordPress admin price parity
- Automatic MagicCRM catalog → WP pricing pack mapping

## Escape hatch

`/inquire/[slug]?legacy=1` still loads the previous wizard for emergency rollback only.
