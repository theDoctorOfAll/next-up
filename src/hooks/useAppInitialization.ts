import { useEffect, useState } from "react";
import { isDeveloperModeEnabled } from "../core/runtimePreferences";
import { ensureGameIntegrity } from "../domain/services/GameLibraryService";

let initializationPromise: Promise<void> | undefined;
let initStarted = false;

async function initializeAppData() {
  if (import.meta.env.DEV && isDeveloperModeEnabled()) {
    const { seedGamesOnce } = await import("../dev/seedGames");

    await seedGamesOnce();
  }

  await ensureGameIntegrity();
}

export function useAppInitialization() {
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    // Guard against React.StrictMode's double-execution
    if (initStarted) {
      return;
    }
    
    initStarted = true;
    initializationPromise ??= initializeAppData();

    initializationPromise
      .then(() => {
        console.log("App initialization successful");
        setInitialized(true);
      })
      .catch((cause) => {
        console.error("App initialization failed:", cause);
        console.error("Error details:", cause instanceof Error ? cause.message : String(cause));
        setError(cause);
      });
  }, []);

  return {
    initialized,
    error
  };
}
