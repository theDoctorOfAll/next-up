import type { Game } from "../../database/db.ts";
import type { UseCaseResult } from "../useCaseResult.ts";
import { recordPlaySession } from "./recordPlaySession.ts";

export interface RecordedPlayResult extends Game {
  reward: number;
  playtimeMinutes: number;
}

export async function recordWeeklyPlay(playtimeBlocks: number = 0): Promise<UseCaseResult<RecordedPlayResult>> {
  const playtimeMinutes = Math.max(0, Math.floor(playtimeBlocks)) * 30;
  return recordPlaySession("weekly", playtimeMinutes);
}
