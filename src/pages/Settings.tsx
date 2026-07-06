import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { clearEventHistory, addPoints } from "../database/services";
import { getPointBalance } from "../database/repositories/pointRepository";

export default function Settings() {
  const [balance, setBalance] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isGrantingPoints, setIsGrantingPoints] = useState(false);

  async function refreshSettings() {
    setBalance(await getPointBalance());
  }

  useEffect(() => {
    void refreshSettings();
  }, []);

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

      {message ? (
        <div className="rounded-[28px] border border-accent/20 bg-white/5 p-4 text-sm text-accent">
          {message}
        </div>
      ) : null}

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
              onClick={() => void handleReset()}
              disabled={isResetting}
              className="rounded-full border border-rose-400/30 bg-rose-500/10 px-5 py-3 text-sm font-semibold text-rose-300 transition hover:border-rose-400/50 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResetting ? "Resetting..." : "Reset local state"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
