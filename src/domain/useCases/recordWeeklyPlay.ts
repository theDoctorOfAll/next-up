import { now } from "../../core/clock.ts";
import { getGameById } from "../services/GameLibraryService.ts";
import {
  getCurrentBoard,
  lockWeekly
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

export async function recordWeeklyPlay(playtimeBlocks: number = 0): Promise<UseCaseResult<RecordedPlayResult>> {
  const timestamp = now();
  const board = await getCurrentBoard();
  const rules = await evaluatePlayRules(board, "weekly", timestamp, playtimeBlocks);

  if (!rules.allowed) {
    return {
      success: false,
      message: rules.reason ?? "Weekly play cannot be recorded."
    };
  }

  const gameId = board.weeklyGameId;

  if (!gameId) {
    return {
      success: false,
      message: "No weekly game is currently selected."
    };
  }

  const game = await getGameById(gameId);

  if (!game?.id) {
    throw new Error("Invalid weekly game selected: missing id");
  }

  const playtimeMinutes = Math.max(0, Math.floor(playtimeBlocks)) * 30;

  await lockWeekly();
  await applyPlayReward("weekly", game.id, rules.reward, playtimeMinutes);
  await addEvent("PLAY_RECORDED", {
    gameId: game.id,
    pool: "weekly",
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
