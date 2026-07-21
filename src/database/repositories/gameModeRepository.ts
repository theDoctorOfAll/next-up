import { now } from "../../core/clock";
import { db } from "../db";

export type GameMode = "standard" | "completion";

const GAME_MODE_KEY = "gameMode";
const GAME_MODE_CHANGED_AT_KEY = "gameModeChangedAt";
const GAME_MODE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export interface GameModeState {
  mode: GameMode;
  changedAt: number | null;
  canChange: boolean;
  nextChangeAt: number | null;
}

function normalizeGameMode(value: unknown): GameMode {
  return value === "completion" ? "completion" : "standard";
}

export async function getGameModeState(): Promise<GameModeState> {
  const [modeEntry, changedAtEntry] = await Promise.all([
    db.metadata.get(GAME_MODE_KEY),
    db.metadata.get(GAME_MODE_CHANGED_AT_KEY)
  ]);

  const mode = normalizeGameMode(modeEntry?.value);
  const changedAt = typeof changedAtEntry?.value === "number" && Number.isFinite(changedAtEntry.value)
    ? changedAtEntry.value
    : null;

  if (changedAt === null) {
    return {
      mode,
      changedAt: null,
      canChange: true,
      nextChangeAt: null
    };
  }

  const nextChangeAt = changedAt + GAME_MODE_COOLDOWN_MS;

  return {
    mode,
    changedAt,
    canChange: now() >= nextChangeAt,
    nextChangeAt
  };
}

export async function getCurrentGameMode(): Promise<GameMode> {
  return (await getGameModeState()).mode;
}

export async function initializeGameMode(mode: GameMode): Promise<void> {
  const updatedAt = now();

  await db.metadata.put({
    key: GAME_MODE_KEY,
    value: mode,
    updatedAt
  });

  // Initial onboarding choice should not consume the mode-switch cooldown.
  await db.metadata.delete(GAME_MODE_CHANGED_AT_KEY);
}

export async function setGameMode(nextMode: GameMode): Promise<GameModeState> {
  const currentState = await getGameModeState();

  if (currentState.mode === nextMode) {
    return currentState;
  }

  if (!currentState.canChange) {
    const nextChangeLabel = currentState.nextChangeAt ? new Date(currentState.nextChangeAt).toLocaleString() : "later";
    throw new Error(`Mode cannot be changed yet. You can switch again after ${nextChangeLabel}.`);
  }

  const changedAt = now();

  await db.metadata.bulkPut([
    {
      key: GAME_MODE_KEY,
      value: nextMode,
      updatedAt: changedAt
    },
    {
      key: GAME_MODE_CHANGED_AT_KEY,
      value: changedAt,
      updatedAt: changedAt
    }
  ]);

  return {
    mode: nextMode,
    changedAt,
    canChange: false,
    nextChangeAt: changedAt + GAME_MODE_COOLDOWN_MS
  };
}