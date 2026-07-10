import { db, type Game, type Event, type PointTransaction, type EventType } from "./db.ts";
import { now } from "../core/clock.ts";
import { resetClockOffset } from "../core/clock.ts";
import { addGameToLibrary } from "../domain/services/GameLibraryService.ts";
import { getBoard, saveBoard } from "./repositories/boardRepository";

/**
 * EVENT WRITER
 */
export async function addEvent(
  type: EventType,
  payload: any = {}
) {
  return db.events.add({
    type,
    payload,
    timestamp: now()
  });
}

/**
 * POINT SYSTEM (ledger-based)
 */
export async function addPoints(
  amount: number,
  reason: string,
  eventId?: number
) {
  return db.points.add({
    amount,
    reason,
    timestamp: now(),
    eventId
  });
}

export async function getPointTotal(): Promise<number> {
  const all = await db.points.toArray();
  return all.reduce((sum, p) => sum + p.amount, 0);
}

/**
 * GAME CRUD
 */
export async function createGame(title: string, pool: "daily" | "weekly") {
  return addGameToLibrary(title, pool);
}

export async function updateGame(game: Game) {
  if (!game.id) throw new Error("Game must have id");

  await db.games.update(game.id, {
    ...game,
    updatedAt: now()
  });

  await addEvent("GAME_UPDATED", { game });
}

export async function clearEventHistory() {
  resetClockOffset();

  const board = await getBoard();
  const allGames = await db.games.toArray();
  const resetTimestamp = now();

  if (allGames.length > 0) {
    await db.games.bulkPut(
      allGames.map((game) => ({
        ...game,
        reserved: false,
        weight: 0,
        updatedAt: resetTimestamp
      }))
    );
  }

  board.dailyGameId = undefined;
  board.weeklyGameId = undefined;
  board.reserveGameId = undefined;
  board.dailyRolledAt = undefined;
  board.weeklyRolledAt = undefined;
  board.dailyPlayed = false;
  board.weeklyPlayed = false;

  await Promise.all([
    db.events.clear(),
    db.points.clear(),
    saveBoard(board)
  ]);
}
