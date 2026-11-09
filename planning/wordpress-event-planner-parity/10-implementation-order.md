# 10. Implementation order

1. Planning docs (this folder)  
2. WP intake contract + validation mapping  
3. Thank-you submit path (inquiry + metadata; no `/plan`; no Booking)  
4. Focused unit tests  
5. Single-page form UI  
6. Staff detail: answers + private snapshot panel  
7. WP calculation port + golden parity tests  
8. Custom packages / day specials / reports / staff timer  

## First safe slice (shipped on this branch)

- Branch `wordpress-parity-public-intake`
- Planning docs
- Contract + Zod validation
- `createPublicWpEventInquiry` + action + thanks route
- Validation / persistence / no-booking / status tests
- WP-parity form UI + staff answers panel + calculator scaffold

Out of scope still: full golden Engine port vs 332 PHP fixtures, Production catalog/price/env changes, Scenario Lab, merge/deploy.
