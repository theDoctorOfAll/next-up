import { useEffect } from "react";
import { createGame, getPointTotal } from "../database/services";

export function useDBTest() {
  useEffect(() => {
    async function run() {
      const total = await getPointTotal();
      console.log("POINT TOTAL:", total);

      // seed only once-ish (safe for now)
      const games = ["Hades", "Stardew Valley", "Forza Horizon"];

      for (const g of games) {
        await createGame(g, "daily");
      }
    }

    run();
  }, []);
}