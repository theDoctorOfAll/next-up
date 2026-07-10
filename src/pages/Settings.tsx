import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { clearEventHistory, addPoints } from "../database/services";
import { getPointBalance } from "../database/repositories/pointRepository";
import { addGame, getAllGames, updateGame } from "../database/repositories/gameRepository";
import type { Game, GamePool } from "../database/db";
import { advanceClockByDays, getClockOffsetMs } from "../core/clock";
import TransientToast from "../components/TransientToast";

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLocaleLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
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

  if (pool !== "daily" && pool !== "weekly") {
    throw new Error(`Invalid pool \"${value}\". Expected daily or weekly.`);
  }

  return pool;
}

export default function Settings() {
  const [balance, setBalance] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isGrantingPoints, setIsGrantingPoints] = useState(false);
  const [isJumpingDay, setIsJumpingDay] = useState(false);
  const [isExportingLibrary, setIsExportingLibrary] = useState(false);
  const [isImportingLibrary, setIsImportingLibrary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function refreshSettings() {
    setBalance(await getPointBalance());
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

  async function handleGrantPoints() {
    setIsGrantingPoints(true);
    setMessage(null);

    try {
      await addPoints(100, "developer points");
      await refreshSettings();
      setMessage("Added 100 developer points.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add developer points.");
    } finally {
      setIsGrantingPoints(false);
    }
  }

  async function handleReset() {
    if (!window.confirm("Reset game history, board state, and points? This cannot be undone.")) {
      return;
    }

    setIsResetting(true);
    setMessage(null);

    try {
      await clearEventHistory();
      await refreshSettings();
      setMessage("Board and economy state reset.");
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

  async function handleExportLibrary() {
    setIsExportingLibrary(true);
    setMessage(null);

    try {
      const games = await getAllGames();
      const lines = ["title,pool,weight,platforms,reserved"];

      for (const game of games) {
        lines.push(
          [
            toCsvCell(game.title),
            toCsvCell(game.pool),
            toCsvCell(String(game.weight ?? 0)),
            toCsvCell((game.platforms ?? []).join(";")),
            toCsvCell(String(Boolean(game.reserved)))
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
      const requiredColumns = ["title", "pool", "weight", "platforms", "reserved"];

      if (!requiredColumns.every((column) => header.includes(column))) {
        throw new Error("CSV header must include: title,pool,weight,platforms,reserved");
      }

      const indexes = {
        title: header.indexOf("title"),
        pool: header.indexOf("pool"),
        weight: header.indexOf("weight"),
        platforms: header.indexOf("platforms"),
        reserved: header.indexOf("reserved")
      };

      const existingGames = await getAllGames();
      const existingByTitle = new Map(existingGames.map((game) => [normalizeTitle(game.title), game]));
      let created = 0;
      let updated = 0;

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
        const reserved = parseBoolean(row[indexes.reserved] ?? "false");
        const normalized = normalizeTitle(title);
        const existing = existingByTitle.get(normalized);

        if (existing?.id) {
          const nextGame: Game = {
            ...existing,
            title,
            pool,
            weight,
            platforms,
            reserved,
            updatedAt: Date.now()
          };

          await updateGame(nextGame);
          existingByTitle.set(normalized, nextGame);
          updated += 1;
          continue;
        }

        const nextGame: Game = {
          title,
          pool,
          weight,
          platforms,
          reserved,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        const id = await addGame(nextGame);
        existingByTitle.set(normalized, { ...nextGame, id });
        created += 1;
      }

      setMessage(`Imported library CSV: ${created} added, ${updated} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import the game library CSV.");
    } finally {
      event.target.value = "";
      setIsImportingLibrary(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-accent">Settings</h1>
            <p className="mt-2 text-sm text-slate-300">Manage local app state and reset the current board economy safely.</p>
          </div>
          <Link to="/" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-white/10">
            Back to board
          </Link>
        </div>
      </div>

      <div className="rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">Current balance</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-accent">{balance}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleGrantPoints()}
              disabled={isGrantingPoints}
              className="rounded-full border border-accent/30 bg-accent/10 px-5 py-3 text-sm font-semibold text-accent transition hover:border-accent/50 hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGrantingPoints ? "Adding..." : "Add 100 points"}
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
          </div>
        </div>
      </div>

      <div className="rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)]">
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

      <TransientToast message={message} onClose={() => setMessage(null)} />
    </div>
  );
}
