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
import { assertValidPool } from "./validateGame";

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

export async function addGameToLibrary(
  titleInput: string,
  poolInput: GamePool
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

  const id = await addGame({
    title,
    pool: poolInput,
    weight: 1,
    reserved: false,
    createdAt: now(),
    updatedAt: now()
  });

  await recordEvent("GAME_CREATED", { id, title, pool: poolInput });

  return id;
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
