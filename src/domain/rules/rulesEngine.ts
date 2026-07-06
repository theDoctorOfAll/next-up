import type { BoardState, GamePool } from "../../database/db.ts";

const DAILY_REROLL_COST = 5;
const WEEKLY_REROLL_COST = 10;
const PLAY_REWARD = 15;

export interface RollRuleResult {
  allowed: boolean;
  cost: number;
  reason?: string;
}

export interface PlayRuleResult {
  allowed: boolean;
  reward: number;
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

  const alreadyPlayed = pool === "daily"
    ? board.dailyPlayed && board.dailyRolledAt !== undefined && isSameLocalDay(board.dailyRolledAt, timestamp)
    : board.weeklyPlayed && board.weeklyRolledAt !== undefined && isSameLocalWeek(board.weeklyRolledAt, timestamp);

  if (alreadyPlayed) {
    return {
      allowed: false,
      cost: 0,
      reason: `Cannot reroll an already-played ${pool} game until the next ${pool === "daily" ? "day" : "week"}.`
    };
  }

  if (!isReroll) {
    return {
      allowed: true,
      cost: 0
    };
  }

  const cost = pool === "daily" ? DAILY_REROLL_COST : WEEKLY_REROLL_COST;
  const { getPointTotal } = await import("../../database/services.ts");
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

export async function evaluatePlayRules(
  board: BoardState,
  pool: GamePool,
  _timestamp: number
): Promise<PlayRuleResult> {
  const isPlayed = pool === "daily" ? board.dailyPlayed : board.weeklyPlayed;
  const selectedGameId = pool === "daily" ? board.dailyGameId : board.weeklyGameId;

  if (isPlayed) {
    return {
      allowed: false,
      reward: 0,
      reason: "This game has already been marked as played for the current period."
    };
  }

  if (!selectedGameId) {
    return {
      allowed: false,
      reward: 0,
      reason: "No game is currently selected for this pool."
    };
  }

  return {
    allowed: true,
    reward: PLAY_REWARD
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

  const { addEvent, addPoints } = await import("../../database/services.ts");

  const eventId = await addEvent("POINTS_SPENT", {
    pool,
    gameId,
    amount: cost,
    reason: `${pool} reroll`
  });

  await addPoints(-cost, `${pool} reroll`, eventId);
}

export async function applyPlayReward(
  pool: GamePool,
  gameId: number,
  reward: number = PLAY_REWARD
) {
  if (reward <= 0) {
    return;
  }

  const { addEvent, addPoints } = await import("../../database/services.ts");

  const eventId = await addEvent("POINTS_AWARDED", {
    pool,
    gameId,
    amount: reward,
    reason: `${pool} play`
  });

  await addPoints(reward, `${pool} play`, eventId);
}
