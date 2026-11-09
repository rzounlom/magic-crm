# WordPress ↔ MagicCRM pricing reconciliation

- Export source: `plugin_defaults_snapshot`
- Catalog revision: `889a29ae88d4`
- Exported at: `2026-11-09T19:33:26.519Z`
- Summary: 33 match, 2 different, 0 missing product, 22 unmapped WP keys, 0 WP custom packages

## Different prices (WP baseline vs MagicCRM catalog)
- `food.salad` → `salad-pan.amountCents`: WP 2499¢ vs MagicCRM 1999¢
- `rooms.lower_extra` → `lower-event-room.additionalHourCents`: WP 7500¢ vs MagicCRM 5000¢

## Matching prices
_Count: 33_
- `bowling.hour_weekday` = 3000¢ (`bowling-1h`)
- `bowling.hour_weekend` = 4000¢ (`bowling-1h`)
- `bowling.shoes` = 350¢ (`bowling-1h`)
- `bowling.exclusive_hour` = 52500¢ (`bowling-lounge-1h`)
- `bowling.exclusive_two` = 75000¢ (`bowling-lounge-2h`)
- `bowling.all_access` = 5500¢ (`all-access`)
- `axe.half` = 1750¢ (`axe-throwing-30`)
- `axe.hour` = 3000¢ (`axe-throwing-60`)
- `axe.xtreme` = 4500¢ (`axe-treme`)
- `axe.private` = 150000¢ (`axe-den-2h`)
- `laser.pass` = 2500¢ (`unlimited-laser-tag-90`)
- `laser.plex` = 2000¢ (`laser-plex-card`)
- `laser.private` = 55000¢ (`laser-tag-arena-90`)
- `laser.private_sat` = 59900¢ (`laser-tag-arena-sat-hourly`)
- `food.combo` = 2000¢ (`pizza-pitcher-combo`)
- `food.boneless` = 3699¢ (`boneless-wings-36`)
- `food.traditional` = 3849¢ (`traditional-wings-36`)
- `food.pretzels` = 2699¢ (`pretzel-bite-platter`)
- `food.strips` = 4999¢ (`chicken-strip-platter`)
- `food.boards` = 18113¢ (`charcuterie-boards`)
- `food.cookies` = 2070¢ (`cookie-tray`)
- `food.brownies` = 4554¢ (`brownie-tray`)
- `food.fajita` = 2500¢ (`fajita-bar`)
- `food.slider` = 3000¢ (`slider-bar`)
- `food.bbq` = 3500¢ (`smokehouse-bbq`)
- `rooms.lower` = 15000¢ (`lower-event-room`)
- `rooms.upper` = 25000¢ (`skybox`)
- `rooms.upper_extra` = 9900¢ (`skybox`)
- `mezzanine.sun_thu` = 275000¢ (`mezzanine-sun-thu`)
- `mezzanine.fri` = 475000¢ (`mezzanine-friday`)
- `mezzanine.sat_before` = 549500¢ (`mezzanine-saturday`)
- `mezzanine.two` = 309500¢ (`mezzanine-2h-fri-sat`)
- `facility.before` = 549500¢ (`full-facility-before-4-sun-fri`)

## Missing MagicCRM products for mapped WP keys
_None._

## Unmapped WP catalog keys
- `bowling.half_weekday`
- `bowling.half_weekend`
- `bowling.game_weekday`
- `bowling.game_weekend`
- `bowling.exclusive_peak`
- `bowling.pins`
- `axe.private_sat`
- `laser.game`
- `laser.thursday`
- `laser.games`
- `laser.blast`
- `golf.adult`
- `golf.child`
- `climb`
- `pitcher`
- `drink_card`
- `rooms.cove`
- `mezzanine.sat_after`
- `facility.sat_before`
- `facility.sun_thu_after`
- `facility.fri_after`
- `facility.sat_after`

## Package / tax / eligibility notes
- WordPress export has zero active custom packages. MagicCRM booking-catalog package SKUs (Have a Ball, etc.) are a separate catalog model — not silently merged.
- WordPress F&B tax rate in export: 0.07. MagicCRM WP-parity engine hardcodes 0.07 like the plugin.
- MagicCRM booking-catalog seed does not store a parallel tax rate field for these SKUs.
- Weekday specials, package eligibility, arcade credit allocation, and food inclusions live in the WP Engine/Packages rules (ported to TypeScript), not as MagicCRM catalog rows.
- Do not treat MagicCRM product presence as proof of WP package eligibility parity.

## MagicCRM-only product slugs (not in WP mapping — review separately; do not overwrite Production)
- `have-a-ball-bowling`
- `have-a-ball-mini-golf`
- `have-a-blast`
- `have-it-all`
- `unlimited-arcade-1h`
- `laser-plex-package`
- `play-axtion`
- `climbers-cove-90`
- `full-facility-sat-after-4`
- `full-facility-after-4-mon-thu`
- `full-facility-after-4-friday`
- `full-facility-after-4-saturday`
- `field-trip-laser-arcade`
- `field-trip-laser-bowling`
- `field-trip-laserplex`
- `field-trip-bowling`
- `youth-group-lock-in`
- `full-facility-additional-hour`
- `mezzanine-additional-hour`
- `breakfast-bar`
