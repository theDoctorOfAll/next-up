import { Link } from "react-router-dom";

export default function Debug() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-accent">Debug</h1>
            <p className="mt-2 text-sm text-slate-300">
              Developer-only runtime tools and diagnostics.
            </p>
          </div>
          <Link to="/next-up/board" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-white/10">
            Back to board
          </Link>
        </div>
      </div>

      <div className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
        <p className="text-sm text-slate-300">
          Debug mode is active. Use this screen for developer-only actions and verification workflows.
        </p>
      </div>
    </div>
  );
}
