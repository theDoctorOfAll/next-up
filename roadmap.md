# Roadmap

## Current status

The project has moved beyond the prototype stage and now includes a working board loop, persistent economy state, reserve management, and dedicated visibility pages. The current focus is refinement, polish, and reliability rather than foundational plumbing.

## Completed milestones

### Phase 1 — Foundation stabilization (Complete)

Delivered:
- persistent Dexie/IndexedDB storage
- board-state persistence
- daily and weekly roll flow
- game-library service
- safe development seed logic
- duplicate prevention and pool validation
- initial board-service and roll-rule foundations

### Phase 2 — Board and rules foundation (Complete)

Delivered:
- daily and weekly play recording
- play-based point rewards
- daily and weekly lock enforcement
- reroll cost enforcement and point spending
- reserve-slot rules and board-state updates
- clear event and point ledger behavior

### Phase 3 — Front-facing UI slice (Complete)

Delivered:
- point-balance display
- add-game flow from the board
- full-library view with pool grouping
- improved board layout with daily/weekly cards and flyout controls

### Phase 4 — Library and reserve management (Complete)

Delivered:
- reserve-slot UI on the board
- 25-point reserve move cost
- reserved-game section in the library
- removal of reserved titles from their active pool view
- pool-based library browsing with expandable game details

### Phase 5 — Economy visibility (Complete)

Delivered:
- event log page
- statistics dashboard
- route-based navigation for board, library, events, and stats

### Phase 6 — Library refinement and gameplay depth (Complete)

Delivered:
- weight adjustment actions with 15-point costs
- step-based weight storage to avoid floating-point drift
- platform tagging for games and library editing
- playtime entry in 30-minute blocks and playtime-based scoring
- direct weight-adjustment affordances from the library list

### Phase 7 — Settings and data portability (Complete)

Delivered:
- local state reset controls
- developer utility for point grants
- library CSV export flow
- library CSV import flow with title-based upsert behavior

## Near-term priorities

### Phase 8 — Polish and hardening

Planned work:
- refine empty states and interaction feedback
- add platform-based filtering and search
- add backup or export-friendly flows

### Phase 9 — Testing and release readiness

Planned work:
- rules-engine tests
- board-service tests
- library-service tests
- manual QA checklist
- final production verification
