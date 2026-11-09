# 6. Data-model compatibility

## First slice — no Prisma migration

| WP concept | Storage |
|---|---|
| adults / children | `adultGuestCount`, `childGuestCount`, `guestCount` |
| Full answers | `ConversationMessage.metadata` (`intakeVersion: wp-3.3.0`) |
| Yes attractions | `attractionInterestIds` when tenant mapping exists; otherwise keys only in metadata |
| Open / No | metadata `attractions` |
| Referral, alternate dates | metadata |
| Food / room / craft | existing preference columns |
| Budget | `budgetMax` cents when provided; Flexible otherwise |
| Private calc (later) | `EventPlanRecommendation.payload` with staff-only flags |

## Later additive migration (only if needed)

Explain before running: `Inquiry.intakeAnswers Json?`, `referralSource`, `alternateDates Json?` for first-class staff UI and reporting.
