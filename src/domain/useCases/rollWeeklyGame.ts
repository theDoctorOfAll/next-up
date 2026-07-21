import { weightedPick } from "../../services/rng";
import { now } from "../../core/clock";
import { getEligibleGames } from "../services/GameLibraryService";
import { getEvents } from "../../database/repositories/eventRepository";
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

async function getWeeklyCooldownMultipliers(games: Game[]) {
  if (games.length <= 1) {
    return new Map<number, number>();
  }

  const n = Math.max(1, games.length);
  const allEvents = await getEvents();
  const rollEvents = allEvents
    .filter((event) => event.type === "ROLL_WEEKLY" && typeof event.payload?.gameId === "number")
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
  const cooldownMultipliers = await getWeeklyCooldownMultipliers(rerollCandidates.length > 0 ? rerollCandidates : games);

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
