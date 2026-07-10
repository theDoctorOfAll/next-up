import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStatsSummary, type StatsSummary } from "../domain/queries/getStatsSummary";

export default function Stats() {
  const [stats, setStats] = useState<StatsSummary | null>(null);

  useEffect(() => {
    void getStatsSummary().then(setStats);
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-accent">Statistics</h1>
            <p className="mt-2 text-sm text-slate-300">A snapshot of your current library, event history, and economy activity.</p>
          </div>
          <Link to="/" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-white/10">
            Back to board
          </Link>
        </div>
      </div>

      {stats ? (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)]">
            <h2 className="text-xl font-semibold">Library</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Total games</span>
                <span className="font-semibold text-accent">{stats.totalGames}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Total events</span>
                <span className="font-semibold text-accent">{stats.totalEvents}</span>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)]">
            <h2 className="text-xl font-semibold">Economy</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Current balance</span>
                <span className="font-semibold text-accent">♦{stats.totalPoints}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Daily rolls</span>
                <span className="font-semibold text-accent">{stats.dailyRolls}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Weekly rolls</span>
                <span className="font-semibold text-accent">{stats.weeklyRolls}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Daily plays</span>
                <span className="font-semibold text-accent">{stats.dailyPlays}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Weekly plays</span>
                <span className="font-semibold text-accent">{stats.weeklyPlays}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
