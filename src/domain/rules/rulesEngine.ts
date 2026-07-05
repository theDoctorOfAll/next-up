import type { BoardState, GamePool } from "../../database/db";
import { addEvent, addPoints, getPointTotal } from "../../database/services";

const DAILY_REROLL_COST = 5;
const WEEKLY_REROLL_COST = 10;

export interface RollRuleResult {
  allowed: boolean;
  cost: number;
  reason?: string;
}

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
}

function startOfLocalWeek(timestamp: number) {
  const date = new Date(timestamp);
  const day = date.getDay();

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - day
  ).getTime();
}

function isSameLocalDay(left: number, right: number) {
  return startOfLocalDay(left) === startOfLocalDay(right);
}

function isSameLocalWeek(left: number, right: number) {
  return startOfLocalWeek(left) === startOfLocalWeek(right);
}

export async function evaluateRollRules(
  board: BoardState,
  pool: GamePool,
  timestamp: number
): Promise<RollRuleResult> {
  const previousRollAt =
    pool === "daily" ? board.dailyRolledAt : board.weeklyRolledAt;

  const isReroll = previousRollAt
    ? pool === "daily"
      ? isSameLocalDay(previousRollAt, timestamp)
      : isSameLocalWeek(previousRollAt, timestamp)
    : false;

  if (!isReroll) {
    return {
      allowed: true,
      cost: 0
    };
  }

  const cost = pool === "daily" ? DAILY_REROLL_COST : WEEKLY_REROLL_COST;
  const balance = await getPointTotal();

  if (balance < cost) {
    return {
      allowed: false,
      cost,
      reason: `Not enough points. ${cost} points required.`
    };
  }

  return {
    allowed: true,
    cost
  };
}

export async function applyRollCost(
  pool: GamePool,
  cost: number,
  gameId: number
) {
  if (cost <= 0) {
    return;
  }

  const eventId = await addEvent("POINTS_SPENT", {
    pool,
    gameId,
    amount: cost,
    reason: `${pool} reroll`
  });

  await addPoints(-cost, `${pool} reroll`, eventId);
}
