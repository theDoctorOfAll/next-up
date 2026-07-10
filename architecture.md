# Architecture

## Overview

Next Up is a local-first Progressive Web App for selecting games from a personal library using daily and weekly pools. The app is organized around a small domain layer that sits between the UI and the local IndexedDB persistence layer.

## Current system structure

### 1. UI layer

The presentation layer is built with React and TypeScript. The main experience is centered around the board page, while the library, events, stats, and settings pages expose the current collection and economy state.

Responsibilities:
- render the board, point balance, reserve slot, and game-selection controls
- trigger domain actions such as rolling, recording play, reserving games, and adding games
- collect platform tags and 15-minute playtime input for library entries and play recording
- provide utility workflows such as local reset, developer point grants, and CSV import/export for the library
- present feedback from the rules and persistence layers through transient toast dialogs
- adapt navigation layout between a desktop sidebar rail and a mobile overlay drawer based on runtime aspect ratio

### 2. Domain layer

The domain layer contains the app’s core behavior and business rules.

Key areas:
- use cases for rolling daily and weekly games
- a unified play-session use case for daily, weekly, and reserve sessions
- compatibility wrappers for legacy daily and weekly play entry points
- a rules engine for roll eligibility, reroll costs, play rewards, playtime scoring in 15-minute units, lock state, and reserve behavior
- board services for managing the live board state
- library services for validating, adding, grouping games, and adjusting weights/platform metadata
- query helpers for the board view, event log, and stats summary

This layer is the main boundary for app behavior. The UI should not directly mutate board state or game data.

### 3. Persistence layer

Persistence is handled through Dexie on top of IndexedDB. The app currently uses:
- a games table for the library
- an events table for immutable action history
- a points table for the ledger-based economy
- a board table for the current daily, weekly, and reserve selections
- a metadata table for initialization state and seed safety

The production build also includes a generated service worker and manifest so the app can be installed and served as a Progressive Web App.

### 4. Data flow

The main lifecycle is:
1. the app initializes the database and seeds development data if needed
2. the board view is loaded from the current board state and referenced game records
3. the user rolls a daily or weekly game, records play, or updates the reserve slot
4. the rules engine determines whether the action is allowed and what cost or reward applies
5. the relevant board state and event/point records are updated
6. the board, library, or visibility views are refreshed and shown to the user
7. transient UI feedback is displayed through bottom-of-screen toast dialogs

## Critical infrastructure

### Local persistence

IndexedDB is the critical infrastructure for the app because the product is designed to work entirely offline and locally. The database needs to remain stable as new rules and UI flows are introduced.

### Rules engine

The rules engine is the decision center for the app economy. It governs:
- whether a roll is allowed
- whether rerolls are allowed
- the cost of rerolls
- whether a play session can be recorded for a given pool
- the reward for recording play, including playtime bonuses
- whether a game can be moved into the reserve slot

The current playtime reward model applies +5 points per 15-minute playtime unit provided during play recording.

### Board state

The board is the shared source of truth for the current daily and weekly selections, the reserve slot, and whether those selections have already been played in the current period.

### Event and points ledger

Events and points are append-style records that can be inspected later. This creates a reliable audit trail for rolls, point changes, reserve actions, and play activity.

### Development bootstrap

The development seed and initialization workflow exist to make the app usable quickly without manual setup. They should remain predictable and idempotent.

### Progressive Web App infrastructure

The app shell is built for installability. Vite generates the service worker and manifest during production builds, and the client registers the worker at startup so cached assets and offline-ready behavior are available after install.

## Current architectural direction

The project is now in a stabilization phase after reaching a feature-complete release.

Primary architectural intent going forward:

- preserve the current domain boundaries and data model
- keep state transitions concentrated in domain services and rule logic
- avoid broad structural rewrites unless reliability or maintainability requires them
- implement incremental changes based on observed user feedback

In practice, architecture changes should be evolutionary, not foundational, unless critical issues are discovered in production usage.
