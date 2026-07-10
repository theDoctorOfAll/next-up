import { weightedPick } from "../../services/rng";
import { now } from "../../core/clock";
import { getEligibleGames } from "../services/GameLibraryService";
import {
  getCurrentBoard,
  updateWeeklyGame
} from "../services/BoardService";
import {
  applyRollCost,
  evaluateRollRules
} from "../rules/rulesEngine";
import { addEvent } from "../../database/services";
import type { Game } from "../../database/db";
import type { UseCaseResult } from "../useCaseResult";

function startOfLocalWeek(timestamp: number) {
  const date = new Date(timestamp);
  const day = date.getDay();

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - day
  ).getTime();
}

function isSameLocalWeek(left: number, right: number) {
  return startOfLocalWeek(left) === startOfLocalWeek(right);
}

export async function rollWeeklyGame(): Promise<UseCaseResult<Game>> {
  const timestamp = now();
  const board = await getCurrentBoard();
  const rules = await evaluateRollRules(board, "weekly", timestamp);

  if (!rules.allowed) {
    return {
      success: false,
      message: rules.reason ?? "Weekly roll is not allowed."
    };
  }

  const games = await getEligibleGames("weekly");
  const isReroll = Boolean(board.weeklyRolledAt && isSameLocalWeek(board.weeklyRolledAt, timestamp));
  const rerollCandidates = isReroll && board.weeklyGameId && games.length > 1
    ? games.filter((game) => game.id !== board.weeklyGameId)
    : games;

  const picked = weightedPick(rerollCandidates.length > 0 ? rerollCandidates : games);

  if (!picked) return {
    success: false,
    message: "No eligible games."
  };

  if (!picked.id) {
    throw new Error("Invalid game selected: missing id");
  }

  await applyRollCost("weekly", rules.cost, picked.id);

  await updateWeeklyGame(picked.id);
  await addEvent("ROLL_WEEKLY", {
    gameId: picked.id,
    cost: rules.cost,
    timestamp
  });

  return {
    success: true,
    data: picked
  };
}
