import { now } from "../../core/clock";
import { db, type Game, type GamePool } from "../../database/db";
import {
  addGame,
  deleteGame,
  getAllGames,
  getGameById as getGameByIdFromRepository,
  getGamesByPool as getGamesByPoolFromRepository,
  updateGame
} from "../../database/repositories/gameRepository";
import { recordEvent } from "../../database/repositories/eventRepository";
import { getBoard, saveBoard } from "../../database/repositories/boardRepository";
import { getPointBalance, spendPoints } from "../../database/repositories/pointRepository";
import { assertValidPool } from "./validateGame";

const ADD_GAME_COST = 500;
const CHANGE_POOL_COST = 10;
const CHANGE_WEIGHT_COST = 15;
const WEIGHT_ADJUSTMENT_COST = 15;

export interface NewGameInput {
  title: string;
  pool: GamePool;
  weight?: number;
  reserved?: boolean;
}

function normalizeTitle(title: string) {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function cleanTitle(title: string) {
  return title.trim().replace(/\s+/g, " ");
}

function sameTitle(left: string, right: string) {
  return normalizeTitle(left) === normalizeTitle(right);
}

export function parsePlatformsInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

export function getWeightValueFromSteps(steps: number): number {
  if (steps === 0) {
    return 1;
  }

  let value = 1;

  for (let index = 0; index < Math.abs(steps); index += 1) {
    value = steps > 0 ? value * 1.5 : value * (2 / 3);
  }

  return Number(value.toFixed(2));
}

function normalizeWeight(value: number) {
  return Math.round(value);
}

async function chargeLibraryCost(amount: number, reason: string, payload: Record<string, unknown>) {
  const balance = await getPointBalance();

  if (balance < amount) {
    throw new Error(`Not enough points. ${amount} points required.`);
  }

  await spendPoints(amount, reason);
  await recordEvent("POINTS_SPENT", {
    amount,
    reason,
    ...payload
  });
}

export async function addGameToLibrary(
  titleInput: string,
  poolInput: GamePool,
  platformsInput: string[] = []
): Promise<number> {
  assertValidPool(poolInput);

  const title = cleanTitle(titleInput);

  if (!title) {
    throw new Error("Game title is required.");
  }

  const games = await getAllGames();
  const duplicate = games.find((game) => sameTitle(game.title, title));

  if (duplicate?.id) {
    if (duplicate.pool !== poolInput || duplicate.title !== title) {
      await updateGame({
        ...duplicate,
        title,
        pool: poolInput,
        reserved: duplicate.pool !== poolInput ? false : duplicate.reserved
      });

      await recordEvent("GAME_UPDATED", {
        id: duplicate.id,
        title,
        pool: poolInput,
        reason: "Library add repaired existing game"
      });
    }

    return duplicate.id;
  }

  await chargeLibraryCost(ADD_GAME_COST, "add game", {
    title,
    pool: poolInput,
    reason: "add game"
  });

  const id = await addGame({
    title,
    pool: poolInput,
    weight: 0,
    platforms: parsePlatformsInput(platformsInput.join(",")),
    reserved: false,
    createdAt: now(),
    updatedAt: now()
  });

  await recordEvent("GAME_CREATED", { id, title, pool: poolInput });

  return id;
}

export async function updateGameInLibrary(
  id: number,
  updates: { title?: string; pool?: GamePool; weight?: number; platforms?: string[] }
): Promise<Game> {
  const existing = await getGameByIdFromRepository(id);

  if (!existing?.id) {
    throw new Error("Game not found.");
  }

  const nextTitle = cleanTitle(updates.title ?? existing.title);

  if (!nextTitle) {
    throw new Error("Game title is required.");
  }

  const nextPool = updates.pool ?? existing.pool;
  const nextWeight = normalizeWeight(updates.weight ?? existing.weight);
  const nextPlatforms = parsePlatformsInput((updates.platforms ?? existing.platforms ?? []).join(","));
  const changedPool = nextPool !== existing.pool;
  const changedWeight = nextWeight !== existing.weight;
  const changedTitle = nextTitle !== existing.title;
  const changedPlatforms = JSON.stringify(nextPlatforms) !== JSON.stringify(existing.platforms ?? []);

  if (changedPool || changedWeight || changedTitle) {
    const totalCost = (changedPool ? CHANGE_POOL_COST : 0) + (changedWeight ? CHANGE_WEIGHT_COST : 0);

    if (totalCost > 0) {
      await chargeLibraryCost(totalCost, "library update", {
        gameId: existing.id,
        pool: nextPool,
        weight: nextWeight,
        changedPool,
        changedWeight
      });
    }
  }

  const updatedGame: Game = {
    ...existing,
    title: nextTitle,
    pool: nextPool,
    weight: nextWeight,
    platforms: nextPlatforms,
    updatedAt: now()
  };

  await updateGame(updatedGame);
  await recordEvent("GAME_UPDATED", {
    id: updatedGame.id,
    title: updatedGame.title,
    pool: updatedGame.pool,
    weight: updatedGame.weight,
    platforms: updatedGame.platforms,
    reason: "Library update"
  });

  return updatedGame;
}

export async function adjustGameWeightInLibrary(
  id: number,
  direction: "increase" | "decrease"
): Promise<Game> {
  const existing = await getGameByIdFromRepository(id);

  if (!existing?.id) {
    throw new Error("Game not found.");
  }

  const nextWeight = direction === "increase" ? existing.weight + 1 : existing.weight - 1;

  await chargeLibraryCost(WEIGHT_ADJUSTMENT_COST, "adjust weight", {
    gameId: existing.id,
    direction,
    fromWeight: getWeightValueFromSteps(existing.weight),
    toWeight: getWeightValueFromSteps(nextWeight)
  });

  const updatedGame: Game = {
    ...existing,
    weight: nextWeight,
    updatedAt: now()
  };

  await updateGame(updatedGame);
  await recordEvent("GAME_UPDATED", {
    id: updatedGame.id,
    title: updatedGame.title,
    pool: updatedGame.pool,
    weight: updatedGame.weight,
    platforms: updatedGame.platforms,
    reason: `Weight ${direction}`
  });

  return updatedGame;
}

export async function deleteGameFromLibrary(id: number): Promise<void> {
  const existing = await getGameByIdFromRepository(id);

  if (!existing?.id) {
    throw new Error("Game not found.");
  }

  const board = await getBoard();

  if (board.dailyGameId === id) {
    board.dailyGameId = undefined;
    board.dailyRolledAt = undefined;
    board.dailyPlayed = false;
  }

  if (board.weeklyGameId === id) {
    board.weeklyGameId = undefined;
    board.weeklyRolledAt = undefined;
    board.weeklyPlayed = false;
  }

  if (board.reserveGameId === id) {
    board.reserveGameId = undefined;
  }

  await saveBoard(board);
  await deleteGame(id);
  await recordEvent("GAME_DELETED", {
    id,
    title: existing.title,
    reason: "Library delete"
  });
}

export async function getGameById(id: number): Promise<Game | undefined> {
  return getGameByIdFromRepository(id);
}

export async function getGamesByPool(poolInput: GamePool): Promise<Game[]> {
  assertValidPool(poolInput);

  return getGamesByPoolFromRepository(poolInput);
}

export async function getEligibleGames(poolInput: GamePool): Promise<Game[]> {
  const games = await getGamesByPool(poolInput);

  return games.filter((game) => !game.reserved);
}

export async function ensureGameIntegrity() {
  const games = await getAllGames();
  const seenTitles = new Map<string, Game>();

  for (const game of games) {
    if (!game.id) {
      continue;
    }

    assertValidPool(game.pool);

    const normalizedTitle = normalizeTitle(game.title);

    if (!normalizedTitle) {
      continue;
    }

    const existing = seenTitles.get(normalizedTitle);

    if (!existing) {
      seenTitles.set(normalizedTitle, game);
      continue;
    }

    await deleteGame(game.id);
    await recordEvent("GAME_DELETED", {
      id: game.id,
      title: game.title,
      reason: "Duplicate title removed during integrity check",
      keptId: existing.id
    });
  }
}

export async function markInitialLibrarySeeded() {
  await db.metadata.put({
    key: "initialGameLibrarySeeded",
    value: true,
    updatedAt: now()
  });
}

export async function isInitialLibrarySeeded() {
  const seedState = await db.metadata.get("initialGameLibrarySeeded");

  return seedState?.value === true;
}
