import { weightedPick } from "../../services/rng";
import { now } from "../../core/clock";
import { getEligibleGames } from "../services/GameLibraryService";
import { getEvents } from "../../database/repositories/eventRepository";
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

async function getDailyCooldownMultipliers(games: Game[]) {
  if (games.length <= 1) {
    return new Map<number, number>();
  }

  const n = Math.max(1, Math.floor(games.length / 2));
  const allEvents = await getEvents();
  const rollEvents = allEvents
    .filter((event) => event.type === "ROLL_DAILY" && typeof event.payload?.gameId === "number")
    .sort((left, right) => left.timestamp - right.timestamp);

  const lastSelectionIndexByGameId = new Map<number, number>();

  rollEvents.forEach((event, index) => {
    const gameId = Number(event.payload?.gameId);
    if (Number.isFinite(gameId)) {
      lastSelectionIndexByGameId.set(gameId, index);
    }
  });

  const multipliers = new Map<number, number>();
  const lastRollIndex = rollEvents.length - 1;

  for (const game of games) {
    if (!game.id) {
      continue;
    }

    const lastSelectionIndex = lastSelectionIndexByGameId.get(game.id);

    if (lastSelectionIndex === undefined) {
      multipliers.set(game.id, 1);
      continue;
    }

    const rollsSinceSelected = Math.max(0, lastRollIndex - lastSelectionIndex);
    const multiplier = Math.min(1, rollsSinceSelected / n);
    multipliers.set(game.id, multiplier);
  }

  return multipliers;
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
  const cooldownMultipliers = await getDailyCooldownMultipliers(rerollCandidates.length > 0 ? rerollCandidates : games);

  const pickPool = rerollCandidates.length > 0 ? rerollCandidates : games;
  const picked = weightedPick(pickPool, (game) => {
    if (!game.id) {
      return 1;
    }

    return cooldownMultipliers.get(game.id) ?? 1;
  });

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
