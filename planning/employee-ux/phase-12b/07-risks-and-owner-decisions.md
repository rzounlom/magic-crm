# Phase 12B — Risks, migration, owner decisions

## Risk assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Shell redesign breaks sticky schedule/inquiry layouts | Medium | 12C visual QA on schedule + inquiry detail; preserve CSS clearance vars |
| Dashboard counts disagree with inquiry queue labels | High (trust) | Extract shared pure classifiers from queue; single source of labels |
| Staff can’t find Public Inquiry after demotion | Medium | Overflow + Home secondary + short release note |
| Sidebar reduces horizontal space for boards | Medium | Collapsible sidebar; board pages use full remaining width |
| Permission-gated empty home feels broken | Low | Role-specific empty copy + link to ask admin |
| Accidental domain logic changes during “visual only” PRs | High | Explicit PR checklist: no pricing/WP/booking service edits |
| Fake location selector reintroduced | Medium | Spec forbids until switch workflow exists; code review gate |
| Clerk switcher vs business name confusion | Low | Ambient DB name + switcher only when multi-org |
| Scope creep into full page redesigns in 12C | Medium | 12C limited to shell + `/app` |

## Migration approach

1. Ship **chrome** behind a single layout change (all `/app/*` inherit)  
2. Replace Home content; keep old quick links temporarily in a “All tools” disclosure if needed for one release  
3. Restyle modules incrementally (12D–G) without changing server actions  
4. No data migrations required for UX phases  

## Rollback

Layout/CSS revert via PR revert. No schema rollback. Dashboard loaders are read-only.

---

## Decisions requiring owner review

1. **Approve sidebar + compact top bar** as the shell direction (vs refined horizontal nav only)?  
2. **Primary nav set:** Home, Inquiries, Bookings, Schedule — with Knowledge/Resources under Tools?  
3. **Public Inquiry** default home: overflow menu + Home secondary (recommended)?  
4. **Dashboard Phase 12C metrics:** unread + pending confirmation + awaiting staff review + today’s bookings — confirm; omit draft-quote tile until filter is proven?  
5. **Business name in chrome:** always `organization.name` (never slug) — confirm?  
6. **Location:** keep read-only until a real multi-location switch workflow is scoped — confirm?  
7. **Settings hub page** now vs later?  
8. **Priority of 12D (Inquiries) vs 12E (Schedule)** after shell — which hurts daily work more?  
9. Any **branding** preference for employee shell (keep MagicCRM mark vs tenant logo later)?  
10. Approve **no Production changes until 12C PR** after this proposal sign-off?

---

## Out of scope reminders

- Inquiry intake, EP 3.5.0, pricing, quotes, bookings, availability, hours logic, permissions model, email, payments  
- Public landing / public inquiry redesign  
- WordPress plugin / Scenario Lab  
- Vercel Preview / Production deploys for 12B artifacts branch  
