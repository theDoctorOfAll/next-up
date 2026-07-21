import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { type GameMode, getGameModeState, setGameMode } from "../database/repositories/gameModeRepository";
import { resetLocalState, addPoints } from "../database/services";
import { formatFullDataRestoreSummary, restoreFullDataBackup } from "../database/repositories/backupRepository";
import { storeGameCoverCache } from "../database/repositories/gameCoverRepository";
import { markOnboardingCompleted } from "../database/repositories/onboardingRepository";
import { getPointBalance } from "../database/repositories/pointRepository";
import { getBoard } from "../database/repositories/boardRepository";
import { addGame, getAllGames, updateGame } from "../database/repositories/gameRepository";
import { db, type Game, type GamePool } from "../database/db";
import { advanceClockByDays, getClockOffsetMs } from "../core/clock";
import { isDeveloperModeEnabled, isHighContrastModeEnabled, setDeveloperModeEnabled, setHighContrastModeEnabled } from "../core/runtimePreferences";
import { searchIgdbByTitle } from "../services/igdbClient";
import TransientToast from "../components/TransientToast";

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLocaleLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function parseOptionalIgdbId(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.trunc(parsed);
}

function toCsvCell(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
      }

      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows;
}

function parsePlatforms(value: string) {
  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePool(value: string): GamePool {
  const pool = value.trim().toLocaleLowerCase();

  if (pool !== "daily" && pool !== "weekly" && pool !== "none") {
    throw new Error(`Invalid pool \"${value}\". Expected daily, weekly, or none.`);
  }

  return pool;
}

type ReserveChoice = {
  normalizedTitle: string;
  title: string;
};

type ImportedCoverTarget = {
  gameId: number;
  title: string;
  igdbId: number;
};

export default function Settings() {
  const navigate = useNavigate();
  const [balance, setBalance] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isGrantingPoints, setIsGrantingPoints] = useState(false);
  const [isJumpingDay, setIsJumpingDay] = useState(false);
  const [isExportingLibrary, setIsExportingLibrary] = useState(false);
  const [isExportingAllData, setIsExportingAllData] = useState(false);
  const [isImportingAllData, setIsImportingAllData] = useState(false);
  const [isImportingLibrary, setIsImportingLibrary] = useState(false);
  const [reserveConflictChoices, setReserveConflictChoices] = useState<ReserveChoice[]>([]);
  const [reserveConflictSelection, setReserveConflictSelection] = useState("");
  const [gameMode, setGameModeState] = useState<GameMode>("standard");
  const [nextModeChangeAt, setNextModeChangeAt] = useState<number | null>(null);
  const [canChangeMode, setCanChangeMode] = useState(true);
  const [isChangingMode, setIsChangingMode] = useState(false);
  const [isHighContrastMode, setIsHighContrastMode] = useState(() => isHighContrastModeEnabled());
  const [isDeveloperMode, setIsDeveloperMode] = useState(() => isDeveloperModeEnabled());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fullDataInputRef = useRef<HTMLInputElement | null>(null);
  const reserveConflictResolverRef = useRef<((value: string | null) => void) | null>(null);

  async function refreshSettings() {
    const [nextBalance, modeState] = await Promise.all([
      getPointBalance(),
      getGameModeState()
    ]);

    setBalance(nextBalance);
    setGameModeState(modeState.mode);
    setCanChangeMode(modeState.canChange);
    setNextModeChangeAt(modeState.nextChangeAt);
  }

  useEffect(() => {
    void refreshSettings();
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

  useEffect(() => {
    setHighContrastModeEnabled(isHighContrastMode);
  }, [isHighContrastMode]);

  useEffect(() => {
    const detail = {
      actions: [
        {
          id: "settings-back-board",
          label: "Board",
          type: "link",
          to: "/next-up/board",
          icon: "back"
        }
      ]
    };

    window.dispatchEvent(new CustomEvent("nextup:mobile-header-items", { detail }));

    return () => {
      window.dispatchEvent(new CustomEvent("nextup:mobile-header-items", { detail: {} }));
    };
  }, []);

  async function handleGrantPoints() {
    setIsGrantingPoints(true);
    setMessage(null);

    try {
      await addPoints(100, "developer points");
      await refreshSettings();
      setMessage("Added ♦100.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add developer ♦.");
    } finally {
      setIsGrantingPoints(false);
    }
  }

  async function handleReset() {
    if (!window.confirm("Reset all local game data and return to onboarding? This cannot be undone.")) {
      return;
    }

    setIsResetting(true);
    setMessage(null);

    try {
      await resetLocalState();
      navigate("/next-up/onboarding", { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reset settings.");
    } finally {
      setIsResetting(false);
    }
  }

  async function handleJumpToNextDay() {
    setIsJumpingDay(true);
    setMessage(null);

    try {
      const nextOffsetMs = advanceClockByDays(1);
      const simulatedNow = new Date(Date.now() + nextOffsetMs);
      const offsetDays = Math.trunc(getClockOffsetMs() / (24 * 60 * 60 * 1000));

      setMessage(`Jumped to next day. Simulated date is now ${simulatedNow.toLocaleString()} (offset: +${offsetDays} day${offsetDays === 1 ? "" : "s"}).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not jump to the next day.");
    } finally {
      setIsJumpingDay(false);
    }
  }

  async function handleChangeMode(nextMode: GameMode) {
    setIsChangingMode(true);
    setMessage(null);

    try {
      const modeState = await setGameMode(nextMode);
      setGameModeState(modeState.mode);
      setCanChangeMode(modeState.canChange);
      setNextModeChangeAt(modeState.nextChangeAt);
      setMessage(`Switched to ${nextMode === "completion" ? "Completion" : "Standard"} mode.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change the game mode.");
    } finally {
      setIsChangingMode(false);
    }
  }

  function clearReserveConflictDialog() {
    setReserveConflictChoices([]);
    setReserveConflictSelection("");
    reserveConflictResolverRef.current = null;
  }

  function requestReserveConflictSelection(choices: ReserveChoice[]) {
    setReserveConflictChoices(choices);
    setReserveConflictSelection(choices[0]?.normalizedTitle ?? "");

    return new Promise<string | null>((resolve) => {
      reserveConflictResolverRef.current = resolve;
    });
  }

  function handleReserveConflictCancel() {
    reserveConflictResolverRef.current?.(null);
    clearReserveConflictDialog();
  }

  function handleReserveConflictConfirm() {
    if (!reserveConflictSelection) {
      return;
    }

    reserveConflictResolverRef.current?.(reserveConflictSelection);
    clearReserveConflictDialog();
  }

  async function fetchImportedCoverFromIgdb(target: ImportedCoverTarget) {
    const response = await searchIgdbByTitle(target.title, { limit: 20 });
    const candidates = response.selected
      ? [response.selected, ...response.alternatives]
      : response.alternatives;
    const matched = candidates.find((candidate) => candidate.id === target.igdbId);

    if (!matched) {
      return false;
    }

    await storeGameCoverCache(target.gameId, {
      igdbId: matched.id,
      imageUrl: matched.imageUrl,
      imageId: matched.imageId,
      confidence: matched.confidence,
      searchQuery: target.title
    });

    return true;
  }

  async function handleExportLibrary() {
    setIsExportingLibrary(true);
    setMessage(null);

    try {
      const games = await getAllGames();
      const lines = ["title,pool,weight,platforms,multiplayer,reserved,completed,igdbId"];

      for (const game of games) {
        lines.push(
          [
            toCsvCell(game.title),
            toCsvCell(game.pool),
            toCsvCell(String(game.weight ?? 0)),
            toCsvCell((game.platforms ?? []).join(";")),
            toCsvCell(String(Boolean(game.multiplayer))),
            toCsvCell(String(Boolean(game.reserved))),
            toCsvCell(String(Boolean(game.completed))),
            toCsvCell(game.igdbId ? String(game.igdbId) : "")
          ].join(",")
        );
      }

      const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `next-up-library-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setMessage(`Exported ${games.length} game${games.length === 1 ? "" : "s"} to CSV.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export the game library.");
    } finally {
      setIsExportingLibrary(false);
    }
  }

  async function handleExportAllData() {
    setIsExportingAllData(true);
    setMessage(null);

    try {
      const [games, events, board, points, metadata] = await Promise.all([
        getAllGames(),
        db.events.orderBy("timestamp").toArray(),
        getBoard(),
        db.points.orderBy("timestamp").toArray(),
        db.metadata.toArray()
      ]);

      const payload = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        data: {
          library: games,
          eventLog: events,
          board,
          points,
          metadata
        }
      };

      const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `next-up-full-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setMessage(`Exported full data snapshot: ${games.length} game${games.length === 1 ? "" : "s"}, ${events.length} event${events.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export full data snapshot.");
    } finally {
      setIsExportingAllData(false);
    }
  }

  async function handleImportAllData(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsImportingAllData(true);
    setMessage(null);

    try {
      const text = await file.text();
      const result = await restoreFullDataBackup(text);
      await markOnboardingCompleted();
      await refreshSettings();
      setMessage(formatFullDataRestoreSummary(result));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not restore the full data backup.");
    } finally {
      event.target.value = "";
      setIsImportingAllData(false);
    }
  }

  async function handleImportLibrary(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsImportingLibrary(true);
    setMessage(null);

    try {
      const text = await file.text();
      const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim() !== ""));

      if (rows.length === 0) {
        throw new Error("CSV file is empty.");
      }

      const header = rows[0].map((cell) => cell.trim().toLocaleLowerCase());
      const requiredColumns = ["title", "pool", "weight", "platforms", "multiplayer", "reserved"];

      if (!requiredColumns.every((column) => header.includes(column))) {
        throw new Error("CSV header must include: title,pool,weight,platforms,multiplayer,reserved");
      }

      const indexes = {
        title: header.indexOf("title"),
        pool: header.indexOf("pool"),
        weight: header.indexOf("weight"),
        platforms: header.indexOf("platforms"),
        multiplayer: header.indexOf("multiplayer"),
        reserved: header.indexOf("reserved"),
        completed: header.indexOf("completed"),
        igdbId: header.indexOf("igdbid")
      };

      const reserveChoicesByTitle = new Map<string, string>();

      for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        const title = (row[indexes.title] ?? "").trim();

        if (!title) {
          continue;
        }

        if (!parseBoolean(row[indexes.reserved] ?? "false")) {
          continue;
        }

        const normalized = normalizeTitle(title);

        if (!reserveChoicesByTitle.has(normalized)) {
          reserveChoicesByTitle.set(normalized, title);
        }
      }

      const reserveChoices = Array.from(reserveChoicesByTitle.entries()).map(([normalizedTitle, title]) => ({ normalizedTitle, title }));
      let selectedReservedTitle = reserveChoices.length === 1 ? reserveChoices[0]?.normalizedTitle : undefined;

      if (reserveChoices.length > 1) {
        const selected = await requestReserveConflictSelection(reserveChoices);

        if (!selected) {
          setMessage("CSV import cancelled.");
          return;
        }

        selectedReservedTitle = selected;
      }

      const existingGames = await getAllGames();
      const existingByTitle = new Map(existingGames.map((game) => [normalizeTitle(game.title), game]));
      const coverFetchTargetsByGameId = new Map<number, ImportedCoverTarget>();
      let created = 0;
      let updated = 0;
      let hasAnyChange = false;
      let hasReservedFieldChange = false;
      let hasNonReservedFieldChange = false;

      for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        const title = (row[indexes.title] ?? "").trim();

        if (!title) {
          continue;
        }

        const pool = parsePool(row[indexes.pool] ?? "");
        const weightValue = Number(row[indexes.weight] ?? "0");
        const weight = Number.isFinite(weightValue) ? Math.round(weightValue) : 0;
        const platforms = parsePlatforms(row[indexes.platforms] ?? "");
        const multiplayer = parseBoolean(row[indexes.multiplayer] ?? "false");
        const reservedFromCsv = parseBoolean(row[indexes.reserved] ?? "false");
        const normalized = normalizeTitle(title);
        const reserved = selectedReservedTitle
          ? (reservedFromCsv && normalized === selectedReservedTitle)
          : reservedFromCsv;
        const existing = existingByTitle.get(normalized);
        const completed = indexes.completed >= 0
          ? parseBoolean(row[indexes.completed] ?? "false")
          : (existing?.completed ?? false);
        const igdbId = indexes.igdbId >= 0
          ? parseOptionalIgdbId(row[indexes.igdbId] ?? "")
          : existing?.igdbId;

        if (existing?.id) {
          const nextGame: Game = {
            ...existing,
            title,
            pool,
            weight,
            platforms,
            multiplayer,
            reserved,
            completed,
            igdbId,
            updatedAt: Date.now()
          };

          const titleChanged = existing.title !== nextGame.title;
          const poolChanged = existing.pool !== nextGame.pool;
          const weightChanged = existing.weight !== nextGame.weight;
          const platformsChanged = JSON.stringify(existing.platforms ?? []) !== JSON.stringify(nextGame.platforms ?? []);
          const multiplayerChanged = existing.multiplayer !== nextGame.multiplayer;
          const completedChanged = existing.completed !== nextGame.completed;
          const igdbIdChanged = (existing.igdbId ?? undefined) !== (nextGame.igdbId ?? undefined);
          const reservedChanged = existing.reserved !== nextGame.reserved;

          if (titleChanged || poolChanged || weightChanged || platformsChanged || multiplayerChanged || completedChanged || igdbIdChanged || reservedChanged) {
            hasAnyChange = true;
          }

          if (reservedChanged) {
            hasReservedFieldChange = true;
          }

          if (titleChanged || poolChanged || weightChanged || platformsChanged || multiplayerChanged || completedChanged || igdbIdChanged) {
            hasNonReservedFieldChange = true;
          }

          await updateGame(nextGame);
          existingByTitle.set(normalized, nextGame);

          if (nextGame.id && igdbId) {
            coverFetchTargetsByGameId.set(nextGame.id, {
              gameId: nextGame.id,
              title: nextGame.title,
              igdbId
            });
          }

          updated += 1;
          continue;
        }

        const nextGame: Game = {
          title,
          pool,
          weight,
          platforms,
          multiplayer,
          reserved,
          completed,
          igdbId,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        hasAnyChange = true;
        hasNonReservedFieldChange = true;
        if (reserved) {
          hasReservedFieldChange = true;
        }

        const id = await addGame(nextGame);
        existingByTitle.set(normalized, { ...nextGame, id });

        if (igdbId) {
          coverFetchTargetsByGameId.set(id, {
            gameId: id,
            title: nextGame.title,
            igdbId
          });
        }

        created += 1;
      }

      if (selectedReservedTitle) {
        for (const game of existingByTitle.values()) {
          const normalized = normalizeTitle(game.title);

          if (!game.id || normalized === selectedReservedTitle || !game.reserved) {
            continue;
          }

          const nextGame: Game = {
            ...game,
            reserved: false,
            updatedAt: Date.now()
          };

          hasAnyChange = true;
          hasReservedFieldChange = true;

          await updateGame(nextGame);
          existingByTitle.set(normalized, nextGame);
          updated += 1;
        }
      }

      const isReserveOnlyImportChange = hasAnyChange && hasReservedFieldChange && !hasNonReservedFieldChange;
      let coverFetchAttempted = 0;
      let coverFetchSucceeded = 0;
      let coverFetchFailed = 0;

      for (const target of coverFetchTargetsByGameId.values()) {
        coverFetchAttempted += 1;

        try {
          const matched = await fetchImportedCoverFromIgdb(target);

          if (matched) {
            coverFetchSucceeded += 1;
          } else {
            coverFetchFailed += 1;
          }
        } catch {
          coverFetchFailed += 1;
        }
      }

      const coverSummary = coverFetchAttempted > 0
        ? ` Cover fetch: ${coverFetchSucceeded} matched, ${coverFetchFailed} failed.`
        : "";

      if (isReserveOnlyImportChange && !isDeveloperModeEnabled()) {
        setDeveloperModeEnabled(true);
        setIsDeveloperMode(true);
        setMessage(`Hello, prospective cheater! Nice try with the reserved game. Developer mode unlocked.${coverSummary}`);
      } else if (isReserveOnlyImportChange) {
        setMessage(`Imported library CSV: ${created} added, ${updated} updated. Reserve-only CSV edits detected.${coverSummary}`);
      } else {
        setMessage(`Imported library CSV: ${created} added, ${updated} updated.${coverSummary}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import the game library CSV.");
    } finally {
      event.target.value = "";
      setIsImportingLibrary(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="hidden rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)] lg:block">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-accent">Settings</h1>
            <p className="mt-2 hidden text-sm text-slate-300 lg:block">Manage local app state and handle accessibility.</p>
          </div>
          <Link to="/next-up/board" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-white/10">
            Back to board
          </Link>
        </div>
      </div>

      <div className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">Current balance</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-accent">♦{balance}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {isDeveloperMode ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleGrantPoints()}
                  disabled={isGrantingPoints}
                  className="rounded-full border border-accent/30 bg-accent/10 px-5 py-3 text-sm font-semibold text-accent transition hover:border-accent/50 hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGrantingPoints ? "Adding..." : "Add ♦100"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleJumpToNextDay()}
                  disabled={isJumpingDay}
                  className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-5 py-3 text-sm font-semibold text-indigo-300 transition hover:border-indigo-400/50 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isJumpingDay ? "Jumping..." : "Jump to next day"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleReset()}
                  disabled={isResetting}
                  className="rounded-full border border-rose-400/30 bg-rose-500/10 px-5 py-3 text-sm font-semibold text-rose-300 transition hover:border-rose-400/50 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isResetting ? "Resetting..." : "Reset local state"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-accent">Accessibility</h2>
            <p className="mt-2 text-sm text-slate-300">Enable high-contrast rendering for stronger visual separation.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isHighContrastMode}
            onClick={() => setIsHighContrastMode((current) => !current)}
            className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-accent/40 hover:bg-white/10"
          >
            <span>{isHighContrastMode ? "High contrast on" : "High contrast off"}</span>
            <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${isHighContrastMode ? "bg-accent" : "bg-white/15"}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-slate-950 transition ${isHighContrastMode ? "translate-x-6" : "translate-x-1"}`} />
            </span>
          </button>
        </div>
      </div>

      <div className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-accent">Game mode</h2>
            <p className="mt-2 text-sm text-slate-300">
              Game mode can be changed freely with a one-week cooldown.
            </p>
            {!canChangeMode && nextModeChangeAt ? (
              <p className="mt-2 text-sm text-amber-200">Mode can be changed at {new Date(nextModeChangeAt).toLocaleString()}.</p>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => void handleChangeMode("standard")}
              disabled={isChangingMode || gameMode === "standard" || !canChangeMode}
              className={`rounded-2xl border px-4 py-4 text-left transition ${gameMode === "standard" ? "border-accent/40 bg-accent/10 text-white" : "border-white/10 bg-white/5 text-slate-200 hover:border-accent/30 hover:bg-white/10"} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <p className="text-base font-semibold">Exploration</p>
              <p className="mt-2 text-sm text-slate-300">{(gameMode === "standard" ? "Current ruleset with normal add-game cost and all eligible pool games available for rolls." : "All games in Daily and Weekly pools can be rolled. Adding games costs ♦500, but finishing them does not award points.")}</p>
            </button>

            <button
              type="button"
              onClick={() => void handleChangeMode("completion")}
              disabled={isChangingMode || gameMode === "completion" || !canChangeMode}
              className={`rounded-2xl border px-4 py-4 text-left transition ${gameMode === "completion" ? "border-accent/40 bg-accent/10 text-white" : "border-white/10 bg-white/5 text-slate-200 hover:border-accent/30 hover:bg-white/10"} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <p className="text-base font-semibold">Completion</p>
              <p className="mt-2 text-sm text-slate-300">{(gameMode === "standard" ? "Only incomplete daily and weekly games can roll. Adding games costs ♦1000, but finishing them awards ♦150." : "Current ruleset with higher add-game cost and game completion awards; only incomplete games are available for rolls.")}</p>
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-accent">Library CSV</h2>
            <p className="mt-2 text-sm text-slate-300">
              Export your current library to CSV or import a CSV to add/update games by title.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleExportLibrary()}
              disabled={isExportingLibrary}
              className="rounded-full border border-sky-400/30 bg-sky-500/10 px-5 py-3 text-sm font-semibold text-sky-300 transition hover:border-sky-400/50 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExportingLibrary ? "Exporting..." : "Export CSV"}
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImportingLibrary}
              className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-300 transition hover:border-emerald-400/50 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isImportingLibrary ? "Importing..." : "Import CSV"}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void handleImportLibrary(event)}
            className="hidden"
          />
        </div>
      </div>

      <div className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-accent">Full data export</h2>
            <p className="mt-2 text-sm text-slate-300">
              Export all persisted data in one JSON file, including library, event log, current board, points ledger, and metadata, or restore the same format onto this device.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleExportAllData()}
              disabled={isExportingAllData}
              className="rounded-full border border-violet-400/30 bg-violet-500/10 px-5 py-3 text-sm font-semibold text-violet-300 transition hover:border-violet-400/50 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExportingAllData ? "Exporting..." : "Export full data (JSON)"}
            </button>

            <button
              type="button"
              onClick={() => fullDataInputRef.current?.click()}
              disabled={isImportingAllData}
              className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-300 transition hover:border-emerald-400/50 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isImportingAllData ? "Restoring..." : "Restore full data (JSON)"}
            </button>
          </div>

          <input
            ref={fullDataInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(event) => void handleImportAllData(event)}
            className="hidden"
          />
        </div>
      </div>

      <TransientToast message={message} onClose={() => setMessage(null)} />

      {reserveConflictChoices.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/20 bg-slate-900/95 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
            <h2 className="text-xl font-semibold tracking-tight text-accent">Choose reserve game</h2>
            <p className="mt-2 text-sm text-slate-300">
              Your CSV marks multiple games as reserved. Select one game to keep in reserve.
            </p>

            <fieldset className="mt-5 space-y-2">
              {reserveConflictChoices.map((choice) => (
                <label key={choice.normalizedTitle} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100">
                  <input
                    type="radio"
                    name="reserve-conflict"
                    value={choice.normalizedTitle}
                    checked={reserveConflictSelection === choice.normalizedTitle}
                    onChange={(event) => setReserveConflictSelection(event.target.value)}
                    className="h-4 w-4 border-white/30 bg-slate-900 text-accent"
                  />
                  <span>{choice.title}</span>
                </label>
              ))}
            </fieldset>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={handleReserveConflictCancel}
                className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/35 hover:bg-white/10"
              >
                Cancel import
              </button>
              <button
                type="button"
                onClick={handleReserveConflictConfirm}
                disabled={!reserveConflictSelection}
                className="rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent/50 hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Keep selected reserve
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

