# Roadmap

## Current status

The current release is considered feature-complete.

The app includes the full intended core loop (board, library, reserve, economy, event visibility, stats, CSV portability, and PWA installability). New development is now driven by real user feedback rather than pre-planned feature phases.

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
- unified play-session recording for daily, weekly, and reserve slots
- playtime entry in 15-minute increments and playtime-based scoring
- direct weight-adjustment affordances from the library list

### Phase 7 — Settings and data portability (Complete)

Delivered:
- local state reset controls
- developer utility for point grants
- library CSV export flow
- library CSV import flow with title-based upsert behavior

### Phase 8 — Shell, installability, and interaction polish (Complete)

Delivered:
- installable PWA build with manifest and generated service worker
- runtime-responsive shell with desktop rail and mobile overlay sidebar
- bottom overlay toast dialogs for transient action feedback
- reroll cost feedback on board cards
- reroll behavior that avoids reselecting the same title when alternatives exist

This is the current status of development.

### Phase 9 - Ease of Use (Incomplete)

Planned features:
- Onboarding flow for new users (at /next-up, automatically redirects to /next-up/board for returning users)
  - (Includes option to restore data from backup)
  - Allows for manual library entry (with game cover selection)
  - Chooses objectives (i.e., explore everything, burn the backlog)
- Gameplay tweaks
  - Introduce completion mode, limiting daily and weekly games to incomplete titles
  - (Adding games costs ♦1000 in completion mode, but completing games gives ♦150)
  - Add controls for excessive gameplay (e.g., ♦5 per 30 minutes past the 2-hour mark, for instance)
  - Allow for game mode switching with 1-week cooldown
- Game covers
  - Pull and cache game covers off of IGDB, implementing them in the game board and library
  - Surface daily, weekly, and reserve games as cover-first board cards
  - Covers can be viewed and changed in Library
- Play History
  - Rename Statistics tab
  - Include playtime, total ♦ earned and spent
  - Most played title of all time/this month
  - Add playtime to game library entry
  - Include average playtimes
