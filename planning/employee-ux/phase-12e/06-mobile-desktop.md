# Phase 12E — Mobile vs desktop usability

Viewports exercised: **375**, **430** (via prior 12D evidence), **768** (12D), **1024+** via 1440 desktop session, **1920** not separately re-captured (layout matches 1440 shell). Live captures: 1440 Home/queue/WP/LA; 375 LA (loading flash) + 12D queue 375 reused.

## Desktop (≥1024 / 1440)

- Sidebar Primary / Tools / Settings readable; Inquiries current state clear.
- Queue cards ~10px gap (12D) — easy scan.
- WP tabs usable; Staff quote line grid 4-column on `sm+`.
- LA coach stepper readable in one horizontal band.
- Touch not applicable; keyboard: tabs implement Arrow/Home/End (good).

## Tablet (768)

- From 12D evidence: queue stacks well; cards remain tappable.
- Quote editor collapses toward single column — long scroll for many lines.

## Phone (375 / 430)

| Interaction | Assessment |
|---|---|
| Bottom nav Home / Inquiries / Schedule / More | Reachable; More hides Bookings/Tools/Settings |
| Org chip truncation (“Generatio…”) | Acceptable |
| Queue cards | Full-width; next-action text can wrap heavily |
| WP tabs | Horizontal scroll tablist — OK; min-h-10 touch targets OK |
| Quote line editor | **Cumbersome**: many stacked Item/Qty/Unit cents fields; easy to lose place |
| Save / Approve | Below long form — risk of sticky/obscured actions without sticky footer |
| LA HOLD + confirmation panels | Long vertical scroll; coach duplicates amplify length |
| Return to queue | “Back to inquiries” present — good |
| Session loading splash | Observed on viewport switch — brief “Getting your workspace ready” (auth remount) |

## Desktop-OK / mobile-painful

1. Editing multi-line staff quotes (Unit cents especially).
2. Comparing 4 recommendation alternatives (must scroll entire itineraries).
3. LA readiness double panels + history dump.
4. Notifications “9+” / 12 unread compete with primary CTA on small Home.

## Keyboard / focus

- Inquiry tabs: WAI-ARIA pattern present.
- Focus management after tab change: focuses tab control (good); does not move focus into panel (acceptable).
- Archive confirm dialog markup present in DOM when closed — verify focus trap when opened (not fully exercised; no Production archive).
