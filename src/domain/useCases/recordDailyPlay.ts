import { now } from "../../core/clock.ts";
import { getGameById } from "../services/GameLibraryService.ts";
import {
  getCurrentBoard,
  lockDaily
} from "../services/BoardService.ts";
import {
  applyPlayReward,
  evaluatePlayRules
} from "../rules/rulesEngine.ts";
import { addEvent } from "../../database/services.ts";
import type { Game } from "../../database/db.ts";
import type { UseCaseResult } from "../useCaseResult.ts";

export async function recordDailyPlay(): Promise<UseCaseResult<Game>> {
  const timestamp = now();
  const board = await getCurrentBoard();
  const rules = await evaluatePlayRules(board, "daily", timestamp);

  if (!rules.allowed) {
    return {
      success: false,
      message: rules.reason ?? "Daily play cannot be recorded."
    };
  }

  const gameId = board.dailyGameId;

  if (!gameId) {
    return {
      success: false,
      message: "No daily game is currently selected."
    };
  }

  const game = await getGameById(gameId);

  if (!game?.id) {
    throw new Error("Invalid daily game selected: missing id");
  }

  await lockDaily();
  await applyPlayReward("daily", game.id, rules.reward);
  await addEvent("PLAY_RECORDED", {
    gameId: game.id,
    pool: "daily",
    timestamp
  });

  return {
    success: true,
    data: game
  };
}
