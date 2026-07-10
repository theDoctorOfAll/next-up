import { now } from "../../core/clock.ts";
import { addEvent } from "../../database/services.ts";
import type { Game } from "../../database/db.ts";
import type { UseCaseResult } from "../useCaseResult.ts";
import { getGameById } from "../services/GameLibraryService.ts";
import {
  applyPlayReward,
  evaluateMultiplayerPlayRules,
  type PlayPool
} from "../rules/rulesEngine.ts";

export interface RecordedMultiplayerResult extends Omit<Game, "pool"> {
  reward: number;
  playerCount: number;
  pool: PlayPool;
}

export async function recordMultiplayerSession(
  gameId: number,
  playerCount: number
): Promise<UseCaseResult<RecordedMultiplayerResult>> {
  const timestamp = now();
  const normalizedPlayerCount = Math.max(1, Math.min(10, Math.floor(playerCount)));
  const rules = await evaluateMultiplayerPlayRules(gameId, normalizedPlayerCount);

  if (!rules.allowed) {
    return {
      success: false,
      message: rules.reason ?? "Multiplayer session cannot be recorded."
    };
  }

  const game = await getGameById(gameId);

  if (!game?.id) {
    throw new Error("Invalid multiplayer game selected: missing id");
  }

  if (!game.multiplayer) {
    return {
      success: false,
      message: "Selected game is not tagged for multiplayer support."
    };
  }

  await applyPlayReward("multiplayer", game.id, rules.reward, 0, normalizedPlayerCount);
  await addEvent("PLAY_RECORDED", {
    gameId: game.id,
    pool: "multiplayer",
    playerCount: normalizedPlayerCount,
    timestamp,
    multiplayer: true
  });

  return {
    success: true,
    data: {
      ...game,
      reward: rules.reward,
      playerCount: normalizedPlayerCount,
      pool: "multiplayer"
    }
  };
}
