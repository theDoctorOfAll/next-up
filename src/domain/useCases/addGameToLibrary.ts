import { addGameToLibrary as addGameToLibraryFromService } from "../services/GameLibraryService";
import type { GamePool } from "../../database/db";

export async function addGameToLibrary(title: string, pool: GamePool) {
  return addGameToLibraryFromService(title, pool);
}
