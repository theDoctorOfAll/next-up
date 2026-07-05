import {
  addGameToLibrary,
  markInitialLibrarySeeded
} from "../domain/services/GameLibraryService";

let seeded = false;

export async function seedGamesOnce() {
  if (seeded) {
    return;
  }

  seeded = true;

  await addGameToLibrary("Hades", "daily");
  await addGameToLibrary("Slay the Spire", "daily");
  await addGameToLibrary("Forza Horizon 5", "daily");

  await addGameToLibrary("Stardew Valley", "weekly");
  await addGameToLibrary("Final Fantasy VII Remake", "weekly");
  await addGameToLibrary("Star Wars Outlaws", "weekly");

  await markInitialLibrarySeeded();
}
