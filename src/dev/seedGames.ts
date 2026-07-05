import { addGameToLibrary } from "../domain/useCases/addGameToLibrary";

export async function seedGames() {
  const existing = [
    "Hades",
    "Stardew Valley",
    "Slay the Spire",
    "Forza Horizon 5",
    "Final Fantasy VII Remake",
    "Star Wars Outlaws"
  ];

  for (const title of existing) {
    await addGameToLibrary(title, "daily");
  }

  const weekly = [
    "Stardew Valley",
    "Final Fantasy VII Remake",
    "Star Wars Outlaws"
  ];

  for (const title of weekly) {
    await addGameToLibrary(title, "weekly");
  }
}