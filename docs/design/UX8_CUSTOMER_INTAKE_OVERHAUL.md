# UX8 — Customer Intake Experience Overhaul

**Status:** Complete for intake information architecture, interaction redesign, safe draft persistence, review/submit recovery, unit coverage, and public Playwright verification.  
**Do not claim production readiness based on UX8 alone.**  
**STOP after UX8** — do not start another phase from this document.

---

## 1. Original intake workflow

Progressive six-stage reveal on `/inquire/[organizationSlug]`:

1. Event (type → guests → mix auto-reveal)
2. Experience (attractions + Continue)
3. Preferences (food, space, budget, length — auto-revealed)
4. Date & Time (hour / minute / AM–PM selects)
5. Contact
6. Review (separate screen before submit)

Problems confirmed in UX7: long stage list, no Back, refresh lost answers, cumbersome time entry, toast-heavy errors, weak event-type guidance.

Backend path (unchanged):

`organizationSlug` → `listPublicPlannerCatalog` → `PublicIntakeWizard` → `submitPublicInquiryAction` / `readPublicIntakeFields` → inquiry record → proposal generation → `/plan/{token}`.

---

## 2. New intake workflow

Four guided journey steps (`JOURNEY_STEPS` in `intake-journey.ts`):

| Step | Label | Content |
|---|---|---|
| 1 | Your event | Event-type cards, guest count (+/−), guest mix |
| 2 | The fun stuff | Activities, food, private space, budget, length |
| 3 | When | Native date + single preferred start-time select |
| 4 | Your details | Editable review + contact + submit |

- Progress pills: Event / Fun / When / Details (`aria-current`)
- Explicit **Back** and **Continue** (submit only on Details)
- In-memory answers preserved across steps; edit links from review jump to the owning step
- H1: **Plan your event**; organization display name remains the eyebrow from the trusted loader

---

## 3. Field-to-CRM contract map

| UI field | Backend / FormData | Required | Validation | Conditional | Type | Transform | Downstream | Defer/hide? |
|---|---|---|---|---|---|---|---|---|
| Event type | `eventType` | Yes | Non-empty enum option | — | string | as-is | Inquiry + planner | No |
| Guest count | `guestCount` | Yes | 1…limit, digits | After event type chosen | string→int | digits only | Capacity / plans | No |
| Guest mix | `guestMix` | Yes | `mostly_children` \| `mostly_adults` \| `mixed_ages` | After event type | enum | as-is | Profiles / attractions required | No |
| Attractions | `attractionInterestIds` | Cond. | ≥1 when tenant profile requires for mix | Fun step; required by profile | id[] | filter to catalog | Preferences | Optional unless profile requires |
| Food | `foodPreference` | Yes | `WANTS_FOOD` \| `NO_FOOD` | Fun step | enum | engine dining map | Plans | No |
| Private space | `privateSpacePreference` | Yes | `YES` \| `NO_PREFERENCE` | Fun step | enum | space map | Plans | No |
| Budget band / flexible | `budgetBand` / `budgetPreference` | Yes | band **or** `FLEXIBLE` | Fun step | enum | as-is | Plans | No |
| Event length | `desiredDurationMinutes` | Yes | public length option; `FLEXIBLE`→`""` | Fun step | string | strip FLEXIBLE | Plans | No |
| Event date | `preferredDate` | Yes | `YYYY-MM-DD` | When | civil date | as-is (venue-local) | Scheduling | No |
| Start time | `startTime` | Yes | `HH:mm` 24h | When | from hour/min/period | `to24HourTime` | Scheduling | No |
| First / last name | `firstName` / `lastName` | Yes | non-empty | Details | string | trim | CRM contact | No |
| Email | `email` | Yes | email shape | Details | string | trim | CRM / handoff | No |
| Phone | `phone` | No | 10-digit US if present | Details | string | format helpers | CRM | Optional |
| Group name | `customerGroupName` | No | — | Details | string | trim | CRM | Optional |
| Notes | `notes` | No | — | Details | string | trim | CRM | Optional |
| Submission id | `submissionId` | Yes | UUID | hidden | string | client UUID | Idempotency | Hidden |
| Honeypot | `companyWebsite` | — | must be empty | hidden | string | bot trap | Reject bots | Hidden |
| Org slug | `organizationSlug` | Yes | active tenant | hidden | string | loader slug | Tenant scope | Hidden |

Beverage preference remains in `PlannerAnswers` for legacy parse compatibility but is **not** collected in the UX8 UI (unchanged from prior planner).

---

## 4. Conditional question decisions

| Decision | Rationale |
|---|---|
| Guests + mix only after event type | Reduces empty-state noise; all three still required before Continue |
| Attractions required only when `attractionRequiredGuestMixes` includes mix | Existing tenant profile contract |
| Food / space / budget / length always on Fun | Still required by backend — not inferred from event type |
| No auto-select of paid products | Contract / fairness |
| Changing mix re-validates attraction requirement on Continue | Prevents skipping required activities |
| Draft restore drops attraction ids missing from catalog | Avoids stale tenant catalog selections |
| Event-type microcopy only | No silent preference defaults from type |

**Follow-up (not in UX8):** backend support for deferring food/space when truly optional would unlock further conditional simplification.

---

## 5. Activity selection redesign

- Card grid with name + honest description (catalog `shortDescription`, or generic “Available at this venue…” — never fabricated marketing/pricing)
- Multi-select via `aria-pressed`; copy states multiple selection when catalog length > 1
- Selected visual + “Selected” label (`aria-hidden`; pressed state is the SR signal)
- Empty catalog: continue without selection (unless profile requires)
- No capacity guarantee copy

---

## 6. Guest count redesign

- Label **Guest count** with helper: estimate is fine
- `inputMode="numeric"`, digit filter, max 3 digits (existing limit path)
- Optional − / + steppers (large touch targets)
- Inline error on Continue when invalid

---

## 7. Date/time behavior

- Native `<input type="date">` for preferred civil date
- Single `<select>` of half-hour options 09:00–21:00 (`publicStartTimeOptions`) writing `startHour` / `startMinute` / `startPeriod` via `answersFromStartTime24` → still serializes `startTime` with `to24HourTime`
- Microcopy: times are venue-local, not device timezone; preference is not a reservation
- No fabricated availability

---

## 8. Draft persistence / privacy

Module: `src/lib/event-planner/intake-draft.ts`

| Rule | Implementation |
|---|---|
| Versioned schema | `v: 1` |
| Tenant-scoped key | `magiccrm.intake.draft.v1:{organizationSlug}` |
| Max age | 7 days |
| Stored fields | Event preferences only (`NonSensitivePlannerAnswers`) |
| Never stored | Names, email, phone, notes, group name, tokens |
| Validate on restore | Enums, date shape, attraction ∩ catalog |
| Start over / success | `clearIntakeDraft` |
| Storage failure | try/catch; silent no-op |
| Banner | “We restored your event preferences… Contact details were not saved” |

No server-side autosave. No cross-tenant keys.

---

## 9. Review and submission behavior

- Details step shows review rows with **Edit {section}** + contact fields
- Primary: **Build my event options** (`PendingSubmitButton` + `BlockingMutation`)
- Double-submit blocked via pending gate
- Failures: inline alert + field `aria-invalid` / messages; toast retained as secondary
- Copy: submitting does **not** reserve activities or collect payment
- Success: clear draft, existing `redirectTo` handoff

---

## 10. Visual design decisions

- Effortless Precision tokens / choice-card inset selected state
- Event-type cards with compact SVG icons + short help text
- Focused `max-w-3xl` planner frame
- Calm progress pills (4 steps, not 6)
- Reduced-motion respected for scroll behavior
- Organization name from `customerFacingOrganizationName` (no slug-case H1)

---

## 11. Accessibility decisions

- One H1 on inquire page
- Semantic form + fieldsets/legends (sr-only where visual headings exist)
- `aria-pressed` selection cards; keyboard operable buttons
- Progress `aria-current="step"` + polite live region for step announcements
- Focus moves to journey section after Back/Continue/Edit
- Error summary + per-field association
- Visible focus rings; touch-friendly controls (`min-h-11` / `min-h-12`)
- No focus trap in the wizard

---

## 12. Browser screenshots and viewport matrix

Screenshots written under `docs/design/ux8-screenshots/` by `tests/e2e/public-intake.journey.spec.ts`:

| Viewport | Artifact |
|---|---|
| 320 / 375 / 390 / 768 / 1024 / 1440 | `event-{width}.png` |
| 390 Fun / When / Details | `fun-390.png`, `when-390.png`, `details-390.png` |

Verified: event selection, step transitions, Back, attractions, guest count, date/time select, draft restore, Start over, review edit, no horizontal overflow.  
Keyboard-occlusion of OS keyboards: **not claimed** (Chromium desktop harness).

---

## 13. Tests added / updated

| Test | Coverage |
|---|---|
| `tests/unit/intake-journey.test.ts` | 4-step IA, time round-trip, journey validation |
| `tests/unit/intake-draft.test.ts` | No PII, version/expiry, tenant isolation, stale attractions |
| `tests/unit/public-intake-wizard.test.tsx` | Journey UX, payload, Back/Next, review edit, pending/error, attraction required, draft restore |
| `tests/unit/public-customer-shell.test.tsx` | H1 “Plan your event” |
| `tests/e2e/public-intake.smoke.spec.ts` | Updated for 4-step journey |
| `tests/e2e/public-intake.journey.spec.ts` | Viewport matrix + draft/start over/review (no production submit) |

---

## 14. Validation results

| Check | Result |
|---|---|
| `corepack pnpm lint` | Passed |
| `corepack pnpm typecheck` | Passed |
| `corepack pnpm test:unit` | Passed |
| `corepack pnpm build` | Passed |
| `PLAYWRIGHT_PUBLIC_ORG_SLUG=magiccrm-test-center-b pnpm test:e2e:public` | **Passed** (26/26: desktop + mobile; smoke + journey + token) |
| Focused public integration | Not re-run as a UX8 gate; see §17 |

---

## 15. Files changed

- `src/components/layout/public-intake-wizard.tsx`
- `src/components/layout/public-inquiry-view.tsx`
- `src/lib/event-planner/intake-journey.ts` *(new)*
- `src/lib/event-planner/intake-draft.ts` *(new)*
- `src/app/globals.css`
- `planning/architecture/ui-conventions.md`
- `package.json` (`test:e2e:public` includes journey spec)
- `tests/unit/public-intake-wizard.test.tsx`
- `tests/unit/intake-draft.test.ts` *(new)*
- `tests/unit/intake-journey.test.ts` *(new)*
- `tests/unit/public-customer-shell.test.tsx`
- `tests/e2e/public-intake.smoke.spec.ts`
- `tests/e2e/public-intake.journey.spec.ts` *(new)*
- `docs/design/UX8_CUSTOMER_INTAKE_OVERHAUL.md` *(new)*
- `docs/design/ux8-screenshots/*` *(generated by Playwright)*

---

## 16. Known limitations

- Food/space/budget/length remain required every inquiry (backend contract); UX groups them but cannot omit them without a domain change
- Draft restore is browser-local only; private mode / cleared storage loses preferences
- Start-time options are a fixed 09:00–21:00 half-hour menu (still exact `HH:mm`, not a vague daypart)
- Venue IANA zone label is not yet surfaced from `listPublicPlannerCatalog` (civil semantics unchanged; generic venue-local copy)
- OS mobile keyboard occlusion not verified in this Chromium harness

---

## 17. Remaining UX7 release blockers

Carried forward unchanged (UX8 did **not** fix invitation-domain failures):

1. Two failing `team-invitations` integration tests (`keeps queued groups…`, `reconciles already-revoked…`)
2. Incomplete focused integration runs due to slow Neon TEST branch latency
3. No authenticated staff Playwright storage state
4. No safe valid proposal browser fixture

Full `pnpm test:integration` was not used as a UX8 pass signal.

---

## 18. Recommended follow-up improvements

- Optional backend flags to defer food/space when not applicable
- Surface venue IANA timezone label on the When step from catalog loader
- Staff Playwright auth fixture + proposal happy-path smoke
- Resolve `team-invitations` TEST failures and re-run focused integrations with bounded timeouts
- Consider richer activity media only when tenant-provided assets exist (never invent images)

---

**STOP.** UX8 ends here.
