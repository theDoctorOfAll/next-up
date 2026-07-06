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

export interface RecordedPlayResult extends Game {
  reward: number;
  playtimeMinutes: number;
}

export async function recordDailyPlay(playtimeBlocks: number = 0): Promise<UseCaseResult<RecordedPlayResult>> {
  const timestamp = now();
  const board = await getCurrentBoard();
  const rules = await evaluatePlayRules(board, "daily", timestamp, playtimeBlocks);

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

  const playtimeMinutes = Math.max(0, Math.floor(playtimeBlocks)) * 30;

  await lockDaily();
  await applyPlayReward("daily", game.id, rules.reward, playtimeMinutes);
  await addEvent("PLAY_RECORDED", {
    gameId: game.id,
    pool: "daily",
    playtimeMinutes,
    timestamp
  });

  return {
    success: true,
    data: {
      ...game,
      reward: rules.reward,
      playtimeMinutes
    }
  };
}
