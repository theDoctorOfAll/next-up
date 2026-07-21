import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { ArrowLeft, BookOpen, Menu, Play, Plus } from "lucide-react";
import Board from "./pages/Board";
import Library from "./pages/Library";
import Events from "./pages/Events";
import Stats from "./pages/Stats";
import Settings from "./pages/Settings";
import Debug from "./pages/Debug";
import { useAppInitialization } from "./hooks/useAppInitialization";
import { isDeveloperModeEnabled } from "./core/runtimePreferences";

function isMobileAspectRatio() {
  if (typeof window === "undefined") {
    return false;
  }

  const aspectRatio = window.innerWidth / Math.max(window.innerHeight, 1);
  return aspectRatio < 0.9 || window.innerWidth < 900;
}

interface MobileHeaderItem {
  id: string;
  label: string;
  value: string;
}

interface MobileHeaderAction {
  id: string;
  label: string;
  type: "link" | "event";
  to?: string;
  eventName?: string;
  icon?: "plus" | "back" | "play" | "library";
}

interface MobileHeaderPayload {
  items?: MobileHeaderItem[];
  actions?: MobileHeaderAction[];
}

function getMobileHeaderIcon(icon?: MobileHeaderAction["icon"]) {
  if (icon === "plus") {
    return <Plus size={14} />;
  }

  if (icon === "back") {
    return <ArrowLeft size={14} />;
  }

  if (icon === "play") {
    return <Play size={14} />;
  }

  if (icon === "library") {
    return <BookOpen size={14} />;
  }

  return null;
}

function getMobilePageTitle(pathname: string) {
  if (pathname === "/next-up/board" || pathname === "/board" || pathname === "/" || pathname === "/next-up") {
    return "Next Up";
  }

  if (pathname.includes("/library")) {
    return "Library";
  }

  if (pathname.includes("/events")) {
    return "Event Log";
  }

  if (pathname.includes("/stats")) {
    return "Statistics";
  }

  if (pathname.includes("/settings")) {
    return "Settings";
  }

  if (pathname.includes("/debug")) {
    return "Debug";
  }

  return "Next Up";
}

export default function App() {
  const { initialized, error } = useAppInitialization();
  const location = useLocation();
  const [mobileAspectMode, setMobileAspectMode] = useState(() => isMobileAspectRatio());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mobileHeaderItems, setMobileHeaderItems] = useState<MobileHeaderItem[]>([]);
  const [mobileHeaderActions, setMobileHeaderActions] = useState<MobileHeaderAction[]>([]);
  const isDeveloperMode = isDeveloperModeEnabled();

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

  const navLinks = useMemo(() => {
    const links = [
      { to: "/next-up/board", label: "Board" },
      { to: "/next-up/library", label: "Library" },
      { to: "/next-up/events", label: "Event Log" },
      { to: "/next-up/stats", label: "Statistics" },
      { to: "/next-up/settings", label: "Settings" }
    ];

    if (isDeveloperMode) {
      links.push({ to: "/next-up/debug", label: "Debug" });
    }

    return links;
  }, [isDeveloperMode]);

  useEffect(() => {
    setMobileHeaderItems([]);
    setMobileHeaderActions([]);
  }, [location.pathname]);

  useEffect(() => {
    function handleHeaderItems(event: Event) {
      const customEvent = event as CustomEvent<MobileHeaderPayload | MobileHeaderItem[] | undefined>;
      const detail = customEvent.detail;

      const payload = Array.isArray(detail)
        ? { items: detail }
        : detail ?? {};

      const items = Array.isArray(payload.items) ? payload.items : [];
      const actions = Array.isArray(payload.actions) ? payload.actions : [];

      setMobileHeaderItems(items);
      setMobileHeaderActions(actions.slice(0, 2));
    }

    window.addEventListener("nextup:mobile-header-items", handleHeaderItems as EventListener);

    return () => {
      window.removeEventListener("nextup:mobile-header-items", handleHeaderItems as EventListener);
    };
  }, []);

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
              <Route path="/" element={<Navigate to="/next-up/board" replace />} />
              <Route path="/board" element={<Navigate to="/next-up/board" replace />} />
              <Route path="/library" element={<Navigate to="/next-up/library" replace />} />
              <Route path="/events" element={<Navigate to="/next-up/events" replace />} />
              <Route path="/stats" element={<Navigate to="/next-up/stats" replace />} />
              <Route path="/settings" element={<Navigate to="/next-up/settings" replace />} />
              <Route path="/debug" element={<Navigate to="/next-up/debug" replace />} />
              <Route path="/next-up" element={<Navigate to="/next-up/board" replace />} />
              <Route path="/next-up/board" element={<Board />} />
              <Route path="/next-up/library" element={<Library />} />
              <Route path="/next-up/events" element={<Events />} />
              <Route path="/next-up/stats" element={<Stats />} />
              <Route path="/next-up/settings" element={<Settings />} />
              <Route path="/next-up/debug" element={isDeveloperMode ? <Debug /> : <Navigate to="/next-up/board" replace />} />
            </Routes>
          </main>
        </div>
      ) : (
        <div className="relative min-h-screen">
          <header className="fixed inset-x-0 top-0 z-[11030] border-b border-white/10 bg-panel/95 px-4 py-3 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
              <button
                type="button"
                aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
                onClick={() => setIsSidebarOpen((current) => !current)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-accent shadow-[0_20px_50px_-35px_rgba(0,0,0,0.85)]"
              >
                <Menu size={18} strokeWidth={2.4} />
              </button>

              <h1 className="pointer-events-none absolute left-1/2 max-w-[56vw] -translate-x-1/2 truncate text-center text-xl font-bold tracking-[0.08em] text-accent">
                {getMobilePageTitle(location.pathname)}
              </h1>

              <div className="flex items-center gap-1.5">
                {mobileHeaderActions.map((action) => {
                  const icon = getMobileHeaderIcon(action.icon);

                  if (action.type === "link" && action.to) {
                    return (
                      <Link
                        key={action.id}
                        to={action.to}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-2.5 text-xs font-semibold text-slate-100"
                      >
                        {icon}
                        <span>{action.label}</span>
                      </Link>
                    );
                  }

                  if (action.type === "event" && action.eventName) {
                    const eventName = action.eventName;

                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent(eventName))}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-2.5 text-xs font-semibold text-slate-100"
                      >
                        {icon}
                        <span>{action.label}</span>
                      </button>
                    );
                  }

                  return null;
                })}

                {mobileHeaderItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-accent/25 bg-accent/10 px-2.5 py-1.5 text-right"
                    aria-label={item.label}
                  >
                    <p className="text-[10px] uppercase tracking-wide text-slate-300">{item.label}</p>
                    <p className="text-sm font-semibold text-accent">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </header>

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

          <main className="p-5 pt-20 sm:p-8 sm:pt-24">
            <Routes>
              <Route path="/" element={<Navigate to="/next-up/board" replace />} />
              <Route path="/board" element={<Navigate to="/next-up/board" replace />} />
              <Route path="/library" element={<Navigate to="/next-up/library" replace />} />
              <Route path="/events" element={<Navigate to="/next-up/events" replace />} />
              <Route path="/stats" element={<Navigate to="/next-up/stats" replace />} />
              <Route path="/settings" element={<Navigate to="/next-up/settings" replace />} />
              <Route path="/debug" element={<Navigate to="/next-up/debug" replace />} />
              <Route path="/next-up" element={<Navigate to="/next-up/board" replace />} />
              <Route path="/next-up/board" element={<Board />} />
              <Route path="/next-up/library" element={<Library />} />
              <Route path="/next-up/events" element={<Events />} />
              <Route path="/next-up/stats" element={<Stats />} />
              <Route path="/next-up/settings" element={<Settings />} />
              <Route path="/next-up/debug" element={isDeveloperMode ? <Debug /> : <Navigate to="/next-up/board" replace />} />
            </Routes>
          </main>
        </div>
      )}
    </div>
  );
}
