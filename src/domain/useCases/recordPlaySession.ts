import { now } from "../../core/clock.ts";
import { addEvent } from "../../database/services.ts";
import { getEvents } from "../../database/repositories/eventRepository.ts";
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
  getCompletionModeRules,
  evaluatePlayRules,
  type PlayPool
} from "../rules/rulesEngine.ts";

export interface RecordedPlayResult extends Game {
  reward: number;
  playtimeMinutes: number;
  pool: PlayPool;
}

const MAX_DAILY_PLAYTIME_MINUTES_PER_TITLE = 12 * 60;

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);

  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
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

  const completionRules = await getCompletionModeRules();

  const dayStart = startOfLocalDay(timestamp);
  const dayEnd = dayStart + (24 * 60 * 60 * 1000);
  const allEvents = await getEvents();
  const alreadyRecordedToday = allEvents
    .filter((event) =>
      event.type === "PLAY_RECORDED"
      && event.payload?.gameId === game.id
      && event.timestamp >= dayStart
      && event.timestamp < dayEnd
    )
    .reduce((total, event) => {
      const value = Number(event.payload?.playtimeMinutes);
      return total + (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
    }, 0);

  if (alreadyRecordedToday + normalizedPlaytimeMinutes > MAX_DAILY_PLAYTIME_MINUTES_PER_TITLE) {
    return {
      success: false,
      message: "Cannot record more than 12 hours of playtime for one title in a single day."
    };
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

  const shouldMarkCompleted = markCompleted && !game.completed && completionRules.gameMode === "completion";
  const finalGame = shouldMarkCompleted
    ? await updateGameInLibrary(game.id, { completed: true })
    : game;
  const completionReward = shouldMarkCompleted ? completionRules.completionReward : 0;

  return {
    success: true,
    data: {
      ...finalGame,
      reward: rules.reward + completionReward,
      playtimeMinutes: normalizedPlaytimeMinutes,
      pool
    }
  };
}
