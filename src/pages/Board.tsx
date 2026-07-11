import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { rollDailyGame } from "../domain/useCases/rollDailyGame";
import { rollWeeklyGame } from "../domain/useCases/rollWeeklyGame";
import { recordPlaySession } from "../domain/useCases/recordPlaySession";
import { recordMultiplayerSession } from "../domain/useCases/recordMultiplayerSession";
import { getBoardView, type BoardView } from "../domain/queries/getBoardView";
import { clearReserveGame, getCurrentBoard, setReserveGame } from "../domain/services/BoardService";
import { evaluatePlayRules, getMultiplayerReward } from "../domain/rules/rulesEngine";
import { getPointBalance } from "../database/repositories/pointRepository";
import { getAllGames } from "../database/repositories/gameRepository";
import type { Game } from "../database/db";
import TransientToast from "../components/TransientToast";
import { now } from "../core/clock";

const EMPTY_SLOT = "—";
const PLAYTIME_STEP_MINUTES = 15;
const MAX_PLAYTIME_MINUTES = 180;
const PLAYTIME_REWARD_PER_15_MINUTES = 5;
const DAILY_REROLL_COST = 5;
const WEEKLY_REROLL_COST = 10;
const RESERVE_MOVE_COST = 25;
const MAX_MULTIPLAYER_PLAYERS = 10;

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
  const [playSessionPool, setPlaySessionPool] = useState<PlaySessionPool | "">("");
  const [playtimeMinutes, setPlaytimeMinutes] = useState(0);
  const [isMultiplayerLogging, setIsMultiplayerLogging] = useState(false);
  const [multiplayerGameId, setMultiplayerGameId] = useState("");
  const [playerCount, setPlayerCount] = useState(1);
  const [libraryGames, setLibraryGames] = useState<Game[]>([]);
  const [reserveSelection, setReserveSelection] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isRecordingSession, setIsRecordingSession] = useState(false);
  const [isRollingDaily, setIsRollingDaily] = useState(false);
  const [isRollingWeekly, setIsRollingWeekly] = useState(false);
  const [isUpdatingReserve, setIsUpdatingReserve] = useState(false);
  const [isPlayDialogOpen, setIsPlayDialogOpen] = useState(false);
  const [projectedSessionReward, setProjectedSessionReward] = useState<number | null>(null);

  const sessionOptions = useMemo(() => getSessionOptions(view), [view]);
  const selectedSessionOption = sessionOptions.find((option) => option.pool === playSessionPool);
  const multiplayerOptions = useMemo(
    () => libraryGames
      .filter((game) => game.multiplayer)
      .sort((left, right) => left.title.localeCompare(right.title)),
    [libraryGames]
  );
  const selectedMultiplayerGame = multiplayerOptions.find((game) => game.id?.toString() === multiplayerGameId);
  const playtimeBonus = getPlaytimeBonus(playtimeMinutes);
  const projectedPoolBonus = projectedSessionReward === null ? null : Math.max(0, projectedSessionReward - playtimeBonus);
  const multiplayerReward = getMultiplayerReward(playerCount);
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
    if (multiplayerOptions.length === 0) {
      setMultiplayerGameId("");
      return;
    }

    if (!multiplayerOptions.some((game) => game.id?.toString() === multiplayerGameId)) {
      setMultiplayerGameId(multiplayerOptions[0].id?.toString() ?? "");
    }
  }, [multiplayerGameId, multiplayerOptions]);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMessage(null);
    }, 3500);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    if (!isPlayDialogOpen || isMultiplayerLogging) {
      setProjectedSessionReward(null);
      return;
    }

    if (!playSessionPool) {
      setProjectedSessionReward(null);
      return;
    }

    const normalizedMinutes = normalizePlaytimeMinutes(playtimeMinutes);

    if (normalizedMinutes <= 0) {
      setProjectedSessionReward(0);
      return;
    }

    let isCancelled = false;

    void (async () => {
      const board = await getCurrentBoard();
      const rules = await evaluatePlayRules(board, playSessionPool, now(), normalizedMinutes);

      if (isCancelled) {
        return;
      }

      setProjectedSessionReward(rules.allowed ? rules.reward : 0);
    })();

    return () => {
      isCancelled = true;
    };
  }, [isMultiplayerLogging, isPlayDialogOpen, playSessionPool, playtimeMinutes]);

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
        `${wasReroll ? "Rerolled" : "Rolled"} daily game: ${result.data.title}${rollCost > 0 ? ` (-♦${rollCost})` : " (free)"}.`
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
        `${wasReroll ? "Rerolled" : "Rolled"} weekly game: ${result.data.title}${rollCost > 0 ? ` (-♦${rollCost})` : " (free)"}.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Weekly roll could not be completed.");
    } finally {
      setIsRollingWeekly(false);
    }
  }

  async function handleRecordSession() {
    if (isMultiplayerLogging) {
      const selectedGameId = Number(multiplayerGameId);

      if (!selectedGameId) {
        setMessage("Choose a multiplayer title before recording a session.");
        return;
      }

      setMessage(null);
      setIsRecordingSession(true);

      try {
        const result = await recordMultiplayerSession(selectedGameId, playerCount);

        if (!result.success) {
          setMessage(result.message ?? "Multiplayer session could not be recorded.");
          return;
        }

        setPlayerCount(1);
        setMessage(`Recorded multiplayer session for ${result.data.title} with ${result.data.playerCount} player${result.data.playerCount === 1 ? "" : "s"}: +♦${result.data.reward}.`);
        setIsPlayDialogOpen(false);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not record this multiplayer session.");
      } finally {
        setIsRecordingSession(false);
        await refreshBoard();
      }

      return;
    }

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
      setMessage(`Recorded ${result.data.playtimeMinutes} minutes for ${result.data.title}: +♦${result.data.reward}.`);
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-accent">Board</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Pick the next game and manage your library!
            </p>
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-3 lg:w-auto lg:min-w-[420px]">
            <div className="flex min-h-[48px] items-center justify-end rounded-2xl border border-accent/20 bg-white/5 px-3 py-2 text-right">
              <span className="text-xs uppercase tracking-wide text-slate-400">♦ Balance:</span>
              <span className="ml-2 text-2xl font-semibold tracking-tight text-accent">♦{balance}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsPlayDialogOpen(true)}
              className="flex min-h-[48px] items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent/20"
            >
              Record play
            </button>
            <Link
              to="/next-up/library"
              className="flex min-h-[48px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-white/10"
            >
              View full library
            </Link>
          </div>
        </div>
      </div>

      <div 
        className="grid gap-5 md:grid-cols-2"
        style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
      >
        <div className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
          <h2 className="text-xl font-semibold">Daily Game</h2>
          <p className="mt-4 text-2xl font-semibold text-white">{view?.dailyTitle ?? EMPTY_SLOT}</p>
          <p className="mt-3 max-w-sm text-sm text-slate-400">
            {view?.dailyPlayed
              ? "Already marked played"
              : hasSelectedGame(view?.dailyTitle)
                ? "Play today to earn ♦ and keep progress moving."
                : "Roll to choose today\'s game."}
          </p>
          <div className="mt-6 space-y-3">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleDailyRoll}
                disabled={isRollingDaily || view?.dailyPlayed}
                className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-400"
              >
                {isRollingDaily ? "Rolling..." : view?.dailyIsReroll ? `Reroll (♦${DAILY_REROLL_COST})` : "Roll"}
              </button>
            </div>
            <p className={`text-xs ${dailyRerollCost > balance ? "text-red-300" : "text-slate-500"}`}>
              {view?.dailyIsReroll
                ? `${dailyRerollCost > balance ? "Insufficient balance for reroll." : "Reroll uses ♦ from your balance."}`
                : "First daily roll each day is free."}
            </p>
          </div>
        </div>

        <div className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
          <h2 className="text-xl font-semibold">Weekly Game</h2>
          <p className="mt-4 text-2xl font-semibold text-white">{view?.weeklyTitle ?? EMPTY_SLOT}</p>
          <p className="mt-3 max-w-sm text-sm text-slate-400">
            {view?.weeklyPlayed
              ? "Already marked played"
              : hasSelectedGame(view?.weeklyTitle)
                ? "Play this week to earn ♦ rewards."
                : "Roll to choose this week\'s game."}
          </p>
          <div className="mt-6 space-y-3">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleWeeklyRoll}
                disabled={isRollingWeekly || view?.weeklyPlayed}
                className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-400"
              >
                {isRollingWeekly ? "Rolling..." : view?.weeklyIsReroll ? `Reroll (♦${WEEKLY_REROLL_COST})` : "Roll"}
              </button>
            </div>
            <p className={`text-xs ${weeklyRerollCost > balance ? "text-red-300" : "text-slate-500"}`}>
              {view?.weeklyIsReroll
                ? `${weeklyRerollCost > balance ? "Insufficient balance for reroll." : "Reroll uses ♦ from your balance."}`
                : "First weekly roll each week is free."}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
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
              {isUpdatingReserve ? "Saving..." : `Set reserve (♦${RESERVE_MOVE_COST})`}
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

      {isPlayDialogOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/80 px-4 py-6 backdrop-blur-sm sm:items-center">
          <div className="my-auto w-full max-w-lg rounded-[32px] border border-white/10 bg-slate-950/95 p-6 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.7)] z-[10000]">
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
              <button
                type="button"
                role="switch"
                aria-checked={isMultiplayerLogging}
                onClick={() => setIsMultiplayerLogging((current) => !current)}
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition hover:border-accent/30 hover:bg-white/10"
              >
                <span>Log multiplayer session</span>
                <span
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                    isMultiplayerLogging ? "bg-accent" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-slate-950 transition ${
                      isMultiplayerLogging ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </span>
              </button>

              {isMultiplayerLogging ? (
                <label className="block space-y-2 text-sm text-slate-400">
                  <span className="text-xs uppercase tracking-wide">Multiplayer title</span>
                  <select
                    value={multiplayerGameId}
                    onChange={(event) => setMultiplayerGameId(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
                  >
                    {multiplayerOptions.length === 0 ? (
                      <option value="">No multiplayer titles available</option>
                    ) : (
                      multiplayerOptions.map((game) => (
                        <option key={game.id ?? game.title} value={game.id ?? ""}>
                          {game.title}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              ) : null}

              {!isMultiplayerLogging ? (
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
              ) : null}

              {!isMultiplayerLogging ? (
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
                  <p className="text-xs text-slate-500">Playtime bonus from this session: +♦{playtimeBonus}.</p>
                  {playSessionPool === "daily" || playSessionPool === "weekly" ? (
                    <p className="text-xs text-slate-500">{playSessionPool === "daily" ? "Daily" : "Weekly"} bonus from this session: +♦{projectedPoolBonus ?? 0}.</p>
                  ) : null}
                  <p className="text-xs text-slate-400">Total reward from this session: +♦{projectedSessionReward ?? 0}.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                    <span>Player count</span>
                    <span>{playerCount} player{playerCount === 1 ? "" : "s"}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max={MAX_MULTIPLAYER_PLAYERS}
                    step="1"
                    value={playerCount}
                    onChange={(event) => setPlayerCount(Math.max(1, Math.min(MAX_MULTIPLAYER_PLAYERS, Math.floor(Number(event.target.value) || 1))))}
                    className="w-full accent-accent"
                  />
                  <p className="text-xs text-slate-500">Multiplayer reward from this session: +♦{multiplayerReward}.</p>
                  {playerCount <= 1 ? (
                    <p className="text-xs text-amber-300">At least 2 players are required to record a multiplayer session.</p>
                  ) : null}
                </div>
              )}
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
                disabled={isRecordingSession || (isMultiplayerLogging ? !selectedMultiplayerGame || playerCount <= 1 : playtimeMinutes <= 0 || !selectedSessionOption)}
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

