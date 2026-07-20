# Next Up

Next Up is a local-first Progressive Web App for managing a personal game library through a daily/weekly rhythm and a lightweight points economy. The app runs entirely in the browser and persists board state, events, point transactions, and library data in IndexedDB.

## What the app does

- selects a daily game and a weekly game from curated pools
- lets players record daily, weekly, and reserve play sessions and earn points
- lets players record multiplayer sessions for any multiplayer-tagged title
- supports playtime input in 15-minute increments and rewards longer sessions
- enforces reroll costs and period-based lock logic
- supports a reserve slot with a 25-point move cost
- keeps reserved games out of the active pools and shows them in a dedicated library section
- supports per-game platform tagging for later filtering and discovery
- supports a per-game multiplayer flag in library metadata
- includes settings tools for reset, developer point grants, and library CSV import/export
- provides event-history and statistics views for the current economy state
- installs as a Progressive Web App with a generated service worker and offline-ready asset caching
- switches to a collapsible overlay sidebar on mobile-like aspect ratios
- shows transient bottom-of-screen toast dialogs for status feedback

## Current status

Implemented features include:

- daily and weekly roll flow with rule evaluation
- unified play-session recording for daily, weekly, and reserve slots
- reroll cost enforcement and point spending
- reserve-slot UI and board-state updates
- pool-based library browsing with expandable details
- reserved-game grouping in the library
- weight adjustments with step-based values and costed actions
- platform tagging and multiplayer metadata on games and library editing
- playtime-aware scoring with 15-minute reward units
- multiplayer session logging with player-count-based rewards
- settings page tools for reset, CSV export/import, and developer point grants
- event log and stats pages
- route-based navigation for board, library, events, and stats
- installable PWA output with generated manifest and service worker
- responsive app shell with desktop rail and mobile overlay drawer
- transient toast-based interaction feedback

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

Preview the production PWA locally:

```bash
npm run preview
```

To verify installability, open the preview build in a Chromium-based browser and inspect the Application panel for the active service worker and manifest.

Library CSV files currently use the columns `title,pool,weight,platforms,multiplayer,reserved`.

## IGDB Integration (Phase 1)

Phase 1 introduces a secure Cloudflare Worker proxy for IGDB search. This keeps Twitch/IGDB credentials off the browser client and enables debug-screen cover lookups.

Worker location:

- `igdb-worker/`

### 1. Install worker dependencies

```bash
cd igdb-worker
npm install
```

### 2. Configure local secrets

Create `igdb-worker/.dev.vars` (gitignored) with:

```bash
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
```

### 3. Configure allowed origins

Edit `igdb-worker/wrangler.toml` and set `ALLOWED_ORIGINS` to your local and production origins, for example:

```toml
ALLOWED_ORIGINS = "http://localhost:5173,https://your-user.github.io"
DEFAULT_ORIGIN = "http://localhost:5173"
```

### 4. Run locally

```bash
cd igdb-worker
npm run dev
```

Endpoints:

- `GET /health`
- `POST /search`

Example request:

```bash
curl -X POST http://127.0.0.1:8787/search \
	-H "Content-Type: application/json" \
	-H "Origin: http://localhost:5173" \
	-d '{"query":"Elden Ring","limit":10}'
```

### 5. Deploy to Cloudflare

Set production secrets:

```bash
cd igdb-worker
wrangler secret put TWITCH_CLIENT_ID
wrangler secret put TWITCH_CLIENT_SECRET
```

Deploy:

```bash
cd igdb-worker
npm run deploy
```

### Developer mode and runtime toggles

Developer mode is disabled by default. In development, you can re-enable developer-only tools (such as reset/dev point controls and initial dev seeding) from the browser console:

```js
window.nextUp?.setDeveloperMode(true)
```

Then reload the app to apply initialization-time behavior.

Useful runtime commands:

- `window.nextUp?.getDeveloperMode()`
- `window.nextUp?.setDeveloperMode(false)`
- `window.nextUp?.setHighContrastMode(true)`
- `window.nextUp?.setHighContrastMode(false)`
- `window.nextUp?.getHighContrastMode()`

## Release status

Next Up is currently considered feature-complete for this release.

The active product strategy has shifted from feature delivery to maintenance and refinement:

- keep the current loop stable and reliable
- prioritize bug fixes and quality-of-life improvements
- evaluate new features only when recurring user feedback identifies clear value

## Post-release development policy

Further development will be feedback-driven.

Planned changes should generally meet at least one of these criteria:

- resolves a confirmed bug or regression
- improves accessibility, clarity, or usability
- reduces operational risk (data integrity, installability, portability)
- addresses repeated user requests with clear product impact
