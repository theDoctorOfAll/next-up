import { useEffect, useState } from "react";
import { ensureGameIntegrity } from "../domain/services/GameLibraryService";

let initializationPromise: Promise<void> | undefined;

async function initializeAppData() {
  if (import.meta.env.DEV) {
    const { seedGamesOnce } = await import("../dev/seedGames");

    await seedGamesOnce();
  }

  await ensureGameIntegrity();
}

export function useAppInitialization() {
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    initializationPromise ??= initializeAppData();

    initializationPromise
      .then(() => setInitialized(true))
      .catch((cause) => setError(cause));
  }, []);

  return {
    initialized,
    error
  };
}
