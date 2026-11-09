# 2. WordPress 3.3.0 form field map

Source: plugin `includes/form.php`, `assets/planner.js`, rulebook sheet **Customer Questionnaire**.

| Field | Required | Options / validation | Engine use | MagicCRM mapping (first slice) |
|---|---|---|---|---|
| first_name | Yes | text ≤200 | Contact | `customerFirstName` |
| last_name | Yes | text ≤200 | Contact | `customerLastName` |
| company | Yes | text ≤200 | Group | `customerGroupName` |
| phone | Yes | tel | Contact | `customerPhone` (required in WP path) |
| email | Yes | email + domain check | Contact | `customerEmail` |
| event_type | Yes | Birthday; Corporate or Team Event; Sports Team; School or Youth Group; Family or Social Gathering; Other | Classification | `eventType` / `occasion` / `eventGoal` |
| dates[] | Yes | 1–5 ISO dates | Per-date candidates | primary → `desiredDate`; all in message metadata |
| time | Yes | `HH:mm` | Start | `desiredStartTime` |
| adults | Yes | 0–999 int | Counts | `adultGuestCount` |
| children | Yes | 0–999 int | Counts | `childGuestCount` |
| (combined) | Yes | 1–999 | Guest total | `guestCount`; derive `guestMix` / `audience` |
| duration | Yes | 2 hours / 3 hours / Other | Minutes | `desiredDurationMinutes` |
| other_hours | Cond. | 0.01–24 | Minutes when Other | → minutes |
| attractions[bowling\|axe\|laser\|golf\|climbing\|arcade] | Yes each | **yes / no / open** | Required / exclude / suggest | metadata + yes → interest ids when mapped |
| food | Yes | yes / no | Dining path | `diningPreference` WANTS_FOOD / NO_FOOD |
| private_room | Yes | yes / no | Room pricing | `spacePreference` private / no_preference |
| craft | Yes | yes / no | Drink cards | `beveragePreference` YES / NO |
| has_budget | Yes | yes / no | Ranking cap | when no → Flexible |
| budget | Cond. | positive currency | Cap cents | `budgetMax` (and `budgetMin` null) |
| description | Yes | ≤4000 | Occasion | `occasion` (+ notes excerpt) |
| comments | No | ≤8000 | Specials | `customerNotes` (truncated to column limit) |
| referral | Yes | ≤200 | Attribution | message metadata `referral` |
| website | Honeypot | must be empty | Spam | `companyWebsite` |

Attraction answer labels (approved-rules): Yes / No / Open to recommendations.

Staff-only fields (name, 15-minute timer, autosave) are deferred after public intake parity.
