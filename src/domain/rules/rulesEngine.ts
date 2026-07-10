import { db, type ActiveGamePool, type BoardState, type GamePool } from "../../database/db.ts";

export type PlayPool = GamePool | "reserve" | "multiplayer";

const DAILY_REROLL_COST = 5;
const WEEKLY_REROLL_COST = 10;
const PLAY_REWARD = 15;
const ADD_GAME_COST = 500;
const CHANGE_POOL_COST = 10;
const CHANGE_WEIGHT_COST = 15;
const RESERVE_MOVE_COST = 25;
const WEEKLY_PROGRESSION_REWARDS = [0, 5, 5, 10, 10, 15, 15];
const PLAYTIME_REWARD_PER_15_MINUTES = 5;
export const MULTIPLAYER_REWARD_PER_ADDITIONAL_PLAYER = 10;

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

export function getMultiplayerReward(playerCount: number) {
  const normalizedPlayerCount = Math.max(1, Math.min(10, Math.floor(playerCount)));
  return Math.max(0, normalizedPlayerCount - 1) * MULTIPLAYER_REWARD_PER_ADDITIONAL_PLAYER;
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
  pool: ActiveGamePool,
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
      reason: `Not enough balance. ♦${cost} required.`
    };
  }

  return {
    allowed: true,
    cost
  };
}

export async function evaluatePlayRules(
  board: BoardState,
  pool: PlayPool,
  timestamp: number,
  playtimeMinutes: number = 0
): Promise<PlayRuleResult> {
  if (pool === "multiplayer") {
    return {
      allowed: false,
      reward: 0,
      reason: "Use multiplayer session rules for multiplayer logging."
    };
  }

  const selectedGameId =
    pool === "daily"
      ? board.dailyGameId
      : pool === "weekly"
        ? board.weeklyGameId
        : board.reserveGameId;

  if (!selectedGameId) {
    return {
      allowed: false,
      reward: 0,
      reason: "No game is currently selected for this pool."
    };
  }

  const normalizedPlaytimeMinutes = Math.max(0, Math.floor(playtimeMinutes));

  if (normalizedPlaytimeMinutes <= 0) {
    return {
      allowed: false,
      reward: 0,
      reason: "Playtime must be greater than zero to record a session."
    };
  }

  const playtimeReward = Math.floor(normalizedPlaytimeMinutes / 15) * PLAYTIME_REWARD_PER_15_MINUTES;

  if (pool === "weekly") {
    const weekStart = startOfLocalWeek(timestamp);
    const allEvents = await db.events.toArray();
    const weeklyPlays = allEvents.filter((event) => event.type === "PLAY_RECORDED" && event.timestamp >= weekStart && event.payload?.pool === "weekly").length;
    const progressionReward = WEEKLY_PROGRESSION_REWARDS[Math.min(weeklyPlays, WEEKLY_PROGRESSION_REWARDS.length - 1)];

    return {
      allowed: true,
      reward: PLAY_REWARD + progressionReward + playtimeReward
    };
  }

  if (pool === "reserve") {
    return {
      allowed: true,
      reward: playtimeReward
    };
  }

  return {
    allowed: true,
    reward: PLAY_REWARD + playtimeReward
  };
}

export async function evaluateMultiplayerPlayRules(
  gameId: number | undefined,
  playerCount: number = 1
): Promise<PlayRuleResult> {
  if (!gameId) {
    return {
      allowed: false,
      reward: 0,
      reason: "Choose a multiplayer game to record this session."
    };
  }

  const normalizedPlayerCount = Math.max(1, Math.min(10, Math.floor(playerCount)));

  return {
    allowed: true,
    reward: getMultiplayerReward(normalizedPlayerCount)
  };
}

export async function getLibraryRuleCosts() {
  return {
    addGame: ADD_GAME_COST,
    changePool: CHANGE_POOL_COST,
    changeWeight: CHANGE_WEIGHT_COST,
    moveToReserve: RESERVE_MOVE_COST
  };
}

export async function applyRollCost(
  pool: ActiveGamePool,
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
  pool: PlayPool,
  gameId: number,
  reward: number = PLAY_REWARD,
  playtimeMinutes: number = 0,
  playerCount?: number
) {
  if (reward <= 0) {
    return;
  }

  const { addEvent, addPoints } = await import("../../database/services.ts");

  const eventId = await addEvent("POINTS_AWARDED", {
    pool,
    gameId,
    amount: reward,
    playtimeMinutes,
    playerCount,
    reason: `${pool} play`
  });

  await addPoints(reward, `${pool} play`, eventId);
}
