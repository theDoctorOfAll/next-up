import { db } from "../../database/db";
import { weightedPick } from "../../services/rng";
import { addEvent, addPoints } from "../../database/services";
import { getBoard, saveBoard } from "../../database/repositories/boardRepository";
import { now } from "../../core/clock";

export async function rollWeeklyGame() {
  const games = await db.games
    .filter(g => g.pool === "weekly" && !g.reserved)
    .toArray();

  const picked = weightedPick(games);
  if (!picked) return {
    success: false,
    message: "No eligible games."
  };

  await addEvent("ROLL_WEEKLY", { gameId: picked.id });

  await addPoints(20, "Weekly roll reward");

  const board = await getBoard();

  board.weeklyGameId = picked.id;
  board.weeklyRolledAt = now();
  board.weeklyPlayed = false;

  await saveBoard(board);

  return {
    success: true,
    data: picked
  };
}