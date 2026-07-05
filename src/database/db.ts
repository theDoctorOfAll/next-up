import Dexie, { type Table } from "dexie";

/**
 * GAME MODEL
 */
export type GamePool = "daily" | "weekly";

export interface Game {
  id?: number;
  title: string;
  pool: GamePool;
  weight: number; // used for weighted RNG later
  reserved: boolean;
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
