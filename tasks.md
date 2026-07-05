Milestone 2.2.1 — Game Library Stabilization
🎯 GOAL

Stabilize the game library so that:

Games have unique identity guarantees
No duplicate titles exist
Pool assignment is consistent and validated
All game creation flows through a single service layer
Seed logic is safe, idempotent, and non-destructive
⚠️ CURRENT PROBLEMS THIS FIXES
Duplicate games in IndexedDB
Inconsistent pool assignment ("daily"/"weekly")
No centralized game creation logic
Risk of broken roll selection due to bad dataset
Seeding logic is uncontrolled and repeats
🧱 TASK 1 — CREATE GAME LIBRARY SERVICE LAYER
📁 Create file:
src/domain/services/GameLibraryService.ts
✍️ Implement:
import { addGame, getGameById, getGamesByPool } from "../../database/repositories/gameRepository";
import type { Game, GamePool } from "../../database/db";

/**
 * CENTRALIZED GAME ENTRY POINT
 */
export async function addGameToLibrary(
  title: string,
  pool: GamePool
): Promise<number> {
  const existing = await getGamesByPool(pool);

  const duplicate = existing.find(g => g.title === title);
  if (duplicate?.id) return duplicate.id;

  return addGame({
    title,
    pool,
    weight: 1,
    reserved: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
}
✅ Acceptance criteria:
No direct db.games.add() used outside repository
Duplicate titles are prevented per pool
Always returns valid game ID
🧱 TASK 2 — CREATE GAME VALIDATION HELPER
📁 Create file:
src/domain/services/validateGame.ts
✍️ Implement:
import type { GamePool } from "../../database/db";

export function assertValidPool(pool: string): asserts pool is GamePool {
  if (pool !== "daily" && pool !== "weekly") {
    throw new Error(`Invalid game pool: ${pool}`);
  }
}
✅ Acceptance criteria:
Prevents invalid pool assignments
Used before any game creation in service layer
🧱 TASK 3 — REPLACE SEEDING LOGIC WITH SAFE SEED
📁 Create file:
src/dev/seedGames.ts
✍️ Replace existing seed logic:
import { addGameToLibrary } from "../domain/services/GameLibraryService";

let seeded = false;

export async function seedGamesOnce() {
  if (seeded) return;
  seeded = true;

  // DAILY POOL
  await addGameToLibrary("Hades", "daily");
  await addGameToLibrary("Slay the Spire", "daily");
  await addGameToLibrary("Forza Horizon 5", "daily");

  // WEEKLY POOL
  await addGameToLibrary("Stardew Valley", "weekly");
  await addGameToLibrary("Final Fantasy VII Remake", "weekly");
  await addGameToLibrary("Star Wars Outlaws", "weekly");
}
⚠️ IMPORTANT:
MUST NOT run automatically in production
ONLY called manually or in dev entry point
✅ Acceptance criteria:
No duplicate seeding
Pools correctly populated
No direct repository access
🧱 TASK 4 — REMOVE DIRECT DB GAME CREATION USAGE
🔍 Search project for:
db.games.add
❌ Replace ALL occurrences with:
addGameToLibrary(...)
Files likely affected:
any seed scripts
any test/dev utilities
any future UI admin components
✅ Acceptance criteria:
ZERO direct game creation outside service layer
🧱 TASK 5 — HARDEN GAME REPOSITORY (OPTIONAL BUT RECOMMENDED)
📁 Modify:
src/database/repositories/gameRepository.ts
🔧 Ensure consistency:
export async function addGame(game: Game): Promise<number> {
  return db.games.add(game);
}
REMOVE:
any hidden transformation logic
any implicit defaults

Repository must remain “dumb”

✅ Acceptance criteria:
Repository only performs CRUD
No business logic inside repository layer
🧪 TASK 6 — VERIFY DATA INTEGRITY (DEBUG CHECK)
Add temporary dev function:
src/dev/debugGameIntegrity.ts
import { db } from "../database/db";

export async function debugGameIntegrity() {
  const games = await db.games.toArray();

  const duplicates = games.filter((g, i) =>
    games.findIndex(x => x.title === g.title && x.pool === g.pool) !== i
  );

  console.log("TOTAL GAMES:", games.length);
  console.log("DUPLICATES:", duplicates);
}
✅ Acceptance criteria:
Can detect duplicate title+pool entries
Used only in dev
🧱 TASK 7 — UPDATE ROLL SYSTEM (NO CHANGE LOGIC, ONLY SAFETY)
Files:
rollDailyGame.ts
rollWeeklyGame.ts
Add safety guard:
if (!picked?.id) {
  throw new Error("Invalid game selected: missing id");
}
Optional improvement (future-proofing):

Replace:

db.games.filter(...)

with:

getGamesByPool(pool)

(but NOT required in this milestone)

✅ Acceptance criteria:
No silent undefined IDs allowed
Roll cannot succeed with invalid game objects
🧱 TASK 8 — CLEAN DATABASE (ONE TIME MANUAL STEP)
Run in browser console:
indexedDB.deleteDatabase("nextup");
Then:
restart app
re-run seed manually if needed
🎯 FINAL MILESTONE ACCEPTANCE CHECKLIST

System is stable when:

 No duplicate games exist
 Each game belongs to exactly one pool
 Rolls always return valid game IDs
 BoardView never receives undefined lookup
 Game creation only happens through service layer
 Seed is idempotent and safe
🚀 NEXT MILESTONE PREVIEW
Milestone 3 — Rules Engine Activation

Once this is complete, we will implement:

point spending enforcement
reroll cost validation
daily/weekly lock logic
reserve slot mechanics
event-driven economy system