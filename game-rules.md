# Game Rules

## Rules status

The rule set in this document is considered baseline-complete for the current release.

Future rule adjustments should be made only when:

- user feedback reveals consistent confusion or friction
- balancing issues are observed in regular usage
- correctness issues are found in event or points behavior

## Core Structure

Next Up uses three game buckets:

1. Daily pool
   - intended for short-session or replayable games
   - used for the daily selection

2. Weekly pool
   - intended for longer or more involved games
   - used for the weekly selection

3. Reserve slot
   - a manually held backup game
   - not part of the random selection flow

## Daily and Weekly Play

- Each day, one game is selected from the daily pool.
- Each week, one game is selected from the weekly pool.
- The selected game is the current daily or weekly title until the period changes or the game is replaced.

## Game Metadata

- Games can be tagged with one or more platforms such as PC, Switch, or Steam Deck.
- Platform tags are stored on each library entry so filtering and discovery can be added later.
- Games can be marked as multiplayer in their metadata.
- The multiplayer flag is stored with each library entry and is included in CSV import and export.

## Rerolls

- The first roll of a new day or week is free.
- Rerolling within the same day or week costs points.
- A game that has already been marked as played for the current period cannot be rerolled again for that period.
- When alternative eligible games exist, rerolling should not reselect the currently active title.

## Play Recording

- Play is recorded through a session flow rather than separate permanent daily and weekly controls.
- Daily, weekly, and reserve slots can all be selected for play-session recording when a title is present.
- Multiplayer session logging can be toggled from the same record-play menu.
- When multiplayer logging is enabled, any game tagged with multiplayer support can be selected, even if it is not on the current board.
- Recording a daily or weekly session locks that slot for the current period.
- Recording a reserve session awards only the playtime-based reward and does not apply the daily or weekly base reward.
- Recording a multiplayer session uses player count instead of playtime.
- Recording play awards points.
- Playtime is entered in 15-minute increments when a session is recorded.
- Multiplayer player count is entered on a 1 to 10 player slider.
- Zero-minute sessions are not valid.
- Once a daily or weekly game has been played for the period, it should not be treated as available for another play entry in that same window.

## Points Economy

The points system is implemented as a ledger, and the core spending and earning rules are now active.
Points are represented as ♦ for brevity.

### Implemented Spending

| Action | Cost |
| --- | ---: |
| Reroll daily game during the same local day | 5 pts |
| Reroll weekly game during the same local week | 10 pts |
| Move a game into reserve | 25 pts |
| Change a game pool | 10 pts |
| Adjust a game weight | 15 pts |
| Add a new game to the library | 500 pts |

Implemented behavior:

- Reroll costs are evaluated before selection
- Insufficient balance blocks rerolls and reserve moves
- Point spending records a `POINTS_SPENT` event
- Ledger debits are written as negative point transactions
- Library edits that change pool or weight also spend points
- Weight values are stored as steps from a baseline of 1 so the system can represent values like 0.67, 0.44, 0.3, and so on without floating-point drift

### Implemented Earning

- +15 points: playing a daily game
- +15 points base reward for weekly play, with progression bonus by week day
- Weekly play reward scales through the current week: 15 pts on first play, 20 pts on second/third plays, 25 pts on fourth/fifth plays, and 30 pts on sixth/seventh plays
- +5 points per 15 minutes played
- Reserve sessions earn only the playtime portion of the reward
- +10 points per additional player in a multiplayer session beyond the first player

## Gameplay Intent

The experience is meant to reduce decision fatigue while rewarding actual play. The system encourages players to choose a game, commit to it for the current period, and earn momentum through consistent play.
