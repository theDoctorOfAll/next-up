# Next Up

Next Up is a local-first Progressive Web App for managing a personal game library through a daily/weekly rhythm and a lightweight points economy. The app runs entirely in the browser and persists board state, events, point transactions, and library data in IndexedDB.

## What the app does

- selects a daily game and a weekly game from curated pools
- lets players mark games as played and earn points
- supports playtime input in 30-minute blocks and rewards longer sessions
- enforces reroll costs and period-based lock logic
- supports a reserve slot with a 25-point move cost
- keeps reserved games out of the active pools and shows them in a dedicated library section
- supports per-game platform tagging for later filtering and discovery
- includes settings tools for reset, developer point grants, and library CSV import/export
- provides event-history and statistics views for the current economy state

## Current status

Implemented features include:

- daily and weekly roll flow with rule evaluation
- play recording and reward-based point earning
- reroll cost enforcement and point spending
- reserve-slot UI and board-state updates
- pool-based library browsing with expandable details
- reserved-game grouping in the library
- weight adjustments with step-based values and costed actions
- platform tagging on games and library editing
- playtime-aware scoring with 30-minute playtime units
- settings page tools for reset, CSV export/import, and developer point grants
- event log and stats pages
- route-based navigation for board, library, events, and stats

## Project documentation

- [architecture.md](architecture.md) — current system design and module boundaries
- [roadmap.md](roadmap.md) — completed milestones and near-term priorities
- [game-rules.md](game-rules.md) — gameplay and economy rules

## Tech stack

- React + TypeScript
- Vite
- TailwindCSS
- Dexie + IndexedDB
- React Router

## Development

Install dependencies and start the app:

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Near-term focus

- polish empty states and interaction feedback
- add platform-based filtering and search
- expand settings and reset controls
- add automated tests around rules and board services
