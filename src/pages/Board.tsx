import { useEffect, useState } from "react";
import { rollDailyGame } from "../domain/useCases/rollDailyGame";
import { rollWeeklyGame } from "../domain/useCases/rollWeeklyGame";


import {
  getBoardView,
  type BoardView,
} from "../domain/queries/getBoardView";

export default function Board() {
  const [view, setView] = useState<BoardView | null>(null);

  async function refreshBoard() {
    setView(await getBoardView());
  }

  useEffect(() => {
    refreshBoard();
  }, []);

  async function handleDailyRoll() {
    const result = await rollDailyGame();

    if (!result.success) {
      alert(result.message);
      return;
    }

    await refreshBoard();
  }

  async function handleWeeklyRoll() {
    const result = await rollWeeklyGame();

    if (!result.success) {
      alert(result.message);
      return;
    }

    await refreshBoard();
  }

  return (
    <div className="space-y-6 text-white">
      <h1 className="text-2xl font-bold text-accent">
        Board
      </h1>

      <div className="bg-panel p-4 rounded-xl">
        <div className="flex justify-between items-center">
          <h2 className="font-bold">Daily Game</h2>

          <button
            onClick={handleDailyRoll}
            className="bg-accent text-black px-3 py-1 rounded"
          >
            Roll
          </button>
        </div>

        <p className="mt-2 text-xl">
          {view?.dailyTitle ?? "—"}
        </p>
      </div>

      <div className="bg-panel p-4 rounded-xl">
        <div className="flex justify-between items-center">
          <h2 className="font-bold">Weekly Game</h2>

          <button
            onClick={handleWeeklyRoll}
            className="bg-accent text-black px-3 py-1 rounded"
          >
            Roll
          </button>
        </div>

        <p className="mt-2 text-xl">
          {view?.weeklyTitle ?? "—"}
        </p>
      </div>
    </div>
  );
}