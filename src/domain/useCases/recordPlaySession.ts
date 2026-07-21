import { now } from "../../core/clock.ts";
import { addEvent } from "../../database/services.ts";
import type { Game } from "../../database/db.ts";
import type { UseCaseResult } from "../useCaseResult.ts";
import { getGameById, updateGameInLibrary } from "../services/GameLibraryService.ts";
import {
  getCurrentBoard,
  lockDaily,
  lockWeekly
} from "../services/BoardService.ts";
import {
  applyPlayReward,
  evaluatePlayRules,
  type PlayPool
} from "../rules/rulesEngine.ts";

export interface RecordedPlayResult extends Game {
  reward: number;
  playtimeMinutes: number;
  pool: PlayPool;
}

export async function recordPlaySession(
  pool: PlayPool,
  playtimeMinutes: number,
  markCompleted: boolean = false
): Promise<UseCaseResult<RecordedPlayResult>> {
  const timestamp = now();
  const board = await getCurrentBoard();
  const normalizedPlaytimeMinutes = Math.max(0, Math.floor(playtimeMinutes));
  const rules = await evaluatePlayRules(board, pool, timestamp, normalizedPlaytimeMinutes);

  if (!rules.allowed) {
    return {
      success: false,
      message: rules.reason ?? "Play session cannot be recorded."
    };
  }

  const gameId =
    pool === "daily"
      ? board.dailyGameId
      : pool === "weekly"
        ? board.weeklyGameId
        : board.reserveGameId;

  if (!gameId) {
    return {
      success: false,
      message: "No game is currently selected for this slot."
    };
  }

  const game = await getGameById(gameId);

  if (!game?.id) {
    throw new Error(`Invalid ${pool} game selected: missing id`);
  }

  if (pool === "daily") {
    await lockDaily();
  }

  if (pool === "weekly") {
    await lockWeekly();
  }

  await applyPlayReward(pool, game.id, rules.reward, normalizedPlaytimeMinutes);
  await addEvent("PLAY_RECORDED", {
    gameId: game.id,
    pool,
    playtimeMinutes: normalizedPlaytimeMinutes,
    timestamp
  });

  const shouldMarkCompleted = markCompleted && !game.completed;
  const finalGame = shouldMarkCompleted
    ? await updateGameInLibrary(game.id, { completed: true })
    : game;

  return {
    success: true,
    data: {
      ...finalGame,
      reward: rules.reward,
      playtimeMinutes: normalizedPlaytimeMinutes,
      pool
    }
  };
}
