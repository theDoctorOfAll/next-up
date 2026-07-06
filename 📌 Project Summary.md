# Project Summary

## Overview

**Next Up** is a local-first Progressive Web App for selecting and motivating play from a personal video game library.

The core idea is to reduce decision fatigue by randomly selecting games from curated pools while eventually rewarding actual playtime through a points-based economy.

The app currently uses:

- React + TypeScript
- Vite
- IndexedDB via Dexie
- TailwindCSS
- React Router

## Core Game System Design

### Game Pools

Each game belongs to exactly one primary pool:

1. **Daily Pool**
   - Short-session games
   - Roguelikes, replayable games, quick play sessions
   - Examples: Hades, Slay the Spire, Forza Horizon 5

2. **Weekly Pool**
   - Longer narrative or progression games
   - Can span multiple sessions across a week
   - Examples: Stardew Valley, Final Fantasy VII Remake, Star Wars Outlaws

3. **Reserve Slot**
   - Intended as a manually selected backup game
   - Excluded from RNG pools
   - Persistent until changed
   - Data model and board service support exist
   - Full UI/rules are still future work

## Roll System

### Daily Roll

- Selects one eligible daily game
- Uses weighted random selection
- Excludes reserved games
- Stores the selected game on `BoardState.dailyGameId`
- Records a `ROLL_DAILY` event
- First roll of the local day is free
- Same-day rerolls cost points through the rules engine

### Weekly Roll

- Selects one eligible weekly game
- Uses weighted random selection
- Excludes reserved games
- Stores the selected game on `BoardState.weeklyGameId`
- Records a `ROLL_WEEKLY` event
- First roll of the local week is free
- Same-week rerolls cost points through the rules engine

### Current Roll Safety

- Roll use cases retrieve candidates through `getEligibleGames(pool)`
- Direct `db.games.filter(...)` access has been removed from roll logic
- Rolls throw if a selected game is missing an ID
- `BoardView` uses TypeScript narrowing before looking up board game IDs
- Board mutations now flow through `BoardService`
- Reroll eligibility and costs now flow through `rulesEngine`

## Points Economy

The points system is implemented as a ledger, and the first spending rule is now active.

### Implemented Spending

| Action | Cost |
| --- | ---: |
| Reroll daily game during the same local day | 5 pts |
| Reroll weekly game during the same local week | 10 pts |

Implemented behavior:

- Reroll costs are evaluated before selection
- Insufficient balance blocks rerolls
- Point spending records a `POINTS_SPENT` event
- Ledger debits are written as negative point transactions

### Planned Passive Earning

- +15 points: playing daily game
- +10 points per 30 minutes played
- +10 points per non-player multiplayer session

### Planned Weekly Progression Bonus

- Day 1 played: 15 pts
- Day 2-3: 20 pts
- Day 4-5: 25 pts
- Day 6-7: 30 pts

### Planned Spending

| Action | Cost |
| --- | ---: |
| Change pool | 10 pts |
| Adjust game weight | 15 pts |
| Move to reserve | 25 pts |
| Add new game | 500 pts |

## Event Log System

Every major action is intended to be logged as an immutable event.

Current event types:

- `GAME_CREATED`
- `GAME_UPDATED`
- `GAME_DELETED`
- `ROLL_DAILY`
- `ROLL_WEEKLY`
- `PLAY_RECORDED`
- `POINTS_AWARDED`
- `POINTS_SPENT`
- `RESERVE_SET`
- `WEIGHT_CHANGED`

## Current Data Layer

### Dexie Database

Database name: `nextup`

Current schema version: `3`

Tables:

- `games: "++id, title, pool, reserved"`
- `events: "++id, type, timestamp"`
- `points: "++id, timestamp"`
- `board: "id"`
- `metadata: "key"`

### BoardState

```ts
interface BoardState {
  id: number;

  dailyGameId?: number;
  weeklyGameId?: number;
  reserveGameId?: number;

  dailyRolledAt?: number;
  weeklyRolledAt?: number;

  dailyPlayed: boolean;
  weeklyPlayed: boolean;
}
```

### Metadata

The `metadata` table tracks app/data initialization state, including the initial library seed marker.

## Current Implementation State

### Working

- Dexie database initializes correctly
- Games persist correctly
- Board state persists correctly
- Daily roll works
- Weekly roll works
- UI updates after rolls
- Basic event logging exists
- Basic points ledger exists
- Game library initialization is stabilized
- Seed data is idempotent and correctly classifies daily/weekly games
- Board updates are centralized through `BoardService`
- Initial reroll rules and point spending are implemented
- The board now shows a front-facing point balance
- Users can add games directly to the daily or weekly RNG pools from the board
- A basic full-library view is available from the app navigation

### Completed: Milestone 2.2.1 - Game Library Stabilization

- Added centralized `GameLibraryService`
- Added `validateGame` helper with `assertValidPool`
- Replaced unsafe ad-hoc seed logic with `seedGamesOnce`
- Restricted seed execution to development startup
- Added duplicate title prevention and repair logic
- Added pool validation before service-layer creation/query flows
- Removed direct `db.games.add(...)` usage outside the repository layer
- Added `getEligibleGames(pool)` for roll use cases
- Added roll guards for missing selected game IDs
- Added `debugGameIntegrity` dev helper
- Added Dexie `metadata` table for seed state
- Deleted the old unsafe `useDBTest` hook

### Recently Added: Minimal Front-Facing UI Slice

- Added a point balance card to the main board view
- Added a lightweight form for adding games to the daily or weekly pools
- Added a library page that lists the full game collection with pool and weight information
- Wired the board and library pages into the app router for quick access

### In Progress: Milestone 2.3 - Board Service and Rules Foundation

Completed in the first slice:

- Added `BoardService`
- Added `getCurrentBoard`
- Added `updateDailyGame`
- Added `updateWeeklyGame`
- Added `setReserveGame`
- Added `lockDaily`
- Added `lockWeekly`
- Added `resetWeekly`
- Refactored daily/weekly roll use cases to stop mutating board state directly
- Added `rulesEngine`
- Added free first daily/weekly roll logic
- Added paid reroll cost checks
- Added point spending for rerolls

Remaining in this milestone:

- Add play-recording use cases
- Move point awards from conceptual design into explicit play events
- Enforce daily/weekly lock behavior after play
- Add board reset behavior for local day/week boundaries
- Add reserve slot rule checks
- Add rule-focused tests or debug validation helpers

### Known Manual Cleanup Step

If the browser already contains bad historical IndexedDB data, a one-time reset may still be useful:

```js
indexedDB.deleteDatabase("nextup");
```

After restarting the app in development, the dev seed will repopulate the library safely.

## Current Architecture

### Strengths

- Clearer separation between repository, domain service, rules, and UI layers
- Game creation flows through a centralized service
- Board mutation flows through `BoardService`
- Roll rules flow through `rulesEngine`
- Repository remains mostly dumb CRUD
- Roll logic no longer owns game filtering details
- Event-driven extensibility remains in place
- Board state remains the source of truth for current selections
- Local persistence works reliably through IndexedDB

### Remaining Weaknesses

- Rules engine is still small and roll-focused
- Point earning is not yet implemented from actual play
- Daily/weekly lock rules are not fully enforced
- Reserve slot mechanics are only partially represented
- Library editor UI is still minimal and does not yet support full CRUD or advanced pool management
- Event log and statistics UIs are still placeholders
- No automated test suite exists yet

## Current Source Map

Important files:

- `src/domain/services/GameLibraryService.ts`
- `src/domain/services/BoardService.ts`
- `src/domain/services/validateGame.ts`
- `src/domain/rules/rulesEngine.ts`
- `src/dev/seedGames.ts`
- `src/dev/debugGameIntegrity.ts`
- `src/hooks/useAppInitialization.ts`
- `src/database/db.ts`
- `src/database/repositories/gameRepository.ts`
- `src/database/repositories/boardRepository.ts`
- `src/database/repositories/pointRepository.ts`
- `src/domain/useCases/rollDailyGame.ts`
- `src/domain/useCases/rollWeeklyGame.ts`
- `src/domain/queries/getBoardView.ts`
- `src/pages/Board.tsx`

## Development Philosophy

This app is transitioning from:

> functional prototype

to:

> rule-driven local game economy system

Key principle:

> State changes should flow through domain services instead of raw UI or direct database access wherever practical.

Milestone 2.2.1 moved the game library into that model. Milestone 2.3 has begun moving board state and roll rules into that model.

## Project Timeline

This timeline assumes focused solo development and small, testable slices. Dates are relative to the current project state on July 5, 2026.

### Phase 1 - Foundation Stabilization: Complete

Status: complete.

Delivered:

- Persistent Dexie schema
- Board state persistence
- Daily/weekly roll loop
- Game library service
- Safe development seed
- Duplicate prevention
- Pool validation
- Initial board service
- Initial roll rules

### Phase 2 - Board + Rules Completion: Next 1-2 Sessions

Goal:

- Finish Milestone 2.3 and the first useful part of Milestone 3.

Deliverables:

- `recordDailyPlay`
- `recordWeeklyPlay`
- Play-based point awards
- Daily/weekly lock enforcement
- Weekly progression bonus calculation
- Local day/week reset helpers
- Reserve slot rule foundation
- Cleaner user-facing failure messages

Exit criteria:

- Rolls, rerolls, play recording, locks, and point changes all flow through domain/rules services.

### Phase 3 - Library + Reserve UI: Next 2-3 Sessions

Goal:

- Make the game library manageable inside the app instead of seeded only through dev code.

Deliverables:

- Library list page
- Add/edit game form
- Pool switching with point cost
- Weight adjustment with point cost
- Reserve slot controls
- Basic validation and error UI

Exit criteria:

- The app can manage its own game library without code changes or console intervention.

### Phase 4 - Event Log + Stats: Next 1-2 Sessions

Goal:

- Make the economy visible and inspectable.

Deliverables:

- Event log page
- Point ledger display
- Current point balance display
- Roll/play history
- Basic statistics dashboard

Exit criteria:

- The user can understand why the current board and point balance are what they are.

### Phase 5 - PWA Polish + Persistence Hardening: Next 1-2 Sessions

Goal:

- Turn the app into a polished local-first tool.

Deliverables:

- PWA manifest
- App icon polish
- Offline-ready shell
- Settings page
- Export/import backup flow
- Database reset tool
- Empty/error/loading states

Exit criteria:

- The app feels safe to use as a real personal tracker.

### Phase 6 - Testing + Release Candidate: Final 1-2 Sessions

Goal:

- Reduce regression risk before treating the app as stable.

Deliverables:

- Unit tests for rules engine
- Unit tests for game library service
- Board service tests
- Manual QA checklist
- Final README rewrite
- Production build verification

Exit criteria:

- Core flows are tested and the app is ready for regular personal use.

## Next Milestones

### Milestone 2.3 - Finish Board Service Layer

Remaining work:

- Add play recording through board service/rules service
- Enforce lock state after play
- Add day/week reset helpers
- Ensure all board state changes are centralized

### Milestone 3 - Rules Engine Activation

Implement:

- Point earning from play
- Weekly progression bonus
- Reroll lock/permission logic
- Reserve slot rules
- Pool change costs
- Weight adjustment costs
- Add-game cost

### Milestone 4 - UI Expansion

Build:

- Reserve slot UI
- Game library editor
- Event log panel
- Stats dashboard
- Settings controls

## Current System State Summary

The core loop works:

```text
roll -> rule check -> select -> store -> display
```

The game library layer is stable enough for continued feature work:

- Duplicate creation is guarded
- Seed data is safe and repair-capable
- Pool assignment is validated
- Roll selection uses service-layer queries
- Invalid selected game IDs are no longer silently accepted

The board/rules layer has started:

- Board mutation is centralized
- Reroll costs are enforced
- Point spending exists for rerolls
- Play recording and lock enforcement are the next major step
