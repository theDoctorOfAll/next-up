import { now } from "../../core/clock";
import { db, type MetadataEntry } from "../db";

export const COVER_CACHE_KEY_PREFIX = "game_cover_";
export const DEFAULT_GAME_COVER_CACHE_TTL_DAYS = 30;

export interface GameCoverCacheValue {
  gameId: number;
  igdbId: number;
  imageUrl: string | null;
  imageId: string | null;
  confidence: number;
  fetchedAt: number;
  searchQuery: string;
  error?: string;
}

export interface CachedGameCover {
  cover: GameCoverCacheValue | null;
  stale: boolean;
}

function getCacheKeyForGameId(gameId: number) {
  return `${COVER_CACHE_KEY_PREFIX}${gameId}`;
}

function getCacheTtlMs(ttlDays: number) {
  return Math.max(1, Math.floor(ttlDays)) * 24 * 60 * 60 * 1000;
}

function isValidCoverPayload(value: unknown): value is GameCoverCacheValue {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GameCoverCacheValue>;
  return (
    Number.isFinite(candidate.gameId)
    && Number.isFinite(candidate.igdbId)
    && (candidate.imageUrl === null || typeof candidate.imageUrl === "string")
    && (candidate.imageId === null || typeof candidate.imageId === "string")
    && Number.isFinite(candidate.confidence)
    && Number.isFinite(candidate.fetchedAt)
    && typeof candidate.searchQuery === "string"
  );
}

export async function getCachedGameCover(gameId: number, ttlDays: number = DEFAULT_GAME_COVER_CACHE_TTL_DAYS): Promise<CachedGameCover> {
  const game = await db.games.get(gameId);

  if (!game) {
    return { cover: null, stale: false };
  }

  const cacheKey = game.coverCacheKey ?? getCacheKeyForGameId(gameId);
  const entry = await db.metadata.get(cacheKey);

  if (!entry || !isValidCoverPayload(entry.value)) {
    return { cover: null, stale: false };
  }

  const cover = entry.value;
  const stale = now() - cover.fetchedAt > getCacheTtlMs(ttlDays);

  return {
    cover,
    stale
  };
}

export async function storeGameCoverCache(gameId: number, cover: Omit<GameCoverCacheValue, "gameId" | "fetchedAt"> & { fetchedAt?: number }) {
  const game = await db.games.get(gameId);

  if (!game) {
    throw new Error("Game not found.");
  }

  const cacheKey = game.coverCacheKey ?? getCacheKeyForGameId(gameId);
  const fetchedAt = cover.fetchedAt ?? now();
  const payload: GameCoverCacheValue = {
    gameId,
    igdbId: cover.igdbId,
    imageUrl: cover.imageUrl,
    imageId: cover.imageId,
    confidence: cover.confidence,
    fetchedAt,
    searchQuery: cover.searchQuery,
    error: cover.error
  };

  const entry: MetadataEntry = {
    key: cacheKey,
    value: payload,
    updatedAt: now()
  };

  await db.metadata.put(entry);
  await db.games.update(gameId, {
    igdbId: payload.igdbId,
    coverCacheKey: cacheKey
  });

  return payload;
}

export async function invalidateGameCoverCache(gameId: number): Promise<void> {
  const game = await db.games.get(gameId);

  if (!game) {
    return;
  }

  const cacheKey = game.coverCacheKey ?? getCacheKeyForGameId(gameId);

  await db.metadata.delete(cacheKey);
  await db.games.update(gameId, {
    igdbId: undefined,
    coverCacheKey: cacheKey
  });
}

export async function invalidateAllGameCoverCaches() {
  const cacheEntries = await db.metadata
    .where("key")
    .startsWith(COVER_CACHE_KEY_PREFIX)
    .toArray();

  if (cacheEntries.length > 0) {
    await db.metadata.bulkDelete(cacheEntries.map((entry) => entry.key));
  }

  await db.games.toCollection().modify((game) => {
    game.igdbId = undefined;
    game.coverCacheKey = game.id ? getCacheKeyForGameId(game.id) : undefined;
  });
}
