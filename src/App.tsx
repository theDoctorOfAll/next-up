import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import Board from "./pages/Board";
import Library from "./pages/Library";
import Events from "./pages/Events";
import Stats from "./pages/Stats";
import Settings from "./pages/Settings";
import { useAppInitialization } from "./hooks/useAppInitialization";

function Placeholder({ title }: { title: string }) {
  return (
    <div className="bg-panel p-6 rounded-xl">
      <h2 className="text-xl font-bold text-accent">{title}</h2>
      <p className="opacity-60 mt-2">Coming soon</p>
    </div>
  );
}

function isMobileAspectRatio() {
  if (typeof window === "undefined") {
    return false;
  }

  const aspectRatio = window.innerWidth / Math.max(window.innerHeight, 1);
  return aspectRatio < 0.9 || window.innerWidth < 900;
}

export default function App() {
  const { initialized, error } = useAppInitialization();
  const [mobileAspectMode, setMobileAspectMode] = useState(() => isMobileAspectRatio());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    function handleViewportChange() {
      const nextMobileAspectMode = isMobileAspectRatio();

      setMobileAspectMode(nextMobileAspectMode);

      if (!nextMobileAspectMode) {
        setIsSidebarOpen(false);
      }
    }

    handleViewportChange();
    window.addEventListener("resize", handleViewportChange);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
    };
  }, []);

  const navLinks = useMemo(
    () => [
      { to: "/", label: "Board" },
      { to: "/library", label: "Library" },
      { to: "/events", label: "Event Log" },
      { to: "/stats", label: "Statistics" },
      { to: "/settings", label: "Settings" }
    ],
    []
  );

  if (error) {
    return (
      <div className="min-h-screen bg-bg text-white p-6">
        <div className="bg-panel p-6 rounded-xl">
          <h1 className="text-xl font-bold text-accent">Next Up</h1>
          <p className="mt-2 opacity-80">Game library initialization failed.</p>
        </div>
      </div>
    );
  }

  if (!initialized) {
    return (
      <div className="min-h-screen bg-bg text-white p-6">
        <div className="bg-panel p-6 rounded-xl">
          <h1 className="text-xl font-bold text-accent">Next Up</h1>
          <p className="mt-2 opacity-80">Preparing your game library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-white">
      {!mobileAspectMode ? (
        <div className="flex min-h-screen">
          <aside className="w-56 min-h-screen shrink-0 border-r border-white/10 bg-panel/95 p-6 text-sm shadow-[0_40px_120px_-80px_rgba(0,0,0,0.55)]">
            <h1 className="text-xl font-semibold text-accent">Next Up</h1>

            <nav className="mt-6 space-y-3">
              {navLinks.map((link) => (
                <Link key={link.to} to={link.to} className="block hover:text-accent">
                  {link.label}
                </Link>
              ))}
            </nav>
          </aside>

          <main className="flex-1 p-8 sm:p-10">
            <Routes>
              <Route path="/" element={<Board />} />
              <Route path="/next-up" element={<Navigate to="/" replace />} />
              <Route path="/library" element={<Library />} />
              <Route path="/events" element={<Events />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      ) : (
        <div className="relative min-h-screen">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="fixed left-4 top-4 z-[11010] rounded-full border border-white/15 bg-panel/95 px-4 py-2 text-sm font-semibold text-accent shadow-[0_20px_70px_-35px_rgba(0,0,0,0.9)]"
          >
            Menu
          </button>

          {isSidebarOpen ? (
            <button
              type="button"
              aria-label="Close sidebar"
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 z-[11000] bg-slate-950/70 backdrop-blur-sm"
            />
          ) : null}

          <aside
            className={`fixed inset-y-0 left-0 z-[11020] w-72 border-r border-white/10 bg-panel/95 p-6 text-sm shadow-[0_40px_120px_-60px_rgba(0,0,0,0.75)] transition-transform duration-300 ${
              isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold text-accent">Next Up</h1>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Close
              </button>
            </div>

            <nav className="mt-6 space-y-3">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="block hover:text-accent"
                  onClick={() => setIsSidebarOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </aside>

          <main className="p-5 pt-16 sm:p-8 sm:pt-24">
            <Routes>
              <Route path="/" element={<Board />} />
              <Route path="/next-up" element={<Navigate to="/" replace />} />
              <Route path="/library" element={<Library />} />
              <Route path="/events" element={<Events />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      )}
    </div>
  );
}
