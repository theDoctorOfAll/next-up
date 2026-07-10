import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { rollDailyGame } from "../domain/useCases/rollDailyGame";
import { rollWeeklyGame } from "../domain/useCases/rollWeeklyGame";
import { recordPlaySession } from "../domain/useCases/recordPlaySession";
import { getBoardView, type BoardView } from "../domain/queries/getBoardView";
import { addGameToLibrary, parsePlatformsInput } from "../domain/services/GameLibraryService";
import { clearReserveGame, setReserveGame } from "../domain/services/BoardService";
import { getPointBalance } from "../database/repositories/pointRepository";
import { getAllGames } from "../database/repositories/gameRepository";
import type { Game, GamePool } from "../database/db";
import TransientToast from "../components/TransientToast";

const EMPTY_SLOT = "—";
const PLAYTIME_STEP_MINUTES = 15;
const MAX_PLAYTIME_MINUTES = 180;
const PLAYTIME_REWARD_PER_15_MINUTES = 5;
const DAILY_REROLL_COST = 5;
const WEEKLY_REROLL_COST = 10;

type PlaySessionPool = "daily" | "weekly" | "reserve";

interface PlaySessionOption {
  pool: PlaySessionPool;
  title: string;
}

function normalizePlaytimeMinutes(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const bounded = Math.max(0, Math.min(MAX_PLAYTIME_MINUTES, Math.floor(value)));
  return Math.floor(bounded / PLAYTIME_STEP_MINUTES) * PLAYTIME_STEP_MINUTES;
}

function getPlaytimeBonus(playtimeMinutes: number) {
  return Math.floor(playtimeMinutes / PLAYTIME_STEP_MINUTES) * PLAYTIME_REWARD_PER_15_MINUTES;
}

function hasSelectedGame(title: string | undefined) {
  return Boolean(title && title !== EMPTY_SLOT);
}

function getSessionOptions(view: BoardView | null): PlaySessionOption[] {
  if (!view) {
    return [];
  }

  const options: PlaySessionOption[] = [];

  if (hasSelectedGame(view.dailyTitle)) {
    options.push({ pool: "daily", title: view.dailyTitle });
  }

  if (hasSelectedGame(view.weeklyTitle)) {
    options.push({ pool: "weekly", title: view.weeklyTitle });
  }

  if (hasSelectedGame(view.reserveTitle)) {
    options.push({ pool: "reserve", title: view.reserveTitle });
  }

  return options;
}

export default function Board() {
  const [view, setView] = useState<BoardView | null>(null);
  const [balance, setBalance] = useState(0);
  const [title, setTitle] = useState("");
  const [pool, setPool] = useState<GamePool>("daily");
  const [platformsInput, setPlatformsInput] = useState("");
  const [playSessionPool, setPlaySessionPool] = useState<PlaySessionPool | "">("");
  const [playtimeMinutes, setPlaytimeMinutes] = useState(0);
  const [libraryGames, setLibraryGames] = useState<Game[]>([]);
  const [reserveSelection, setReserveSelection] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecordingSession, setIsRecordingSession] = useState(false);
  const [isRollingDaily, setIsRollingDaily] = useState(false);
  const [isRollingWeekly, setIsRollingWeekly] = useState(false);
  const [isUpdatingReserve, setIsUpdatingReserve] = useState(false);
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);
  const [isPlayDialogOpen, setIsPlayDialogOpen] = useState(false);

  const sessionOptions = useMemo(() => getSessionOptions(view), [view]);
  const selectedSessionOption = sessionOptions.find((option) => option.pool === playSessionPool);
  const playtimeBonus = getPlaytimeBonus(playtimeMinutes);
  const dailyRerollCost = view?.dailyIsReroll ? DAILY_REROLL_COST : 0;
  const weeklyRerollCost = view?.weeklyIsReroll ? WEEKLY_REROLL_COST : 0;

  async function refreshBoard() {
    const [nextView, nextBalance, nextGames] = await Promise.all([
      getBoardView(),
      getPointBalance(),
      getAllGames()
    ]);

    setView(nextView);
    setBalance(nextBalance);
    setLibraryGames(nextGames);
    setReserveSelection(
      nextView.reserveTitle === EMPTY_SLOT
        ? ""
        : nextGames.find((game) => game.title === nextView.reserveTitle)?.id?.toString() ?? ""
    );
  }

  useEffect(() => {
    void refreshBoard();
  }, []);

  useEffect(() => {
    if (sessionOptions.length === 0) {
      setPlaySessionPool("");
      return;
    }

    if (!sessionOptions.some((option) => option.pool === playSessionPool)) {
      setPlaySessionPool(sessionOptions[0].pool);
    }
  }, [playSessionPool, sessionOptions]);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMessage(null);
    }, 3500);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function handleDailyRoll() {
    setMessage(null);
    setIsRollingDaily(true);

    try {
      const wasReroll = Boolean(view?.dailyIsReroll);
      const rollCost = wasReroll ? DAILY_REROLL_COST : 0;
      const result = await rollDailyGame();

      if (!result.success) {
        setMessage(result.message ?? "Daily roll could not be completed.");
        return;
      }

      await refreshBoard();
      setMessage(
        `${wasReroll ? "Rerolled" : "Rolled"} daily game: ${result.data.title}${rollCost > 0 ? ` (-${rollCost} points)` : " (free)"}.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Daily roll could not be completed.");
    } finally {
      setIsRollingDaily(false);
    }
  }

  async function handleWeeklyRoll() {
    setMessage(null);
    setIsRollingWeekly(true);

    try {
      const wasReroll = Boolean(view?.weeklyIsReroll);
      const rollCost = wasReroll ? WEEKLY_REROLL_COST : 0;
      const result = await rollWeeklyGame();

      if (!result.success) {
        setMessage(result.message ?? "Weekly roll could not be completed.");
        return;
      }

      await refreshBoard();
      setMessage(
        `${wasReroll ? "Rerolled" : "Rolled"} weekly game: ${result.data.title}${rollCost > 0 ? ` (-${rollCost} points)` : " (free)"}.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Weekly roll could not be completed.");
    } finally {
      setIsRollingWeekly(false);
    }
  }

  async function handleRecordSession() {
    if (!playSessionPool) {
      setMessage("Select an active game slot before recording a session.");
      return;
    }

    const normalizedMinutes = normalizePlaytimeMinutes(playtimeMinutes);

    if (normalizedMinutes <= 0) {
      setMessage("Playtime must be greater than zero to record a session.");
      return;
    }

    setMessage(null);
    setIsRecordingSession(true);

    try {
      const result = await recordPlaySession(playSessionPool, normalizedMinutes);

      if (!result.success) {
        setMessage(result.message ?? "Play session could not be recorded.");
        return;
      }

      setPlaytimeMinutes(0);
      setMessage(`Recorded ${result.data.playtimeMinutes} minutes for ${result.data.title}: +${result.data.reward} points.`);
      setIsPlayDialogOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record this play session.");
    } finally {
      setIsRecordingSession(false);
      await refreshBoard();
    }
  }

  async function handleSetReserve() {
    const selectedGameId = Number(reserveSelection);

    if (!selectedGameId) {
      setMessage("Choose a game to place in the reserve slot.");
      return;
    }

    setMessage(null);
    setIsUpdatingReserve(true);

    try {
      await setReserveGame(selectedGameId);
      await refreshBoard();
      const selectedGame = libraryGames.find((game) => game.id === selectedGameId);
      setMessage(`${selectedGame?.title ?? "Selected game"} is now your reserve slot.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the reserve slot.");
    } finally {
      setIsUpdatingReserve(false);
    }
  }

  async function handleClearReserve() {
    setMessage(null);
    setIsUpdatingReserve(true);

    try {
      await clearReserveGame();
      await refreshBoard();
      setMessage("Reserve slot cleared.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not clear the reserve slot.");
    } finally {
      setIsUpdatingReserve(false);
    }
  }

  async function handleAddGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSaving(true);

    try {
      await addGameToLibrary(title, pool, parsePlatformsInput(platformsInput));
      const addedTitle = title.trim();
      setTitle("");
      setPlatformsInput("");
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
          </div>
        </div>
      </div>

      <div className="rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">Points balance</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-accent">{balance}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPlayDialogOpen(true)}
              className="rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/20"
            >
              Record play
            </button>
            <div className="rounded-3xl border border-accent/20 bg-white/5 px-4 py-3 text-sm text-slate-300">
              Front-facing economy view
            </div>
          </div>
        </div>
      </div>

      <div 
        className="grid gap-5 md:grid-cols-2"
        style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
      >
        <div className="rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)]">
          <h2 className="text-xl font-semibold">Daily Game</h2>
          <p className="mt-4 text-2xl font-semibold text-white">{view?.dailyTitle ?? EMPTY_SLOT}</p>
          <p className="mt-3 max-w-sm text-sm text-slate-400">
            {view?.dailyPlayed
              ? "Already marked played"
              : hasSelectedGame(view?.dailyTitle)
                ? "Play today to earn points and keep progress moving."
                : "Roll to choose today\'s game."}
          </p>
          <div className="mt-6 space-y-3">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleDailyRoll}
                disabled={isRollingDaily || view?.dailyPlayed}
                className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-400"
              >
                {isRollingDaily ? "Rolling..." : view?.dailyIsReroll ? "Reroll" : "Roll"}
              </button>
            </div>
            <p className={`text-xs ${dailyRerollCost > balance ? "text-red-300" : "text-slate-500"}`}>
              {view?.dailyIsReroll
                ? `Reroll cost: ${DAILY_REROLL_COST} points${dailyRerollCost > balance ? " (insufficient balance)" : ""}.`
                : "First daily roll each day is free."}
            </p>
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)]">
          <h2 className="text-xl font-semibold">Weekly Game</h2>
          <p className="mt-4 text-2xl font-semibold text-white">{view?.weeklyTitle ?? EMPTY_SLOT}</p>
          <p className="mt-3 max-w-sm text-sm text-slate-400">
            {view?.weeklyPlayed
              ? "Already marked played"
              : hasSelectedGame(view?.weeklyTitle)
                ? "Play this week to earn reward points."
                : "Roll to choose this week\'s game."}
          </p>
          <div className="mt-6 space-y-3">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleWeeklyRoll}
                disabled={isRollingWeekly || view?.weeklyPlayed}
                className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-400"
              >
                {isRollingWeekly ? "Rolling..." : view?.weeklyIsReroll ? "Reroll" : "Roll"}
              </button>
            </div>
            <p className={`text-xs ${weeklyRerollCost > balance ? "text-red-300" : "text-slate-500"}`}>
              {view?.weeklyIsReroll
                ? `Reroll cost: ${WEEKLY_REROLL_COST} points${weeklyRerollCost > balance ? " (insufficient balance)" : ""}.`
                : "First weekly roll each week is free."}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Reserve slot</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Keep a backup game on hand. Reserved titles stay out of daily and weekly rolls until you clear the slot.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-accent/20 bg-white/5 p-4">
          <p className="text-sm uppercase tracking-wide text-slate-400">Current reserve</p>
          <p className="mt-2 text-2xl font-semibold text-white">{view?.reserveTitle ?? EMPTY_SLOT}</p>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={reserveSelection}
            onChange={(event) => setReserveSelection(event.target.value)}
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
          >
            <option value="">Choose a game</option>
            {libraryGames.map((game) => (
              <option key={game.id ?? game.title} value={game.id ?? ""}>
                {game.title} ({game.pool})
              </option>
            ))}
          </select>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSetReserve}
              disabled={isUpdatingReserve || !reserveSelection}
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUpdatingReserve ? "Saving..." : "Set reserve"}
            </button>
            <button
              type="button"
              onClick={handleClearReserve}
              disabled={isUpdatingReserve || !hasSelectedGame(view?.reserveTitle)}
              className="rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-slate-500"
            >
              Clear
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
              <input
                value={platformsInput}
                onChange={(event) => setPlatformsInput(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
                placeholder="Platforms (e.g. Switch, PC, Steam Deck)"
              />
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

      {isPlayDialogOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[32px] border border-white/10 bg-slate-950/95 p-6 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.7)] z-[10000]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Record play session</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Choose an active slot and log playtime in 15-minute increments.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPlayDialogOpen(false)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:border-accent/40 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <label className="block space-y-2 text-sm text-slate-400">
                <span className="text-xs uppercase tracking-wide">Played title</span>
                <select
                  value={playSessionPool}
                  onChange={(event) => setPlaySessionPool(event.target.value as PlaySessionPool)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
                >
                  {sessionOptions.length === 0 ? (
                    <option value="">No active titles</option>
                  ) : (
                    sessionOptions.map((option) => (
                      <option key={option.pool} value={option.pool}>
                        {option.title} ({option.pool})
                      </option>
                    ))
                  )}
                </select>
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                  <span>Playtime</span>
                  <span>{playtimeMinutes} minutes</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={MAX_PLAYTIME_MINUTES}
                  step={PLAYTIME_STEP_MINUTES}
                  value={playtimeMinutes}
                  onChange={(event) => setPlaytimeMinutes(normalizePlaytimeMinutes(Number(event.target.value)))}
                  className="w-full accent-accent"
                />
                <p className="text-xs text-slate-500">Playtime bonus from this session: +{playtimeBonus} points.</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsPlayDialogOpen(false)}
                className="rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordSession}
                disabled={isRecordingSession || playtimeMinutes <= 0 || !selectedSessionOption}
                className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRecordingSession ? "Recording..." : "Record session"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <TransientToast message={message} onClose={() => setMessage(null)} />
    </div>
  );
}
