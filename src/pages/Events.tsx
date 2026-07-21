import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getEventLog } from "../domain/queries/getEventLog";
import type { Event } from "../database/db";

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export default function Events() {
  const [events, setEvents] = useState<Event[]>([]);

  async function refreshEvents() {
    setEvents(await getEventLog());
  }

  useEffect(() => {
    void refreshEvents();
  }, []);

  useEffect(() => {
    const detail = {
      actions: [
        {
          id: "events-back-board",
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="hidden rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)] lg:block">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-accent">Event Log</h1>
            <p className="mt-2 hidden text-sm text-slate-300 lg:block">Recent activity from the board and economy system.</p>
          </div>
          <Link to="/next-up/board" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-white/10">
            Back to board
          </Link>
        </div>
      </div>

      <div className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">No events yet.</p>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{event.type}</p>
                    <p className="mt-1 text-sm text-slate-400">{formatTime(event.timestamp)}</p>
                  </div>
                  <span className="rounded-full border border-accent/20 px-3 py-1 text-xs uppercase tracking-wide text-accent">
                    {event.payload?.pool ?? "system"}
                  </span>
                </div>
                <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-900/80 p-3 text-xs text-slate-300">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

