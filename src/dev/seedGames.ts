import {
  addGameInternal,
  markInitialLibrarySeeded
} from "../domain/services/GameLibraryService";

let seeded = false;

export async function seedGamesOnce() {
  if (seeded) {
    return;
  }

  seeded = true;

  // Add games without charging points during initial seed
  await addGameInternal("Hades II", "daily", [], false);
  await addGameInternal("Balatro", "daily", [], false);
  await addGameInternal("Forza Horizon 5", "daily", [], false);

  await addGameInternal("Stardew Valley", "weekly", [], false);
  await addGameInternal("Final Fantasy VII Remake", "weekly", [], false);
  await addGameInternal("Star Wars Outlaws", "weekly", [], false);

  await markInitialLibrarySeeded();
}
