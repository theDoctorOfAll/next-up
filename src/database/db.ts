import Dexie, { type Table } from "dexie";

/**
 * GAME MODEL
 */
export type GamePool = "daily" | "weekly" | "none";
export type ActiveGamePool = Exclude<GamePool, "none">;

export interface Game {
  id?: number;
  title: string;
  pool: GamePool;
  weight: number; // stored as step count from baseline weight 1 (0 = 1, -1 = 0.67, +1 = 1.5)
  platforms?: string[];
  multiplayer: boolean;
  reserved: boolean;
  completed: boolean;
  igdbId?: number;
  coverCacheKey?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * EVENT SYSTEM (core of the app)
 */
export type EventType =
  | "GAME_CREATED"
  | "GAME_UPDATED"
  | "GAME_DELETED"
  | "GAME_COMPLETED"
  | "ROLL_DAILY"
  | "ROLL_WEEKLY"
  | "PLAY_RECORDED"
  | "POINTS_AWARDED"
  | "POINTS_SPENT"
  | "RESERVE_SET"
  | "WEIGHT_CHANGED";

export interface Event {
  id?: number;
  type: EventType;
  timestamp: number;
  payload: any;
}

/**
 * POINT LEDGER (NO BALANCE STORAGE)
 */
export interface PointTransaction {
  id?: number;
  amount: number;
  reason: string;
  timestamp: number;
  eventId?: number;
}

/**
 * DATABASE
 */
class NextUpDB extends Dexie {
  games!: Table<Game, number>;
  events!: Table<Event, number>;
  points!: Table<PointTransaction, number>;
  board!: Table<BoardState, number>;
  metadata!: Table<MetadataEntry, string>;

  constructor() {
    super("nextup");

    this.version(2).stores({
      games: "++id, title, pool, reserved",
      events: "++id, type, timestamp",
      points: "++id, timestamp",
      board: "id"
    });

    this.version(3).stores({
      games: "++id, title, pool, reserved",
      events: "++id, type, timestamp",
      points: "++id, timestamp",
      board: "id",
      metadata: "key"
    });

    this.version(4).stores({
      games: "++id, title, pool, reserved, *platforms",
      events: "++id, type, timestamp",
      points: "++id, timestamp",
      board: "id",
      metadata: "key"
    });

    this.version(5)
      .stores({
        games: "++id, title, pool, reserved, *platforms",
        events: "++id, type, timestamp",
        points: "++id, timestamp",
        board: "id",
        metadata: "key"
      })
      .upgrade(async (tx) => {
        await tx.table("games").toCollection().modify((game: Partial<Game>) => {
          game.multiplayer = Boolean(game.multiplayer);
        });
      });

    this.version(6)
      .stores({
        games: "++id, title, pool, reserved, *platforms",
        events: "++id, type, timestamp",
        points: "++id, timestamp",
        board: "id",
        metadata: "key"
      })
      .upgrade(async (tx) => {
        await tx.table("games").toCollection().modify((game: Partial<Game> & { pool?: string }) => {
          game.multiplayer = Boolean(game.multiplayer);

          if (game.pool !== "daily" && game.pool !== "weekly" && game.pool !== "none") {
            game.reserved = game.pool === "reserve" ? true : Boolean(game.reserved);
            game.pool = game.pool === "reserve" ? "none" : "daily";
          }
        });
      });

    this.version(7)
      .stores({
        games: "++id, title, pool, reserved, *platforms, igdbId, coverCacheKey",
        events: "++id, type, timestamp",
        points: "++id, timestamp",
        board: "id",
        metadata: "key"
      })
      .upgrade(async (tx) => {
        await tx.table("games").toCollection().modify((game: Partial<Game> & { id?: number; igdbId?: unknown; coverCacheKey?: unknown }) => {
          const parsedIgdbId = Number(game.igdbId);

          if (!Number.isFinite(parsedIgdbId) || parsedIgdbId <= 0) {
            game.igdbId = undefined;
          } else {
            game.igdbId = Math.trunc(parsedIgdbId);
          }

          if (typeof game.coverCacheKey !== "string" || game.coverCacheKey.trim().length === 0) {
            game.coverCacheKey = game.id ? `game_cover_${game.id}` : undefined;
          }
        });
      });

    this.version(8)
      .stores({
        games: "++id, title, pool, reserved, completed, *platforms, igdbId, coverCacheKey",
        events: "++id, type, timestamp",
        points: "++id, timestamp",
        board: "id",
        metadata: "key"
      })
      .upgrade(async (tx) => {
        await tx.table("games").toCollection().modify((game: Partial<Game>) => {
          game.multiplayer = Boolean(game.multiplayer);
          game.completed = Boolean(game.completed);
        });
      });
  }
}


export interface BoardState {
  id: number;

  dailyGameId?: number;
  weeklyGameId?: number;
  reserveGameId?: number;

  dailyRolledAt?: number;
  weeklyRolledAt?: number;

  dailyPlayed: boolean;
  weeklyPlayed: boolean;
}

export interface MetadataEntry {
  key: string;
  value: unknown;
  updatedAt: number;
}

export const db = new NextUpDB();
