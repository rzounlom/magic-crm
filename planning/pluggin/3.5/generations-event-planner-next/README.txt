GENERATIONS EVENT PLANNER — NEXT
Version 3.5.0 | AdventurePlex only | Updated November 5, 2026

INSTALL ON STAGING FIRST
Upload generations-event-planner-next-3.5.0.zip in WordPress Plugins. The stable
plugin folder is generations-event-planner-next. This is independent of the old
planner: it does not deactivate another plugin or change a public page.
New installations default to TEST MODE. Existing Next installations preserve
their current setting: confirm TEST MODE before testing an update.
Add [generations_event_request] to the customer inquiry page.

PRICES & EMAIL ATTACHMENTS
WordPress administrator: Event Planner > Prices & Attachments. Save rates in
dollars, with up to two decimal places. Prices include admissions, packages,
catering, beverages, private rooms and rentals. Defaults have not changed.
Saved prices are stored in WordPress and survive plugin replacement. They apply
to new inquiries and deliberate staff recalculations. Existing saved inquiry
prices and previously sent emails remain unchanged. Each new recommendation
records its effective price revision. Invalid or incomplete price submissions
save nothing; a stale editor must reload before overwriting newer rates.

Use Choose or upload file for the catering menu and attraction price sheet.
Select PDF, PNG or JPEG from the native Media Library, maximum 10 MB each, then
Save email attachments. Custom files must have local copies in WordPress uploads.
Media IDs persist across plugin updates. Use bundled default restores a file
choice; deleted/unavailable custom files fall back to bundled copies and show an
administrator warning. Settings apply to future acknowledgment sends/retries.
No customer or staff-link visitor can access these administrator controls.

Changing rates does not edit text in a PDF/image or synchronize workbook prices.
Replace matching documents when published prices change. Package inclusions,
card-credit amounts, capacities, quantities, discounts, tax allocation and
scheduling policies are not changed through these price controls.

The six attraction answers now read Yes / No / Open to recommendations. Stored
yes/no/open values and the recommendation behavior remain compatible.

CUSTOM PACKAGES
Administrator: Event Planner > Packages. Add a package and save Draft while
working. Activate when its price, inclusions, guest limits and availability are
ready. Archive removes it from recommendations while preserving the definition.
Use up to 20 active / 100 stored custom definitions. No example offers are
installed. Standard built-in packages retain their approved inclusions and
their editable prices in Prices & Attachments.

Custom packages apply to the entire participating group. Price per person or
per group unit of N guests; units round up. Set audience, minimum/maximum event
guests, event types, days, date range and inclusive event-start window. Actual
ages and venue availability remain staff checks; package minimum age is shown
internally. Children-only custom offers require an all-child participating
group. Built-in Blast keeps its existing mixed-group behavior.

Define supported bowling/axe minutes, shoes, laser games OR access window,
mini golf, climbs, arcade intention and play credit. Existing capacities,
briefings, exclusions, duration coverage and budget ranking remain enforced.
Bonus credit does not schedule an excluded attraction. A candidate uses one
custom package with standard components for uncovered requests. Specials are
compared with the package, not automatically applied to its base price.

Food quantities are per purchased unit: whole pizza/pitcher combos, wing
platters, separate pitchers, platters, boards and dessert trays. Included items
offset additional purchases once. A full Fajita/Slider/BBQ bar may cover all
participants when that menu is requested/staff-selected; minimum 15 remains.
Enter the food/beverage portion of the package price for correct line tax.
All foods beyond pizza/wings/drinks require separate 30-minute dining.
Optional included private rooms must meet seated capacities and cover requested
time (maximum 3 hours). A private room does not imply private attraction access.

Definitions and revisions are saved in a chosen recommendation. Subsequent
edits do not alter historical inquiry totals. Configuration stays in WordPress
through plugin updates. Published attachments and workbook references must be
updated separately. Invalid saves do not alter stored packages; validation
errors preserve the form entries for correction.

ARCADE CREDIT ALLOCATION
When arcade is requested, included play credit funds its requested per-guest
arcade allowance before other eligible attractions. Blast credit stays with the
children who receive the wristbands. Show card quantities and full face values,
with included funding and any added top-up separately; never show a pooled
group funding balance as one arcade card. Cent remainders are distributed
without changing the exact group total.

Example: 10 children on Blast and 5 adults each receive $15 arcade credit.
Children's $150 is included; adults need $75. Mini golf is charged separately
at $130 for this group. The example event total remains $783.30. Existing saved
inquiries require deliberate recalculation to update their internal breakdown;
emails already received do not change. No automatic revised email is sent.

STAFF INTAKE
Open Event Planner > Staff Intake as an administrator. Copy the unlisted link
and bookmark it on the staff screen. Employees do not need WordPress accounts,
passwords, access codes or device authorization. Anyone who obtains the link can
submit through it; the link is unindexed and sends no referrer. Saved records
remain administrator-only. Staff names are self-entered, not verified identities.
A missing name is recorded as Staff member not identified and never blocks a
complete inquiry. Attribution appears only in internal records, emails/reports.

The 15-minute window starts at the first customer/event detail, not staff name.
Progress is saved behind the scenes with typing and periodic saves. A warning
appears with two minutes remaining. Autosave never extends the fixed deadline.
At timeout, captured details are saved as an unfinished staff inquiry; no
recommendation or customer acknowledgment is generated. Staff cannot reopen it.
The screen clears customer details and staff name and offers Start another
inquiry. Successful submission also clears the form for the next customer.
The server enforces the deadline and prevents duplicate submissions.

A network outage is shown explicitly. The form does not claim unsaved data is
safe: it offers retry and keeps the next-inquiry button disabled until save is
confirmed. A terminal write-only snapshot can finish in transit for 60 seconds
after timeout; it does not reopen the inquiry or extend the submission window.

UNFINISHED RECORDS: 14 DAYS
Captured unfinished staff records are permanently deleted 14 days after the
15-minute deadline. Expiration and cleanup use WordPress scheduled tasks; manager
review/report collection also enforces expiry. Submitted inquiries are retained.
Event Planner > Staff Intake lets administrators review available unfinished
records. There is no public draft-read or staff-resume endpoint. Reports omit
test-mode drafts. Public customer typing never creates abandoned-inquiry drafts
and there is no public Save and finish later button.
The 14-day rule applies to WordPress unfinished records. Emailed reports and
Excel copies already received are governed by the recipient's email retention.

REPORTS
Daily: 7 AM venue time, covering the current month from its first day through report time.
The month-to-date list resets on the first of each month. Unfinished draft details
and counts include only retained records (14 days after timeout).
Weekly: Monday 7 AM, covering the previous Monday through Sunday.
Timezone: America/Indiana/Indianapolis; DST does not shift scheduled 7 AM.
Recipient: events@generations-adventureplex.com. Monday sends both reports.
The email has separate submitted and unfinished tables and separate totals.
Submitted rows sort by event type, guest count largest first, then requested
event date. Multiple alternative dates remain on one inquiry, not duplicate rows.
Unfinished rows use the day the staff inquiry started, after it has timed out.

Every report has an Excel attachment with two tabs:
- Submitted Inquiries: purpose, dates, time, duration, adults/children/total,
  Include/Open/Exclude preferences, food, craft beverages, private room, budget,
  name, organization, email, phone, staff source, special requests and referral.
- Unfinished Staff Inquiries: available fields plus start/last activity/timeout,
  deletion date and missing or invalid information. No totals treat these as
  completed inquiries.
Email and phone are clickable. View Inquiry and Review Draft links require
administrator access. The XLSX is generated inside the plugin with no external
API, account, add-on plugin, ZipArchive requirement or additional download.
Headers are frozen, filtering enabled, dates/counts typed, and user text cannot
execute spreadsheet formulas. Temporary attachments are private and removed
immediately after sending. Empty periods still produce a report.

HOST CRON AND EMAIL
For dependable 7 AM delivery and scheduled cleanup, ask the WordPress host to
run WordPress Cron every minute, or configure the host's managed equivalent.
WordPress traffic-based cron alone may run late. No host task has been created
by this package. Test real delivery and the two-tab attachment on staging.
Report failures are recorded and retried up to three times at 15-minute
intervals. Accepted periods are not resent. Test mode suppresses all email.
WordPress accepting a send request does not prove recipient delivery.

CUSTOMER AND INTERNAL EMAILS
Complete valid inquiries are saved privately. Internal email includes the full
request, recommendation, prices, alternatives, itinerary and staff attribution.
Customer email contains the approved acknowledgment and reference attachments,
not the calculated quote. It has no venue phone number and says Simply reply
to this email. The corrected poster uses $3.50 shoes and the one-page catering
menu contains approved prices. Thank-you confirmation hides the intake header.

VALIDATION AND PRICING
Strict browser and server validation apply to submitted public/staff inquiries;
partial staff progress is retained without running recommendations. Event Type
uses the six approved categories. Provider typo suggestions require a guest
choice; domain routing is checked server-side before save, without an external
service. A temporary DNS failure preserves the inquiry with a staff review flag.
Domain routing does not verify individual mailbox existence or ownership.
The deterministic engine, approved prices, package credit accounting, exclusions,
food tax, dining, briefings and rotation rules remain in force. Longer fully
priced bowling can be compared to use a requested event window; explicit time,
budget and attraction exclusions stay protected. Larger unfilled gaps are
flagged, not silently presented as full-length events. Flexible attractions use
leisure windows. Staff verifies availability, eligibility and final arrangements.

TESTING AND LIMITS
See docs/TESTING.txt and per-suite logs. PHP 7.4+ syntax; local PHP 8.3.6 /
WordPress test fixture. Production uses the site's usual WordPress database.
No local database, SQLite plugin, test dependencies or credentials are included.
The preview is a simulation and does not save/send anything. Finish theme,
email-client, host DNS and cron checks on staging before replacing the public
form. Deactivation unschedules report/draft jobs and preserves saved records.

License: GPL-2.0-or-later.

VERSION 3.4.0 — NOVEMBER 4, 2026
- Compact itinerary: groups side by side, shared activities once, preparation
  notes underneath; exact briefing, shoe and purchased play times preserved.
- Capacity-based rotations divide guests evenly; odd totals differ by one.
  Lane quantities follow the balanced bowling cohorts using existing lane rules.
- Internal alternatives include guest counts, quantities, rates, line tax,
  subtotal, total, per-guest estimate, inclusions and staff review notes.
- Daily email and Excel contain the running month-to-date submitted inquiries;
  Excel adds a Summary sheet. Weekly reports retain their existing period.
- Daily delivery deduplication is by send date; retries retain the original cutoff.
- Existing form, settings, stored inquiries and customer acknowledgment unchanged.

UPDATE
Upload this ZIP via Plugins > Add New > Upload Plugin and choose to replace
the existing Generations Event Planner — Next plugin. Do not uninstall/delete
the plugin. Verify test/live mode and preview a report after replacement.

VERSION 3.5.0 — NATIVE WORDPRESS UPDATE SUPPORT
One final manual upload adds dashboard update discovery and a Plugin Updates
settings page. Future versions can use WordPress Update now after a permanent
HTTPS release feed and ZIP host are connected. Hosting is not yet configured.
See docs/UPDATES.md for the one-time setup and publishing procedure.
The existing 3.4.0 itinerary, pricing breakdown and reporting changes remain.
