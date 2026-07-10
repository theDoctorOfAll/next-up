import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getAllGames } from "../database/repositories/gameRepository";
import { adjustGameWeightInLibrary, deleteGameFromLibrary, getWeightValueFromSteps, parsePlatformsInput, updateGameInLibrary } from "../domain/services/GameLibraryService";
import type { Game, GamePool } from "../database/db";
import TransientToast from "../components/TransientToast";

const poolLabels: Record<GamePool, string> = {
  daily: "Daily pool",
  weekly: "Weekly pool",
};

export default function Library() {
  const [games, setGames] = useState<Game[]>([]);
  const [expandedGameId, setExpandedGameId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPool, setEditPool] = useState<GamePool>("daily");
  const [editPlatforms, setEditPlatforms] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  async function refreshLibrary() {
    setGames(await getAllGames());
  }

  function startEditing(game: Game) {
    setEditingGame(game);
    setEditTitle(game.title);
    setEditPool(game.pool);
    setEditPlatforms((game.platforms ?? []).join(", "));
    setMessage(null);
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingGame?.id) {
      return;
    }

    setIsSavingEdit(true);
    setMessage(null);

    try {
      await updateGameInLibrary(editingGame.id, {
        title: editTitle,
        pool: editPool,
        platforms: parsePlatformsInput(editPlatforms)
      });

      await refreshLibrary();
      setEditingGame(null);
      setMessage("Game updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the game.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleAdjustWeight(game: Game, direction: "increase" | "decrease") {
    if (!game.id) {
      return;
    }

    setIsSavingEdit(true);
    setMessage(null);

    try {
      const updatedGame = await adjustGameWeightInLibrary(game.id, direction);
      if (editingGame?.id === updatedGame.id) {
        setEditingGame(updatedGame);
      }
      await refreshLibrary();
      setMessage(
        direction === "increase"
          ? `Increased weight to ${getWeightValueFromSteps(updatedGame.weight)}.`
          : `Decreased weight to ${getWeightValueFromSteps(updatedGame.weight)}.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not adjust the game weight.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDeleteGame(game: Game) {
    if (!window.confirm(`Delete "${game.title}" from the library?`)) {
      return;
    }

    setMessage(null);

    try {
      await deleteGameFromLibrary(game.id!);
      await refreshLibrary();
      setMessage(`Removed ${game.title}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete the game.");
    }
  }

  useEffect(() => {
    void refreshLibrary();
  }, []);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMessage(null);
    }, 3500);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const groupedGames = useMemo(() => {
    return (Object.keys(poolLabels) as GamePool[]).reduce<Record<GamePool, Game[]>>(
      (acc, pool) => {
        acc[pool] = games
          .filter((game) => game.pool === pool && !game.reserved)
          .sort((a, b) => a.title.localeCompare(b.title));
        return acc;
      },
      { daily: [], weekly: [] },
    );
  }, [games]);

  const reservedGames = useMemo(() => {
    return games
      .filter((game) => game.reserved)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [games]);

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-accent">Library</h1>
          <p className="mt-1 text-sm opacity-80">Browse the games in each RNG pool and open one for more detail.</p>
        </div>

        <Link to="/" className="rounded bg-accent px-3 py-2 text-sm font-semibold text-black">
          Back to board
        </Link>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-slate-950/80 p-4 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)] sm:p-6">
        <p className="text-sm text-slate-300">
          {games.length} game{games.length === 1 ? "" : "s"} tracked.
        </p>

        {games.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No games yet. Add one from the board.</p>
        ) : (
          <div className="mt-5 space-y-5">
            <section className="rounded-[24px] border border-accent/20 bg-accent/10 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-accent">Reserved</h2>
                <span className="rounded-full border border-accent/20 px-2.5 py-1 text-xs uppercase tracking-wide text-accent">
                  {reservedGames.length}
                </span>
              </div>

              {reservedGames.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-accent/20 bg-black/20 px-3 py-4 text-sm text-slate-400">
                  No games are currently reserved.
                </p>
              ) : (
                <ul className="space-y-2">
                  {reservedGames.map((game) => (
                    <li key={game.id ?? game.title} className="rounded-2xl border border-accent/20 bg-black/20 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{game.title}</p>
                          <p className="text-sm text-slate-400">Held outside the active pools</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEditing(game)}
                            className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:border-accent/40 hover:text-accent"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteGame(game)}
                            className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:border-rose-400/40 hover:text-rose-300"
                          >
                            Delete
                          </button>
                          <span className="rounded-full border border-accent/20 px-2.5 py-1 text-xs uppercase tracking-wide text-accent">
                            Reserved
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
              {(Object.keys(poolLabels) as GamePool[]).map((pool) => (
                <section key={pool} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold capitalize text-accent">{poolLabels[pool]}</h2>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs uppercase tracking-wide text-slate-300">
                    {groupedGames[pool].length}
                  </span>
                </div>

                {groupedGames[pool].length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-3 py-4 text-sm text-slate-400">
                    No games in this pool yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {groupedGames[pool].map((game) => {
                      const isExpanded = expandedGameId === game.id;
                      return (
                        <li key={game.id ?? game.title} className="rounded-2xl border border-white/10 bg-black/20">
                          <button
                            type="button"
                            onClick={() => setExpandedGameId(isExpanded ? null : game.id ?? null)}
                            className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                          >
                            <div>
                              <p className="font-semibold text-white">{game.title}</p>
                              <p className="text-sm text-slate-400">Weight {getWeightValueFromSteps(game.weight)} • {game.reserved ? "Reserved" : "Available"}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleAdjustWeight(game, "increase");
                                }}
                                className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent/20"
                              >
                                Weight +
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleAdjustWeight(game, "decrease");
                                }}
                                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:border-accent/40 hover:text-accent"
                              >
                                Weight -
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startEditing(game);
                                }}
                                className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:border-accent/40 hover:text-accent"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteGame(game);
                                }}
                                className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:border-rose-400/40 hover:text-rose-300"
                              >
                                Delete
                              </button>
                              <span className="text-sm text-accent">{isExpanded ? "−" : "+"}</span>
                            </div>
                          </button>

                          {isExpanded ? (
                            <div className="border-t border-white/10 px-3 py-3 text-sm text-slate-300">
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div>
                                  <p className="text-slate-500">Pool</p>
                                  <p className="font-medium text-white">{poolLabels[game.pool]}</p>
                                </div>
                                <div>
                                  <p className="text-slate-500">Weight</p>
                                  <p className="font-medium text-white">{getWeightValueFromSteps(game.weight)}</p>
                                </div>
                                <div>
                                  <p className="text-slate-500">Platforms</p>
                                  <p className="font-medium text-white">{(game.platforms ?? []).join(", ") || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-slate-500">Reserved</p>
                                  <p className="font-medium text-white">{game.reserved ? "Yes" : "No"}</p>
                                </div>
                                <div>
                                  <p className="text-slate-500">Added</p>
                                  <p className="font-medium text-white">{new Date(game.createdAt).toLocaleDateString()}</p>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
                </section>
              ))}
            </div>
          </div>
        )}
      </div>

      {editingGame ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[32px] border border-white/10 bg-slate-950/95 p-6 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.7)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Edit game</h2>
                <p className="mt-2 text-sm text-slate-400">Adjust the title, pool, or weight for this library entry.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingGame(null)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:border-accent/40 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSaveEdit}>
              <input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
                placeholder="Game title"
                required
              />
              <select
                value={editPool}
                onChange={(event) => setEditPool(event.target.value as GamePool)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
              >
                <option value="daily">Daily pool</option>
                <option value="weekly">Weekly pool</option>
              </select>
              <input
                value={editPlatforms}
                onChange={(event) => setEditPlatforms(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
                placeholder="Platforms (e.g. Switch, PC)"
              />
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Weight</p>
                    <p className="mt-1 text-sm text-slate-400">Current weight: {getWeightValueFromSteps(editingGame.weight)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleAdjustWeight(editingGame, "increase")}
                      disabled={isSavingEdit}
                      className="rounded-full border border-accent/25 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Increase by 50%
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAdjustWeight(editingGame, "decrease")}
                      disabled={isSavingEdit}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:border-accent/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Decrease by 33%
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-400">Each adjustment costs 15 points, and the minimum weight remains 1 via the step-based model.</p>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingEdit ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <TransientToast message={message} onClose={() => setMessage(null)} />
    </div>
  );
}
