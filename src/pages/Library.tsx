import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAllGames } from "../database/repositories/gameRepository";
import type { Game } from "../database/db";

export default function Library() {
  const [games, setGames] = useState<Game[]>([]);

  async function refreshLibrary() {
    setGames(await getAllGames());
  }

  useEffect(() => {
    void refreshLibrary();
  }, []);

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-accent">Library</h1>
          <p className="mt-1 text-sm opacity-80">
            Every game in the RNG pools and reserve list.
          </p>
        </div>

        <Link to="/" className="rounded bg-accent px-3 py-2 text-sm font-semibold text-black">
          Back to board
        </Link>
      </div>

      <div className="rounded-xl bg-panel p-4">
        <p className="text-sm opacity-80">
          {games.length} game{games.length === 1 ? "" : "s"} tracked.
        </p>

        {games.length === 0 ? (
          <p className="mt-4 text-sm opacity-70">No games yet. Add one from the board.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {games.map((game) => (
              <li
                key={game.id ?? game.title}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-3"
              >
                <div>
                  <p className="font-semibold">{game.title}</p>
                  <p className="text-sm opacity-70">
                    Pool: {game.pool} · Weight: {game.weight} · Reserved: {game.reserved ? "Yes" : "No"}
                  </p>
                </div>
                <span className="rounded-full border border-accent/50 px-2 py-1 text-xs uppercase tracking-wide text-accent">
                  {game.pool}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
