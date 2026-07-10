import { weightedPick } from "../../services/rng";
import { now } from "../../core/clock";
import { getEligibleGames } from "../services/GameLibraryService";
import {
  getCurrentBoard,
  updateDailyGame
} from "../services/BoardService";
import {
  applyRollCost,
  evaluateRollRules
} from "../rules/rulesEngine";
import { addEvent } from "../../database/services";
import type { Game } from "../../database/db";
import type { UseCaseResult } from "../useCaseResult";

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);

  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isSameLocalDay(left: number, right: number) {
  return startOfLocalDay(left) === startOfLocalDay(right);
}

export async function rollDailyGame(): Promise<UseCaseResult<Game>> {
  const timestamp = now();
  const board = await getCurrentBoard();
  const rules = await evaluateRollRules(board, "daily", timestamp);

  if (!rules.allowed) {
    return {
      success: false,
      message: rules.reason ?? "Daily roll is not allowed."
    };
  }

  const games = await getEligibleGames("daily");
  const isReroll = Boolean(board.dailyRolledAt && isSameLocalDay(board.dailyRolledAt, timestamp));
  const rerollCandidates = isReroll && board.dailyGameId && games.length > 1
    ? games.filter((game) => game.id !== board.dailyGameId)
    : games;

  const picked = weightedPick(rerollCandidates.length > 0 ? rerollCandidates : games);

  if (!picked) return {
    success: false,
    message: "No eligible games."
  };

  if (!picked.id) {
    throw new Error("Invalid game selected: missing id");
  }

  await applyRollCost("daily", rules.cost, picked.id);

  await updateDailyGame(picked.id);
  await addEvent("ROLL_DAILY", {
    gameId: picked.id,
    cost: rules.cost,
    timestamp
  });

  return {
    success: true,
    data: picked
  };
}
