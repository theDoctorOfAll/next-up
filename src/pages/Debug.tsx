import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Game } from "../database/db";
import { getAllGames } from "../database/repositories/gameRepository";
import { getCachedGameCover, storeGameCoverCache, type GameCoverCacheValue } from "../database/repositories/gameCoverRepository";
import { describeConfidence, getIgdbWorkerUrl, searchIgdbByTitle, type IgdbSearchCandidate } from "../services/igdbClient";

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString();
}

function getConfidenceClasses(confidence: number) {
  const summary = describeConfidence(confidence);

  if (summary.band === "high") {
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-300";
  }

  if (summary.band === "medium") {
    return "border-amber-400/40 bg-amber-500/10 text-amber-200";
  }

  return "border-rose-400/40 bg-rose-500/10 text-rose-200";
}

export default function Debug() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<IgdbSearchCandidate | null>(null);
  const [alternatives, setAlternatives] = useState<IgdbSearchCandidate[]>([]);
  const [cachedCover, setCachedCover] = useState<GameCoverCacheValue | null>(null);
  const [isCachedCoverStale, setIsCachedCoverStale] = useState(false);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedGame = useMemo(
    () => games.find((game) => game.id?.toString() === selectedGameId) ?? null,
    [games, selectedGameId]
  );

  async function refreshGames() {
    setIsLoadingGames(true);

    try {
      const allGames = await getAllGames();
      const sortedGames = [...allGames].sort((left, right) => left.title.localeCompare(right.title));
      setGames(sortedGames);

      if (sortedGames.length === 0) {
        setSelectedGameId("");
        setSearchQuery("");
        return;
      }

      setSelectedGameId((current) => {
        if (current && sortedGames.some((game) => game.id?.toString() === current)) {
          return current;
        }

        return sortedGames[0].id?.toString() ?? "";
      });
    } finally {
      setIsLoadingGames(false);
    }
  }

  async function refreshCachedCover(gameId: number | undefined) {
    if (!gameId) {
      setCachedCover(null);
      setIsCachedCoverStale(false);
      return;
    }

    const cache = await getCachedGameCover(gameId);
    setCachedCover(cache.cover);
    setIsCachedCoverStale(cache.stale);
  }

  useEffect(() => {
    void refreshGames();
  }, []);

  useEffect(() => {
    setSelectedCandidate(null);
    setAlternatives([]);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!selectedGame) {
      setSearchQuery("");
      setCachedCover(null);
      setIsCachedCoverStale(false);
      return;
    }

    setSearchQuery(selectedGame.title);
    void refreshCachedCover(selectedGame.id);
  }, [selectedGame]);

  useEffect(() => {
    const detail = {
      actions: [
        {
          id: "debug-back-board",
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

  async function handleSearch() {
    if (!selectedGame) {
      setErrorMessage("Choose a game from the dropdown first.");
      return;
    }

    setIsSearching(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await searchIgdbByTitle(searchQuery, { limit: 12 });
      setSelectedCandidate(response.selected);
      setAlternatives(response.alternatives);

      if (!response.selected) {
        setSuccessMessage(`No IGDB match found for \"${searchQuery}\".`);
      } else {
        setSuccessMessage(`Found ${response.rawCount} IGDB result${response.rawCount === 1 ? "" : "s"}.`);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "IGDB search failed.");
      setSelectedCandidate(null);
      setAlternatives([]);
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSaveSelectedCover() {
    if (!selectedGame?.id || !selectedCandidate) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await storeGameCoverCache(selectedGame.id, {
        igdbId: selectedCandidate.id,
        imageUrl: selectedCandidate.imageUrl,
        imageId: selectedCandidate.imageId,
        confidence: selectedCandidate.confidence,
        searchQuery: searchQuery.trim()
      });

      await refreshCachedCover(selectedGame.id);
      setSuccessMessage(`Saved IGDB cover mapping for \"${selectedGame.title}\".`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save cover mapping.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="hidden rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)] lg:block">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-accent">Debug</h1>
            <p className="mt-2 hidden text-sm text-slate-300 lg:block">
              Developer-only diagnostics and IGDB cover matching workflow.
            </p>
          </div>
          <Link to="/next-up/board" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-white/10">
            Back to board
          </Link>
        </div>
      </div>

      <div className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-accent">IGDB cover lookup</h2>
            <p className="mt-2 text-sm text-slate-300">
              Worker endpoint: <span className="font-mono text-slate-200">{getIgdbWorkerUrl()}</span>
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <select
              value={selectedGameId}
              onChange={(event) => setSelectedGameId(event.target.value)}
              disabled={isLoadingGames || games.length === 0}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {games.length === 0 ? <option value="">No games in library</option> : null}
              {games.map((game) => (
                <option key={game.id ?? game.title} value={game.id?.toString() ?? ""}>
                  {game.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void refreshGames()}
              disabled={isLoadingGames}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-accent/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingGames ? "Refreshing..." : "Refresh games"}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search title"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
            />
            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={isSearching || !selectedGame || !searchQuery.trim()}
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSearching ? "Searching..." : "Search IGDB"}
            </button>
          </div>

          {errorMessage ? (
            <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</p>
          ) : null}

          {successMessage ? (
            <p className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{successMessage}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
          <h3 className="text-lg font-semibold text-accent">Selected candidate</h3>

          {!selectedCandidate ? (
            <p className="mt-4 text-sm text-slate-400">Run a search to preview the top IGDB match.</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-start gap-4">
                <div className="h-40 w-28 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                  {selectedCandidate.imageUrl ? (
                    <img src={selectedCandidate.imageUrl} alt={selectedCandidate.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center px-3 text-center text-xs text-slate-500">No cover</div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-base font-semibold text-white">{selectedCandidate.name}</p>
                  <p className="text-sm text-slate-300">IGDB ID: {selectedCandidate.id}</p>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getConfidenceClasses(selectedCandidate.confidence)}`}>
                    {describeConfidence(selectedCandidate.confidence).label} ({describeConfidence(selectedCandidate.confidence).value}%)
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleSaveSelectedCover()}
                disabled={isSaving || !selectedGame}
                className="rounded-full border border-sky-400/30 bg-sky-500/10 px-5 py-3 text-sm font-semibold text-sky-300 transition hover:border-sky-400/50 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Saving..." : `Save cover for ${selectedGame?.title ?? "selected game"}`}
              </button>
            </div>
          )}

          {alternatives.length > 0 ? (
            <div className="mt-6 space-y-2 border-t border-white/10 pt-4">
              <p className="text-sm font-semibold text-slate-300">Alternatives</p>
              <div className="space-y-2">
                {alternatives.slice(0, 5).map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setSelectedCandidate(candidate)}
                    className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm transition hover:border-accent/40 hover:bg-white/10"
                  >
                    <span className="text-slate-200">{candidate.name}</span>
                    <span className="text-slate-400">{describeConfidence(candidate.confidence).value}%</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
          <h3 className="text-lg font-semibold text-accent">Cached cover state</h3>

          {!selectedGame ? (
            <p className="mt-4 text-sm text-slate-400">Select a game to inspect cache state.</p>
          ) : !cachedCover ? (
            <p className="mt-4 text-sm text-slate-400">No cached cover mapping for this game yet.</p>
          ) : (
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-white">{selectedGame.title}</span>
                {isCachedCoverStale ? (
                  <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200">Stale</span>
                ) : (
                  <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">Fresh</span>
                )}
              </div>

              <p>IGDB ID: {cachedCover.igdbId}</p>
              <p>Confidence: {Math.round(cachedCover.confidence)}%</p>
              <p>Fetched: {formatTimestamp(cachedCover.fetchedAt)}</p>
              <p>Query: {cachedCover.searchQuery}</p>

              <div className="h-44 w-32 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                {cachedCover.imageUrl ? (
                  <img src={cachedCover.imageUrl} alt={selectedGame.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center px-3 text-center text-xs text-slate-500">No cached image URL</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
