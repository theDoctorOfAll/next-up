import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { rollDailyGame } from "../domain/useCases/rollDailyGame";
import { rollWeeklyGame } from "../domain/useCases/rollWeeklyGame";
import { recordDailyPlay } from "../domain/useCases/recordDailyPlay";
import { recordWeeklyPlay } from "../domain/useCases/recordWeeklyPlay";
import { getBoardView, type BoardView } from "../domain/queries/getBoardView";
import { addGameToLibrary } from "../domain/services/GameLibraryService";
import { clearEventHistory } from "../database/services";
import { getPointBalance } from "../database/repositories/pointRepository";
import type { GamePool } from "../database/db";

export default function Board() {
  const [view, setView] = useState<BoardView | null>(null);
  const [balance, setBalance] = useState(0);
  const [title, setTitle] = useState("");
  const [pool, setPool] = useState<GamePool>("daily");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecordingDaily, setIsRecordingDaily] = useState(false);
  const [isRecordingWeekly, setIsRecordingWeekly] = useState(false);
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);

  async function refreshBoard() {
    const [nextView, nextBalance] = await Promise.all([getBoardView(), getPointBalance()]);

    setView(nextView);
    setBalance(nextBalance);
  }

  useEffect(() => {
    void refreshBoard();
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

  async function handleRecordDailyPlay() {
    setMessage(null);
    setIsRecordingDaily(true);

    try {
      const result = await recordDailyPlay();

      if (!result.success) {
        alert(result.message);
        return;
      }

      setMessage(`Recorded play for ${result.data.title}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record the daily play.");
    } finally {
      setIsRecordingDaily(false);
      await refreshBoard();
    }
  }

  async function handleRecordWeeklyPlay() {
    setMessage(null);
    setIsRecordingWeekly(true);

    try {
      const result = await recordWeeklyPlay();

      if (!result.success) {
        alert(result.message);
        return;
      }

      setMessage(`Recorded play for ${result.data.title}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record the weekly play.");
    } finally {
      setIsRecordingWeekly(false);
      await refreshBoard();
    }
  }

  async function handleResetEventHistory() {
    if (!window.confirm("Reset event history? This cannot be undone.")) {
      return;
    }

    setMessage(null);

    try {
      await clearEventHistory();
      setMessage("Event history reset.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reset event history.");
    }
  }

  async function handleAddGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSaving(true);

    try {
      await addGameToLibrary(title, pool);
      const addedTitle = title.trim();
      setTitle("");
      setMessage(`Added "${addedTitle}" to the ${pool} pool.`);
      setIsFlyoutOpen(false);
      await refreshBoard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add the game.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-accent">Board</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Pick the next game, manage your library, and keep your daily and weekly play state aligned.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsFlyoutOpen(true)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-accent/40 hover:bg-white/10"
            >
              Add a game
            </button>
            <Link
              to="/library"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-white/10"
            >
              View full library
            </Link>
            <button
              type="button"
              onClick={handleResetEventHistory}
              className="rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-accent/40 hover:bg-white/10"
            >
              Reset event history
            </button>
          </div>
        </div>
      </div>

      {message ? (
        <div className="rounded-[28px] border border-accent/20 bg-white/5 p-4 text-sm text-accent shadow-[0_20px_80px_-60px_rgba(170,59,255,0.5)]">
          {message}
        </div>
      ) : null}

      <div className="rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">Points balance</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-accent">{balance}</p>
          </div>
          <div className="rounded-3xl border border-accent/20 bg-white/5 px-4 py-3 text-sm text-slate-300">
            Front-facing economy view
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)]">
          <h2 className="text-xl font-semibold">Daily Game</h2>
          <p className="mt-4 text-2xl font-semibold text-white">{view?.dailyTitle ?? "—"}</p>
          <p className="mt-3 max-w-sm text-sm text-slate-400">
            {view?.dailyPlayed ? "Already marked played" : "Play today to earn points and keep progress moving."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={handleDailyRoll}
              disabled={view?.dailyPlayed || view?.dailyTitle === "—"}
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-400"
            >
              Roll
            </button>
            <button
              onClick={handleRecordDailyPlay}
              disabled={isRecordingDaily || view?.dailyPlayed || view?.dailyTitle === "—"}
              className="rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-slate-500"
            >
              {isRecordingDaily ? "Recording..." : view?.dailyPlayed ? "Played" : "Mark played"}
            </button>
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)]">
          <h2 className="text-xl font-semibold">Weekly Game</h2>
          <p className="mt-4 text-2xl font-semibold text-white">{view?.weeklyTitle ?? "—"}</p>
          <p className="mt-3 max-w-sm text-sm text-slate-400">
            {view?.weeklyPlayed ? "Already marked played" : "Play this week to earn reward points."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={handleWeeklyRoll}
              disabled={view?.weeklyPlayed || view?.weeklyTitle === "—"}
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-400"
            >
              Roll
            </button>
            <button
              onClick={handleRecordWeeklyPlay}
              disabled={isRecordingWeekly || view?.weeklyPlayed || view?.weeklyTitle === "—"}
              className="rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-slate-500"
            >
              {isRecordingWeekly ? "Recording..." : view?.weeklyPlayed ? "Played" : "Mark played"}
            </button>
          </div>
        </div>
      </div>

      {isFlyoutOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[32px] border border-white/10 bg-slate-950/95 p-6 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.7)] z-[10000]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Add a game</h2>
                <p className="mt-2 text-sm text-slate-400">Add a new title to the daily or weekly pool.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsFlyoutOpen(false)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:border-accent/40 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleAddGame}>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
                placeholder="Game title"
                required
              />
              <select
                value={pool}
                onChange={(event) => setPool(event.target.value as GamePool)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
              >
                <option value="daily">Daily pool</option>
                <option value="weekly">Weekly pool</option>
              </select>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Saving..." : "Add game"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}