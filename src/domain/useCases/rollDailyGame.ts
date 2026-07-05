import { db } from "../../database/db";
import { weightedPick } from "../../services/rng";
import { addEvent, addPoints } from "../../database/services";
import { getBoard, saveBoard } from "../../database/repositories/boardRepository";
import { now } from "../../core/clock";

export async function rollDailyGame() {
  const games = await db.games
    .filter(g => g.pool === "daily" && !g.reserved)
    .toArray();

  const picked = weightedPick(games);
  if (!picked) return {
    success: false,
    message: "No eligible games."
  };

  await addEvent("ROLL_DAILY", { gameId: picked.id });

  await addPoints(15, "Daily roll reward");

  const board = await getBoard();

  board.dailyGameId = picked.id;
  board.dailyRolledAt = now();
  board.dailyPlayed = false;

  await saveBoard(board);

  return {
    success: true,
    data: picked
  };
}