import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getCurrentGameMode, type GameMode } from "../database/repositories/gameModeRepository";
import { getAllGames } from "../database/repositories/gameRepository";
import { getCachedGameCover, storeGameCoverCache, type GameCoverCacheValue } from "../database/repositories/gameCoverRepository";
import { addGameToLibrary, adjustGameWeightInLibrary, parsePlatformsInput, deleteGameFromLibrary, getWeightValueFromSteps, updateGameInLibrary } from "../domain/services/GameLibraryService";
import { getLibraryRuleCosts } from "../domain/rules/rulesEngine";
import { setReserveGame } from "../domain/services/BoardService";
import type { Game, GamePool } from "../database/db";
import { describeConfidence, searchIgdbByTitle, type IgdbSearchCandidate } from "../services/igdbClient";
import TransientToast from "../components/TransientToast";

const poolLabels: Record<GamePool, string> = {
  daily: "Daily pool",
  weekly: "Weekly pool",
  none: "No pool",
};

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

export default function Library() {
  const [games, setGames] = useState<Game[]>([]);
  const [libraryCoverByGameId, setLibraryCoverByGameId] = useState<Record<number, GameCoverCacheValue | null>>({});
  const [staleLibraryCoverByGameId, setStaleLibraryCoverByGameId] = useState<Record<number, boolean>>({});
  const [expandedGameId, setExpandedGameId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pool, setPool] = useState<GamePool>("daily");
  const [platformsInput, setPlatformsInput] = useState("");
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [moveNewGameToReserve, setMoveNewGameToReserve] = useState(true);
  const [editTitle, setEditTitle] = useState("");
  const [editPool, setEditPool] = useState<GamePool>("daily");
  const [editPlatforms, setEditPlatforms] = useState("");
  const [editMultiplayer, setEditMultiplayer] = useState(false);
  const [editCompleted, setEditCompleted] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isSavingAdd, setIsSavingAdd] = useState(false);
  const [coverDialogMode, setCoverDialogMode] = useState<"edit" | "add" | null>(null);
  const [coverSearchQuery, setCoverSearchQuery] = useState("");
  const [coverSelectedCandidate, setCoverSelectedCandidate] = useState<IgdbSearchCandidate | null>(null);
  const [coverAlternatives, setCoverAlternatives] = useState<IgdbSearchCandidate[]>([]);
  const [pendingAddCover, setPendingAddCover] = useState<{ candidate: IgdbSearchCandidate; searchQuery: string } | null>(null);
  const [cachedEditCover, setCachedEditCover] = useState<GameCoverCacheValue | null>(null);
  const [isCachedEditCoverStale, setIsCachedEditCoverStale] = useState(false);
  const [isSearchingCover, setIsSearchingCover] = useState(false);
  const [isSavingCover, setIsSavingCover] = useState(false);
  const [coverErrorMessage, setCoverErrorMessage] = useState<string | null>(null);
  const [coverSuccessMessage, setCoverSuccessMessage] = useState<string | null>(null);
  const [costs, setCosts] = useState({
    addGame: 500,
    changePool: 10,
    changeWeight: 15,
    moveToReserve: 25
  });
  const [gameMode, setGameMode] = useState<GameMode>("standard");
  const canEditCompletionInLibrary = gameMode !== "completion";

  async function refreshLibrary() {
    const allGames = await getAllGames();
    setGames(allGames);

    const coverLookup: Record<number, GameCoverCacheValue | null> = {};
    const staleLookup: Record<number, boolean> = {};

    await Promise.all(
      allGames.map(async (game) => {
        if (!game.id) {
          return;
        }

        const cache = await getCachedGameCover(game.id);
        coverLookup[game.id] = cache.cover;
        staleLookup[game.id] = cache.stale;
      })
    );

    setLibraryCoverByGameId(coverLookup);
    setStaleLibraryCoverByGameId(staleLookup);
  }

  async function refreshEditCover(gameId: number | undefined) {
    if (!gameId) {
      setCachedEditCover(null);
      setIsCachedEditCoverStale(false);
      return;
    }

    const cache = await getCachedGameCover(gameId);
    setCachedEditCover(cache.cover);
    setIsCachedEditCoverStale(cache.stale);
  }

  function resetCoverPickerState() {
    setCoverSelectedCandidate(null);
    setCoverAlternatives([]);
    setCoverErrorMessage(null);
    setCoverSuccessMessage(null);
    setIsSearchingCover(false);
    setIsSavingCover(false);
  }

  function openEditCoverDialog(game: Game) {
    setCoverDialogMode("edit");
    setCoverSearchQuery(game.title);
    resetCoverPickerState();
    void refreshEditCover(game.id);
  }

  function openAddCoverDialog() {
    setCoverDialogMode("add");
    setCoverSearchQuery(title.trim() || pendingAddCover?.searchQuery || "");
    setCoverSelectedCandidate(pendingAddCover?.candidate ?? null);
    setCoverAlternatives([]);
    setCoverErrorMessage(null);
    setCoverSuccessMessage(null);
  }

  function openAddGameDialog() {
    setMoveNewGameToReserve(true);
    setPendingAddCover(null);
    setCoverDialogMode(null);
    setIsAddDialogOpen(true);
  }

  function startEditing(game: Game) {
    setEditingGame(game);
    setEditTitle(game.title);
    setEditPool(game.pool);
    setEditPlatforms((game.platforms ?? []).join(", "));
    setEditMultiplayer(game.multiplayer);
    setEditCompleted(Boolean(game.completed));
    setCoverSearchQuery(game.title);
    setCoverDialogMode(null);
    resetCoverPickerState();
    void refreshEditCover(game.id);
    setMessage(null);
  }

  async function handleAddGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSavingAdd(true);
    const shouldMoveNewGameToReserve = moveNewGameToReserve;

    try {
      const addedGameId = await addGameToLibrary(title, pool, parsePlatformsInput(platformsInput), isMultiplayer);
      const addedTitle = title.trim();
      const selectedAddCover = pendingAddCover;

      if (shouldMoveNewGameToReserve) {
        await setReserveGame(addedGameId, { chargeCost: false });
      }

      if (selectedAddCover) {
        await storeGameCoverCache(addedGameId, {
          igdbId: selectedAddCover.candidate.id,
          imageUrl: selectedAddCover.candidate.imageUrl,
          imageId: selectedAddCover.candidate.imageId,
          confidence: selectedAddCover.candidate.confidence,
          searchQuery: selectedAddCover.searchQuery
        });
      }

      setTitle("");
      setPool("daily");
      setPlatformsInput("");
      setIsMultiplayer(false);
      setMoveNewGameToReserve(true);
      setPendingAddCover(null);
      setCoverDialogMode(null);
      setIsAddDialogOpen(false);
      await refreshLibrary();
      setMessage(
        selectedAddCover
          ? shouldMoveNewGameToReserve
            ? `Added "${addedTitle}" with selected cover and moved it into reserve at no additional cost.`
            : pool === "none"
              ? `Added "${addedTitle}" with selected cover outside the active pools.`
              : `Added "${addedTitle}" with selected cover to the ${pool} pool.`
          : shouldMoveNewGameToReserve
          ? `Added "${addedTitle}" and moved it into reserve at no additional cost.`
          : pool === "none"
            ? `Added "${addedTitle}" outside the active pools.`
            : `Added "${addedTitle}" to the ${pool} pool.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add the game.");
    } finally {
      setIsSavingAdd(false);
    }
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingGame?.id || !hasPendingChanges) {
      return;
    }

    setIsSavingEdit(true);
    setMessage(null);

    try {
      await updateGameInLibrary(editingGame.id, {
        title: editTitle,
        pool: editPool,
        platforms: normalizedEditPlatforms,
        multiplayer: editMultiplayer,
        ...(canEditCompletionInLibrary ? { completed: editCompleted } : {})
      });

      await refreshLibrary();
      await refreshEditCover(editingGame.id);
      setEditingGame(null);
      setCoverDialogMode(null);
      setMessage("Game updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the game.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleAdjustWeight(game: Game, direction: "increase" | "decrease") {
    if (!game.id) {
      return;
    }

    setIsSavingEdit(true);
    setMessage(null);

    try {
      const updatedGame = await adjustGameWeightInLibrary(game.id, direction);
      if (editingGame?.id === updatedGame.id) {
        setEditingGame(updatedGame);
      }
      await refreshLibrary();
      setMessage(
        direction === "increase"
          ? `Increased weight to ${getWeightValueFromSteps(updatedGame.weight)}.`
          : `Decreased weight to ${getWeightValueFromSteps(updatedGame.weight)}.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not adjust the game weight.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDeleteGame(game: Game) {
    if (!window.confirm(`Delete "${game.title}" from the library?`)) {
      return;
    }

    setMessage(null);

    try {
      await deleteGameFromLibrary(game.id!);
      await refreshLibrary();
      setMessage(`Removed ${game.title}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete the game.");
    }
  }

  async function handleSearchCover() {
    if (!coverSearchQuery.trim()) {
      setCoverErrorMessage("Enter a search title first.");
      return;
    }

    setIsSearchingCover(true);
    setCoverErrorMessage(null);
    setCoverSuccessMessage(null);

    try {
      const response = await searchIgdbByTitle(coverSearchQuery, { limit: 12 });
      setCoverSelectedCandidate(response.selected);
      setCoverAlternatives(response.alternatives);

      if (!response.selected) {
        setCoverSuccessMessage(`No IGDB match found for "${coverSearchQuery}".`);
      } else {
        setCoverSuccessMessage(`Found ${response.rawCount} IGDB result${response.rawCount === 1 ? "" : "s"}.`);
      }
    } catch (error) {
      setCoverErrorMessage(error instanceof Error ? error.message : "IGDB search failed.");
      setCoverSelectedCandidate(null);
      setCoverAlternatives([]);
    } finally {
      setIsSearchingCover(false);
    }
  }

  async function handleSaveCoverSelection() {
    if (!coverSelectedCandidate) {
      return;
    }

    if (coverDialogMode !== "edit" && coverDialogMode !== "add") {
      return;
    }

    setIsSavingCover(true);
    setCoverErrorMessage(null);

    try {
      if (coverDialogMode === "edit") {
        if (!editingGame?.id) {
          setCoverErrorMessage("Open a game editor first.");
          return;
        }

        await storeGameCoverCache(editingGame.id, {
          igdbId: coverSelectedCandidate.id,
          imageUrl: coverSelectedCandidate.imageUrl,
          imageId: coverSelectedCandidate.imageId,
          confidence: coverSelectedCandidate.confidence,
          searchQuery: coverSearchQuery.trim() || editingGame.title
        });

        await refreshEditCover(editingGame.id);
        await refreshLibrary();
        setCoverSuccessMessage(`Saved IGDB cover for "${editingGame.title}".`);
        return;
      }

      const addCoverQuery = coverSearchQuery.trim() || title.trim() || coverSelectedCandidate.name;
      setPendingAddCover({
        candidate: coverSelectedCandidate,
        searchQuery: addCoverQuery
      });
      setCoverDialogMode(null);
      setMessage(`Selected cover for "${title.trim() || "new game"}".`);
    } catch (error) {
      setCoverErrorMessage(error instanceof Error ? error.message : "Could not save cover mapping.");
    } finally {
      setIsSavingCover(false);
    }
  }

  useEffect(() => {
    void refreshLibrary();
    void getLibraryRuleCosts().then(setCosts);
    void getCurrentGameMode().then(setGameMode);
  }, []);

  useEffect(() => {
    const detail = {
      actions: [
        {
          id: "library-add-game",
          label: "Add",
          type: "event",
          eventName: "nextup:library-open-add",
          icon: "plus"
        },
        {
          id: "library-back-board",
          label: "Board",
          type: "link",
          to: "/next-up/board",
          icon: "back"
        }
      ]
    };

    function handleOpenAdd() {
      openAddGameDialog();
    }

    window.dispatchEvent(new CustomEvent("nextup:mobile-header-items", { detail }));
    window.addEventListener("nextup:library-open-add", handleOpenAdd);

    return () => {
      window.removeEventListener("nextup:library-open-add", handleOpenAdd);
      window.dispatchEvent(new CustomEvent("nextup:mobile-header-items", { detail: {} }));
    };
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
    if (!editingGame) {
      if (coverDialogMode === "edit") {
        setCoverDialogMode(null);
      }
      setCoverSearchQuery("");
      setCachedEditCover(null);
      setIsCachedEditCoverStale(false);
      resetCoverPickerState();
      return;
    }

    setCoverSearchQuery(editingGame.title);
    if (coverDialogMode === "edit") {
      resetCoverPickerState();
    }
    void refreshEditCover(editingGame.id);
  }, [coverDialogMode, editingGame]);

  const groupedGames = useMemo(() => {
    return (Object.keys(poolLabels) as GamePool[]).reduce<Record<GamePool, Game[]>>(
      (acc, pool) => {
        acc[pool] = games
          .filter((game) => game.pool === pool && !game.reserved)
          .sort((a, b) => a.title.localeCompare(b.title));
        return acc;
      },
      { daily: [], weekly: [], none: [] },
    );
  }, [games]);

  const reservedGames = useMemo(() => {
    return games
      .filter((game) => game.reserved)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [games]);

  const normalizedEditPlatforms = useMemo(
    () => parsePlatformsInput(editPlatforms),
    [editPlatforms]
  );

  const hasPendingChanges = useMemo(() => {
    if (!editingGame) {
      return false;
    }

    const normalizedCurrentPlatforms = parsePlatformsInput((editingGame.platforms ?? []).join(","));
    const normalizedTitle = editTitle.trim().replace(/\s+/g, " ");

    return (
      normalizedTitle !== editingGame.title ||
      editPool !== editingGame.pool ||
      JSON.stringify(normalizedEditPlatforms) !== JSON.stringify(normalizedCurrentPlatforms) ||
      editMultiplayer !== editingGame.multiplayer ||
      (canEditCompletionInLibrary && editCompleted !== editingGame.completed)
    );
  }, [canEditCompletionInLibrary, editCompleted, editMultiplayer, editPool, editTitle, editingGame, normalizedEditPlatforms]);

  const hasPoolChanged = Boolean(editingGame && editPool !== editingGame.pool);

  function renderGameCoverCard(game: Game) {
    const isExpanded = expandedGameId === game.id;
    const cachedCover = game.id ? libraryCoverByGameId[game.id] ?? null : null;
    const isCoverStale = game.id ? staleLibraryCoverByGameId[game.id] ?? false : false;

    return (
      <li key={game.id ?? game.title} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <button
          type="button"
          onClick={() => setExpandedGameId(isExpanded ? null : game.id ?? null)}
          className="group relative block w-full overflow-hidden bg-slate-900 text-left"
        >
          <div className="aspect-[2/3] w-full">
            {cachedCover?.imageUrl ? (
              <img
                src={cachedCover.imageUrl}
                alt={`${game.title} cover art`}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-black px-4 text-center">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">{game.title}</span>
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />

          <div className="absolute left-2 top-2 flex items-center gap-2">
            <span className="rounded-full border border-white/20 bg-black/45 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
              {game.reserved ? "Reserved" : poolLabels[game.pool]}
            </span>
            {isCoverStale ? (
              <span className="rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                Stale
              </span>
            ) : null}
          </div>

          <div className="absolute inset-x-0 bottom-0 p-3">
            <p className="text-sm font-semibold leading-tight text-white">{game.title}</p>
            <p className="mt-1 text-xs text-slate-200/90">Weight {getWeightValueFromSteps(game.weight)}</p>
          </div>
        </button>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-black/35 p-2">
          <button
            type="button"
            onClick={() => startEditing(game)}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-accent/40 hover:text-accent"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setExpandedGameId(isExpanded ? null : game.id ?? null)}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-accent/40 hover:text-accent"
          >
            {isExpanded ? "Hide" : "Details"}
          </button>
        </div>

        {isExpanded ? (
          <div className="border-t border-white/10 px-3 py-3 text-sm text-slate-300">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-slate-500">Pool</p>
                <p className="font-medium text-white">{poolLabels[game.pool]}</p>
              </div>
              <div>
                <p className="text-slate-500">Weight</p>
                <p className="font-medium text-white">{getWeightValueFromSteps(game.weight)}</p>
              </div>
              <div>
                <p className="text-slate-500">Platforms</p>
                <p className="font-medium text-white">{(game.platforms ?? []).join(", ") || "—"}</p>
              </div>
              <div>
                <p className="text-slate-500">Multiplayer</p>
                <p className="font-medium text-white">{game.multiplayer ? "Yes" : "No"}</p>
              </div>
              <div>
                <p className="text-slate-500">Completed</p>
                <p className="font-medium text-white">{game.completed ? "Yes" : "No"}</p>
              </div>
              <div>
                <p className="text-slate-500">Reserved</p>
                <p className="font-medium text-white">{game.reserved ? "Yes" : "No"}</p>
              </div>
              <div>
                <p className="text-slate-500">Added</p>
                <p className="font-medium text-white">{new Date(game.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <div className="space-y-6 text-white">
      <div className="hidden items-center justify-between gap-3 lg:flex">
        <div>
          <h1 className="text-2xl font-bold text-accent">Library</h1>
          <p className="mt-1 hidden text-sm opacity-80 lg:block">Browse games in each RNG pool, or keep titles outside the active pools.</p>
          {gameMode === "completion" ? (
            <p className="mt-2 hidden text-sm text-slate-300 lg:block">Completion mode is active: only incomplete daily and weekly games can roll, and marking a game complete awards ♦150.</p>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openAddGameDialog}
            className="inline-flex h-12 min-w-[8rem] items-center justify-center rounded-full border border-accent/30 bg-accent/10 px-5 text-sm font-semibold text-accent transition hover:border-accent/50 hover:bg-accent/20"
          >
            Add a game (♦{costs.addGame})
          </button>
          <Link
            to="/next-up/board"
            className="inline-flex h-12 min-w-[6rem] items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white transition hover:border-accent/40 hover:bg-white/10"
          >
            Back to board
          </Link>
        </div>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-slate-950/80 p-4 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.75)] sm:p-6">
        <p className="text-sm text-slate-300">
          {games.length} game{games.length === 1 ? "" : "s"} tracked.
        </p>

        {games.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No games yet. Add one from the library.</p>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="grid gap-5 lg:grid-cols-2">
              {(Object.keys(poolLabels) as GamePool[])
                .filter((pool) => pool !== "none")
                .map((pool) => (
                <section key={pool} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold capitalize text-accent">{poolLabels[pool]}</h2>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs uppercase tracking-wide text-slate-300">
                    {groupedGames[pool].length}
                  </span>
                </div>

                {groupedGames[pool].length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-3 py-4 text-sm text-slate-400">
                    No games in this pool yet.
                  </p>
                ) : (
                  <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
                    {groupedGames[pool].map(renderGameCoverCard)}
                  </ul>
                )}
                </section>
              ))}

              <section className="rounded-[24px] border border-accent/20 bg-accent/10 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-accent">Reserved</h2>
                  <span className="rounded-full border border-accent/20 px-2.5 py-1 text-xs uppercase tracking-wide text-accent">
                    {reservedGames.length}
                  </span>
                </div>

                {reservedGames.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-accent/20 bg-black/20 px-3 py-4 text-sm text-slate-400">
                    No games are currently reserved.
                  </p>
                ) : (
                  <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
                    {reservedGames.map(renderGameCoverCard)}
                  </ul>
                )}
              </section>

              <section className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold capitalize text-accent">{poolLabels.none}</h2>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs uppercase tracking-wide text-slate-300">
                    {groupedGames.none.length}
                  </span>
                </div>

                {groupedGames.none.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-3 py-4 text-sm text-slate-400">
                    No games in this pool yet.
                  </p>
                ) : (
                  <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
                    {groupedGames.none.map(renderGameCoverCard)}
                  </ul>
                )}
              </section>
            </div>
          </div>
        )}
      </div>

      {editingGame ? (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/80 px-4 py-6 backdrop-blur-sm sm:items-center">
          <div className="my-auto w-full max-w-lg rounded-[32px] border border-white/10 bg-slate-950/95 p-6 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.7)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Edit game</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditCoverDialog(editingGame)}
                  className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-200 transition hover:border-sky-400/50 hover:bg-sky-500/20"
                >
                  Change cover
                </button>
                <button
                  type="button"
                  onClick={() => setEditingGame(null)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:border-accent/40 hover:bg-white/10"
                >
                  Close
                </button>
              </div>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSaveEdit}>
              <input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
                placeholder="Game title"
                required
              />
              <select
                value={editPool}
                onChange={(event) => setEditPool(event.target.value as GamePool)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
              >
                <option value="daily">Daily pool</option>
                <option value="weekly">Weekly pool</option>
                <option value="none">No pool</option>
              </select>
              <input
                value={editPlatforms}
                onChange={(event) => setEditPlatforms(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
                placeholder="Platforms (e.g. Switch, PC)"
              />
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                <input
                  type="checkbox"
                  checked={editMultiplayer}
                  onChange={(event) => setEditMultiplayer(event.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                <span>Multiplayer game</span>
              </label>
              {canEditCompletionInLibrary ? (
                <label className="flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-white">
                  <input
                    type="checkbox"
                    checked={editCompleted}
                    onChange={(event) => setEditCompleted(event.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  <span>Mark game complete</span>
                </label>
              ) : (
                <p className="rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-slate-300">
                  Completion mode is active. Mark completion from the Record Play dialog on the Board.
                </p>
              )}

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Weight ({getWeightValueFromSteps(editingGame.weight)})</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleAdjustWeight(editingGame, "increase")}
                      disabled={isSavingEdit}
                      className="rounded-full bg-accent px-3 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Increase by 50% (♦{costs.changeWeight})
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAdjustWeight(editingGame, "decrease")}
                      disabled={isSavingEdit}
                      className="rounded-full bg-accent px-3 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Decrease by 33% (♦{costs.changeWeight})
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void handleDeleteGame(editingGame)}
                  disabled={isSavingEdit}
                  className="rounded-full border border-rose-400/30 bg-rose-500/10 px-5 py-3 text-sm font-semibold text-rose-300 transition hover:border-rose-400/50 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Delete game
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit || !hasPendingChanges}
                  className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingEdit
                    ? "Saving..."
                    : hasPoolChanged
                      ? `Save changes (pool: ♦${costs.changePool})`
                      : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {coverDialogMode ? (
        <div className="fixed inset-0 z-[10001] flex items-start justify-center overflow-y-auto bg-slate-950/85 px-4 py-6 backdrop-blur-sm sm:items-center">
          <div className="my-auto w-full max-w-3xl rounded-[32px] border border-white/10 bg-slate-950/95 p-6 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.7)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Select IGDB cover</h2>
                <p className="mt-2 text-sm text-slate-400">
                  {coverDialogMode === "edit"
                    ? `Search IGDB and save a cover for ${editingGame?.title ?? "this game"}. Cover changes are saved immediately.`
                    : "Search IGDB and choose a cover to apply when you add this game."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCoverDialogMode(null)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:border-accent/40 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <input
                  value={coverSearchQuery}
                  onChange={(event) => setCoverSearchQuery(event.target.value)}
                  placeholder="Search title"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
                />
                <button
                  type="button"
                  onClick={() => void handleSearchCover()}
                  disabled={isSearchingCover || !coverSearchQuery.trim()}
                  className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSearchingCover ? "Searching..." : "Search IGDB"}
                </button>
              </div>

              {coverErrorMessage ? (
                <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{coverErrorMessage}</p>
              ) : null}

              {coverSuccessMessage ? (
                <p className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{coverSuccessMessage}</p>
              ) : null}
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="text-sm font-semibold text-white">Selected candidate</h3>

                {!coverSelectedCandidate ? (
                  <p className="mt-3 text-sm text-slate-400">Run a search to preview the top IGDB match.</p>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="h-40 w-28 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                        {coverSelectedCandidate.imageUrl ? (
                          <img src={coverSelectedCandidate.imageUrl} alt={coverSelectedCandidate.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-slate-500">No cover</div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <p className="text-base font-semibold text-white">{coverSelectedCandidate.name}</p>
                        <p className="text-sm text-slate-300">IGDB ID: {coverSelectedCandidate.id}</p>
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getConfidenceClasses(coverSelectedCandidate.confidence)}`}>
                          {describeConfidence(coverSelectedCandidate.confidence).label} ({describeConfidence(coverSelectedCandidate.confidence).value}%)
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleSaveCoverSelection()}
                      disabled={isSavingCover || !coverSelectedCandidate}
                      className="rounded-full border border-sky-400/30 bg-sky-500/10 px-5 py-3 text-sm font-semibold text-sky-300 transition hover:border-sky-400/50 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingCover
                        ? "Saving..."
                        : coverDialogMode === "edit"
                          ? "Save cover"
                          : "Use this cover"}
                    </button>
                  </div>
                )}

                {coverAlternatives.length > 0 ? (
                  <div className="mt-6 space-y-2 border-t border-white/10 pt-4">
                    <p className="text-sm font-semibold text-slate-300">Alternatives</p>
                    <div className="space-y-2">
                      {coverAlternatives.slice(0, 6).map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => setCoverSelectedCandidate(candidate)}
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

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="text-sm font-semibold text-white">
                  {coverDialogMode === "edit" ? "Current cached cover" : "Pending new-game cover"}
                </h3>

                {coverDialogMode === "add" ? (
                  !pendingAddCover ? (
                    <p className="mt-3 text-sm text-slate-400">No cover selected for this new game yet.</p>
                  ) : (
                    <div className="mt-4 space-y-3 text-sm text-slate-300">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-white">{title.trim() || "New game"}</span>
                        <span className="rounded-full border border-sky-400/40 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-200">Pending</span>
                      </div>
                      <p>IGDB ID: {pendingAddCover.candidate.id}</p>
                      <p>Confidence: {Math.round(pendingAddCover.candidate.confidence)}%</p>
                      <p>Query: {pendingAddCover.searchQuery}</p>
                      <div className="h-44 w-32 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                        {pendingAddCover.candidate.imageUrl ? (
                          <img src={pendingAddCover.candidate.imageUrl} alt={title.trim() || "New game"} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-slate-500">No cached image URL</div>
                        )}
                      </div>
                    </div>
                  )
                ) : (
                  !cachedEditCover ? (
                    <p className="mt-3 text-sm text-slate-400">No cover cached for this game yet.</p>
                  ) : (
                    <div className="mt-4 space-y-3 text-sm text-slate-300">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-white">{editingGame?.title}</span>
                        {isCachedEditCoverStale ? (
                          <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200">Stale</span>
                        ) : (
                          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">Fresh</span>
                        )}
                      </div>
                      <p>IGDB ID: {cachedEditCover.igdbId}</p>
                      <p>Confidence: {Math.round(cachedEditCover.confidence)}%</p>
                      <p>Query: {cachedEditCover.searchQuery}</p>
                      <div className="h-44 w-32 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                        {cachedEditCover.imageUrl ? (
                          <img src={cachedEditCover.imageUrl} alt={editingGame?.title ?? "Game"} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-slate-500">No cached image URL</div>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isAddDialogOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/80 px-4 py-6 backdrop-blur-sm sm:items-center">
          <div className="my-auto w-full max-w-lg rounded-[32px] border border-white/10 bg-slate-950/95 p-6 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.7)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Add a game</h2>
                <p className="mt-2 text-sm text-slate-400">Add a new title to the library.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddDialogOpen(false)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:border-accent/40 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleAddGame}>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
                placeholder="Game title"
                required
              />
              <select
                value={pool}
                onChange={(event) => setPool(event.target.value as GamePool)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
              >
                <option value="daily">Daily pool</option>
                <option value="weekly">Weekly pool</option>
                <option value="none">No pool</option>
              </select>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">
                    {pendingAddCover ? "Cover selected" : "No cover selected"}
                  </p>
                  <button
                    type="button"
                    onClick={openAddCoverDialog}
                    className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 transition hover:border-sky-400/50 hover:bg-sky-500/20"
                  >
                    {pendingAddCover ? "Change cover" : "Choose cover"}
                  </button>
                </div>
              </div>
              <input
                value={platformsInput}
                onChange={(event) => setPlatformsInput(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-white/10"
                placeholder="Platforms (e.g. Switch, PC, Steam Deck)"
              />
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                <input
                  type="checkbox"
                  checked={isMultiplayer}
                  onChange={(event) => setIsMultiplayer(event.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                <span>Multiplayer game</span>
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-white">
                <input
                  type="checkbox"
                  checked={moveNewGameToReserve}
                  onChange={(event) => setMoveNewGameToReserve(event.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                <span>Move game into reserve (free!)</span>
              </label>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingAdd}
                  className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingAdd ? "Saving..." : `Add game (♦${costs.addGame})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <TransientToast
        message={message}
        onClose={() => setMessage(null)}
        position={editingGame || isAddDialogOpen || Boolean(coverDialogMode) ? "top" : "bottom"}
      />
    </div>
  );
}
