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

  const picked = weightedPick(games);

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
