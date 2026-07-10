import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Shield, Plus, Library, Menu, Play } from "lucide-react";
import { rollDailyGame } from "../domain/useCases/rollDailyGame";
import { rollWeeklyGame } from "../domain/useCases/rollWeeklyGame";
import { recordDailyPlay } from "../domain/useCases/recordDailyPlay";
import { recordWeeklyPlay } from "../domain/useCases/recordWeeklyPlay";
import { getBoardView, type BoardView } from "../domain/queries/getBoardView";
import { addGameToLibrary, parsePlatformsInput } from "../domain/services/GameLibraryService";
import { clearReserveGame, setReserveGame } from "../domain/services/BoardService";
import { getPointBalance } from "../database/repositories/pointRepository";
import { getAllGames } from "../database/repositories/gameRepository";
import type { Game, GamePool } from "../database/db";

const EMPTY_SLOT = "—";
const BASE_PLAY_REWARD = 15;
const PLAYTIME_REWARD_PER_30_MINUTES = 10;

function normalizePlaytimeBlocks(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function getPlaytimeBonus(playtimeBlocks: number) {
  return normalizePlaytimeBlocks(playtimeBlocks) * PLAYTIME_REWARD_PER_30_MINUTES;
}

function hasSelectedGame(title: string | undefined) {
  return Boolean(title && title !== EMPTY_SLOT);
}

function getGameStatus(played: boolean, hasGame: boolean): "completed" | "ready" | "awaiting" {
  if (played) return "completed";
  if (hasGame) return "ready";
  return "awaiting";
}

function StatusBadge({ status }: { status: "completed" | "ready" | "awaiting" }) {
  const styles = {
    completed: "bg-emerald-500/20 text-emerald-900 border-emerald-700/30",
    ready: "bg-amber-400/30 text-amber-900 border-amber-800/30",
    awaiting: "bg-slate-300/70 text-slate-700 border-slate-500/30"
  };

  const labels = {
    completed: "Completed",
    ready: "Ready",
    awaiting: "Awaiting Roll"
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold tracking-wider uppercase ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function RewardPanel({
  baseReward,
  playtimeBonus,
  total
}: {
  baseReward: number;
  playtimeBonus: number;
  total: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-400/40 bg-slate-500/25 p-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-100">Reward Summary</p>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-100">Base reward</span>
          <span className="font-semibold text-white">+{baseReward}</span>
        </div>
        {playtimeBonus > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-100">Playtime bonus</span>
            <span className="font-semibold text-white">+{playtimeBonus}</span>
          </div>
        )}
        <div className="border-t border-slate-300/30 pt-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-100">Total</span>
            <span className="text-xl font-black text-white">+{total}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Board() {
  const [view, setView] = useState<BoardView | null>(null);
  const [balance, setBalance] = useState(0);
  const [title, setTitle] = useState("");
  const [pool, setPool] = useState<GamePool>("daily");
  const [platformsInput, setPlatformsInput] = useState("");
  const [dailyPlaytimeBlocks, setDailyPlaytimeBlocks] = useState(0);
  const [weeklyPlaytimeBlocks, setWeeklyPlaytimeBlocks] = useState(0);
  const [libraryGames, setLibraryGames] = useState<Game[]>([]);
  const [reserveSelection, setReserveSelection] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecordingDaily, setIsRecordingDaily] = useState(false);
  const [isRecordingWeekly, setIsRecordingWeekly] = useState(false);
  const [isUpdatingReserve, setIsUpdatingReserve] = useState(false);
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);

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

  async function handleDailyRoll() {
    const result = await rollDailyGame();
    if (!result.success) {
      setMessage(result.message ?? "Daily roll could not be completed.");
      return;
    }
    await refreshBoard();
  }

  async function handleWeeklyRoll() {
    const result = await rollWeeklyGame();
    if (!result.success) {
      setMessage(result.message ?? "Weekly roll could not be completed.");
      return;
    }
    await refreshBoard();
  }

  async function handleRecordDailyPlay() {
    setMessage(null);
    setIsRecordingDaily(true);

    try {
      const result = await recordDailyPlay(normalizePlaytimeBlocks(dailyPlaytimeBlocks));
      if (!result.success) {
        setMessage(result.message ?? "Daily play could not be recorded.");
        return;
      }
      setDailyPlaytimeBlocks(0);
      setMessage(`Recorded play for ${result.data.title}: +${result.data.reward} points.`);
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
      const result = await recordWeeklyPlay(normalizePlaytimeBlocks(weeklyPlaytimeBlocks));
      if (!result.success) {
        setMessage(result.message ?? "Weekly play could not be recorded.");
        return;
      }
      setWeeklyPlaytimeBlocks(0);
      setMessage(`Recorded play for ${result.data.title}: +${result.data.reward} points.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record the weekly play.");
    } finally {
      setIsRecordingWeekly(false);
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

  const dailyReward = BASE_PLAY_REWARD + getPlaytimeBonus(dailyPlaytimeBlocks);
  const weeklyReward = BASE_PLAY_REWARD + getPlaytimeBonus(weeklyPlaytimeBlocks);
  const dailyStatus = getGameStatus(view?.dailyPlayed ?? false, hasSelectedGame(view?.dailyTitle));
  const weeklyStatus = getGameStatus(view?.weeklyPlayed ?? false, hasSelectedGame(view?.weeklyTitle));
  const primaryButtonClass = "rounded-full border-2 border-black/60 bg-[#ff3a3a] px-5 py-2.5 text-sm font-black italic text-black shadow-[0_8px_20px_-12px_rgba(0,0,0,0.9)] transition-all duration-200 enabled:hover:-translate-y-0.5 enabled:hover:bg-[#ff4f4f] disabled:cursor-not-allowed disabled:border-black/20 disabled:bg-slate-300 disabled:text-slate-600";
  const secondaryButtonClass = "rounded-full border-2 border-black/50 bg-white/60 px-5 py-2.5 text-sm font-black italic text-black transition-all duration-200 enabled:hover:-translate-y-0.5 enabled:hover:bg-white/80 disabled:cursor-not-allowed disabled:border-black/20 disabled:bg-slate-200 disabled:text-slate-500";

  return (
    <div className="relative min-h-screen bg-[#8793a8]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-20 top-12 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      </div>

      <header className="relative border-b-2 border-black/30 bg-[#d7d9d8] px-5 py-6 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.9)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-black">
            <Menu className="h-10 w-10" strokeWidth={2.6} />
            <h1 className="text-5xl font-black italic tracking-wide text-[#ff3a3a]">NEXT UP</h1>
          </div>

          <div className="flex items-center gap-3 pr-1 text-black">
            <span className="text-4xl font-black italic">Point Balance:</span>
            <span className="rounded-full bg-[#ff3a3a] px-5 py-2 text-4xl font-black italic leading-none">
              {balance}
            </span>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-2">
          <div className="rounded-[32px] border border-black/10 bg-[#d7d9d8] p-5 shadow-[0_20px_40px_-26px_rgba(0,0,0,0.85)]">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3 px-2">
                <h2 className="text-center text-4xl font-black italic text-black">Game of the Week</h2>
                <StatusBadge status={weeklyStatus} />
              </div>

              <div className="rounded-[24px] bg-[#8e9bb0] p-3">
                <div className="grid gap-3 md:grid-cols-[84px_1fr_84px] md:items-center">
                  <div className="hidden h-28 rounded-2xl bg-black/15 md:block" />
                  <div className="rounded-[22px] bg-gradient-to-br from-[#1d2f59] to-[#52a1d4] p-2.5">
                    <div className="aspect-[4/3] rounded-[18px] border border-white/30 bg-gradient-to-br from-white/15 to-transparent" />
                  </div>
                  <div className="hidden h-28 rounded-2xl bg-black/15 md:block" />
                </div>
              </div>

              <div className="space-y-2 px-2 text-center">
                <p className="text-4xl font-black italic text-black">{view?.weeklyTitle ?? EMPTY_SLOT}</p>
                <p className="text-sm font-black italic uppercase tracking-wider text-black/85">Tap for info</p>
              </div>

              <div className="grid items-start gap-4 px-2 md:grid-cols-3">
                <div className="space-y-2 text-center">
                  <button onClick={handleWeeklyRoll} disabled={view?.weeklyPlayed} className={primaryButtonClass}>
                    Roll!
                  </button>
                  <p className="text-base font-black italic text-black/90">(10pts)</p>
                </div>

                <div className="rounded-2xl bg-[#8e9bb0] p-3">
                  <label className="mb-2 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-100">
                    Playtime
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={weeklyPlaytimeBlocks}
                      onChange={(event) => setWeeklyPlaytimeBlocks(normalizePlaytimeBlocks(Number(event.target.value)))}
                      className="w-16 rounded-lg border border-white/40 bg-white/25 px-2 py-1 text-center text-sm text-white outline-none"
                    />
                  </label>
                  <RewardPanel
                    baseReward={BASE_PLAY_REWARD}
                    playtimeBonus={getPlaytimeBonus(weeklyPlaytimeBlocks)}
                    total={weeklyReward}
                  />
                </div>

                <div className="space-y-2 text-center">
                  <button
                    onClick={handleRecordWeeklyPlay}
                    disabled={isRecordingWeekly || view?.weeklyPlayed || !hasSelectedGame(view?.weeklyTitle)}
                    className={secondaryButtonClass}
                  >
                    {isRecordingWeekly ? "Recording..." : view?.weeklyPlayed ? "Played" : "Mark Played"}
                  </button>
                  <p className="text-base font-black italic text-black/90">Weekly action</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-black/10 bg-[#d7d9d8] p-5 shadow-[0_20px_40px_-26px_rgba(0,0,0,0.85)]">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3 px-2">
                <h2 className="text-center text-4xl font-black italic text-black">Game of the Day</h2>
                <StatusBadge status={dailyStatus} />
              </div>

              <div className="rounded-[24px] bg-[#8e9bb0] p-3">
                <div className="rounded-[22px] bg-gradient-to-br from-[#1b2236] to-[#852f2f] p-2.5">
                  <div className="aspect-[4/3] rounded-[18px] border border-white/30 bg-gradient-to-br from-white/15 to-transparent" />
                </div>
              </div>

              <div className="space-y-2 px-2 text-center">
                <p className="text-4xl font-black italic text-black">{view?.dailyTitle ?? EMPTY_SLOT}</p>
                <p className="text-sm font-black italic uppercase tracking-wider text-black/85">Tap for info</p>
              </div>

              <div className="grid items-start gap-4 px-2 md:grid-cols-3">
                <div className="space-y-2 text-center">
                  <button onClick={handleDailyRoll} disabled={view?.dailyPlayed} className={primaryButtonClass}>
                    Roll!
                  </button>
                  <p className="text-base font-black italic text-black/90">(5pts)</p>
                </div>

                <div className="rounded-2xl bg-[#8e9bb0] p-3">
                  <label className="mb-2 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-100">
                    Playtime
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={dailyPlaytimeBlocks}
                      onChange={(event) => setDailyPlaytimeBlocks(normalizePlaytimeBlocks(Number(event.target.value)))}
                      className="w-16 rounded-lg border border-white/40 bg-white/25 px-2 py-1 text-center text-sm text-white outline-none"
                    />
                  </label>
                  <RewardPanel
                    baseReward={BASE_PLAY_REWARD}
                    playtimeBonus={getPlaytimeBonus(dailyPlaytimeBlocks)}
                    total={dailyReward}
                  />
                </div>

                <div className="space-y-2 text-center">
                  <button
                    onClick={handleRecordDailyPlay}
                    disabled={isRecordingDaily || view?.dailyPlayed || !hasSelectedGame(view?.dailyTitle)}
                    className={secondaryButtonClass}
                  >
                    {isRecordingDaily ? "Recording..." : view?.dailyPlayed ? "Played" : "Mark Played"}
                  </button>
                  <p className="text-base font-black italic text-black/90">Daily action</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {message ? (
          <div className="mt-5 mx-auto max-w-3xl rounded-2xl border border-black/15 bg-[#d7d9d8] px-5 py-4 text-center text-sm font-semibold text-black/80">
            {message}
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.5fr_1fr]">
          <div className="rounded-[28px] border border-black/10 bg-[#d7d9d8] p-5 shadow-[0_20px_40px_-26px_rgba(0,0,0,0.85)]">
            <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
              <div className="rounded-full bg-slate-300 p-8 text-slate-100">
                <Play className="h-16 w-16 fill-current" />
              </div>
              <p className="text-5xl font-black italic leading-tight text-black">Record Play</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={handleRecordDailyPlay}
                  disabled={isRecordingDaily || view?.dailyPlayed || !hasSelectedGame(view?.dailyTitle)}
                  className="rounded-full border border-black/30 bg-white/80 px-4 py-2 text-xs font-bold uppercase tracking-wide text-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Daily
                </button>
                <button
                  onClick={handleRecordWeeklyPlay}
                  disabled={isRecordingWeekly || view?.weeklyPlayed || !hasSelectedGame(view?.weeklyTitle)}
                  className="rounded-full border border-black/30 bg-white/80 px-4 py-2 text-xs font-bold uppercase tracking-wide text-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Weekly
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-black/10 bg-[#d7d9d8] p-5 shadow-[0_20px_40px_-26px_rgba(0,0,0,0.85)]">
            <div className="space-y-4">
              <div className="flex items-start justify-between px-2">
                <h3 className="text-4xl font-black italic text-black">Reserved Game</h3>
                <Shield className="h-7 w-7 text-black/70" />
              </div>

              <div className="rounded-[24px] bg-[#8e9bb0] p-3">
                <div className="rounded-[20px] bg-gradient-to-br from-[#0f2947] to-[#5ca3cc] p-2.5">
                  <div className="aspect-[5/4] rounded-[16px] border border-white/30 bg-gradient-to-br from-white/15 to-transparent" />
                </div>
              </div>

              <div className="space-y-1 px-2 text-center">
                <p className="text-4xl font-black italic text-black">{view?.reserveTitle ?? EMPTY_SLOT}</p>
                <p className="text-sm font-black italic uppercase tracking-wide text-black/85">Tap for info</p>
              </div>

              <div className="space-y-3 rounded-2xl bg-[#8e9bb0] p-4">
                <select
                  value={reserveSelection}
                  onChange={(event) => setReserveSelection(event.target.value)}
                  className="w-full rounded-xl border border-white/35 bg-white/25 px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="">Choose a game</option>
                  {libraryGames.map((game) => (
                    <option key={game.id ?? game.title} value={game.id ?? ""}>
                      {game.title} ({game.pool})
                    </option>
                  ))}
                </select>

                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleSetReserve}
                    disabled={isUpdatingReserve || !reserveSelection}
                    className={primaryButtonClass}
                  >
                    {isUpdatingReserve ? "Saving..." : "Reserve!"}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearReserve}
                    disabled={isUpdatingReserve || !hasSelectedGame(view?.reserveTitle)}
                    className={secondaryButtonClass}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-black/10 bg-[#d7d9d8] p-5 shadow-[0_20px_40px_-26px_rgba(0,0,0,0.85)]">
            <div className="flex h-full flex-col items-center justify-between gap-5 text-center">
              <div className="rounded-2xl bg-white/75 p-6">
                <Library className="h-20 w-20 text-black/90" />
              </div>
              <p className="text-5xl font-black italic leading-tight text-black">View Library</p>
              <Link
                to="/library"
                className="rounded-full border border-black/30 bg-white/80 px-6 py-2 text-sm font-bold uppercase tracking-wide text-black transition hover:bg-white"
              >
                Open
              </Link>

              <div className="w-full rounded-2xl bg-[#8e9bb0] p-3 text-left text-xs text-slate-100">
                <p className="font-semibold">Library Games: {libraryGames.length}</p>
                <p>Daily: {libraryGames.filter((g) => g.pool === "daily").length}</p>
                <p>Weekly: {libraryGames.filter((g) => g.pool === "weekly").length}</p>
                <p>Progress: {view?.dailyPlayed && view?.weeklyPlayed ? "Both" : view?.dailyPlayed ? "Daily" : view?.weeklyPlayed ? "Weekly" : "None"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={() => setIsFlyoutOpen(true)}
        className="fixed bottom-8 right-8 flex h-16 w-16 items-center justify-center rounded-full border-2 border-black/40 bg-[#ff3a3a] shadow-[0_24px_42px_-16px_rgba(0,0,0,0.8)] transition-all duration-300 hover:scale-105 hover:bg-[#ff4f4f] hover:shadow-[0_30px_56px_-16px_rgba(0,0,0,0.85)] active:scale-95"
        title="Add a game"
      >
        <Plus className="h-6 w-6 text-black" />
      </button>

      {isFlyoutOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="z-[10000] w-full max-w-lg rounded-3xl border border-black/20 bg-[#d7d9d8] p-8 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.7)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-4xl font-black italic text-black">Add a Game</h2>
                <p className="mt-2 text-sm text-black/75">Add a new title to the daily or weekly pool.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsFlyoutOpen(false)}
                className="rounded-xl border border-black/20 bg-white/70 px-3 py-2 text-sm font-semibold text-black transition hover:bg-white"
              >
                ✕
              </button>
            </div>

            <form className="mt-8 space-y-4" onSubmit={handleAddGame}>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.2em] text-black/70">Game Title</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-2xl border border-black/20 bg-white/80 px-4 py-3 text-sm text-black outline-none transition focus:bg-white"
                  placeholder="Enter game title"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.2em] text-black/70">Pool</label>
                <select
                  value={pool}
                  onChange={(event) => setPool(event.target.value as GamePool)}
                  className="w-full rounded-2xl border border-black/20 bg-white/80 px-4 py-3 text-sm text-black outline-none transition focus:bg-white"
                >
                  <option value="daily">Daily Pool</option>
                  <option value="weekly">Weekly Pool</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.2em] text-black/70">Platforms</label>
                <input
                  value={platformsInput}
                  onChange={(event) => setPlatformsInput(event.target.value)}
                  className="w-full rounded-2xl border border-black/20 bg-white/80 px-4 py-3 text-sm text-black outline-none transition focus:bg-white"
                  placeholder="e.g. Switch, PC, Steam Deck"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsFlyoutOpen(false)}
                  className="rounded-xl border border-black/20 bg-white/70 px-6 py-3 text-sm font-bold text-black transition-all duration-200 hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-xl border-2 border-black/40 bg-[#ff3a3a] px-6 py-3 text-sm font-black italic text-black transition-all duration-200 disabled:cursor-not-allowed disabled:border-black/20 disabled:bg-slate-300 disabled:text-slate-600 enabled:hover:-translate-y-0.5 enabled:hover:bg-[#ff4f4f]"
                >
                  {isSaving ? "Adding..." : "Add Game"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
