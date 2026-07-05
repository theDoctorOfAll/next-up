import { Routes, Route, Link } from "react-router-dom";
import Board from "./pages/Board";
import { useAppInitialization } from "./hooks/useAppInitialization";

function Placeholder({ title }: { title: string }) {
  return (
    <div className="bg-panel p-6 rounded-xl">
      <h2 className="text-xl font-bold text-accent">{title}</h2>
      <p className="opacity-60 mt-2">Coming in Milestone 2+</p>
    </div>
  );
}

export default function App() {
  const { initialized, error } = useAppInitialization();

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
    <div className="min-h-screen flex bg-bg text-white">
      <aside className="w-56 bg-panel p-4 space-y-4">
        <h1 className="text-xl font-bold text-accent">Next Up</h1>

        <nav className="space-y-2 text-sm">
          <Link to="/" className="block hover:text-accent">Board</Link>
          <Link to="/library" className="block hover:text-accent">Library</Link>
          <Link to="/events" className="block hover:text-accent">Event Log</Link>
          <Link to="/stats" className="block hover:text-accent">Statistics</Link>
          <Link to="/settings" className="block hover:text-accent">Settings</Link>
        </nav>
      </aside>

      <main className="flex-1 p-6">
        <Routes>
          <Route path="/" element={<Board />} />
          <Route path="/library" element={<Placeholder title="Library" />} />
          <Route path="/events" element={<Placeholder title="Event Log" />} />
          <Route path="/stats" element={<Placeholder title="Statistics" />} />
          <Route path="/settings" element={<Placeholder title="Settings" />} />
        </Routes>
      </main>
    </div>
  );
}
