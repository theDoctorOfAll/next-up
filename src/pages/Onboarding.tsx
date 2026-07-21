import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatFullDataRestoreSummary, restoreFullDataBackup } from "../database/repositories/backupRepository";
import { storeGameCoverCache } from "../database/repositories/gameCoverRepository";
import { initializeGameMode } from "../database/repositories/gameModeRepository";
import { addGameInternal } from "../domain/services/GameLibraryService";
import { setReserveGame } from "../domain/services/BoardService";
import { describeConfidence, searchIgdbByTitle, type IgdbSearchCandidate } from "../services/igdbClient";
import {
  completeOnboarding,
  getOnboardingObjective,
  markOnboardingCompleted,
  type OnboardingObjective
} from "../database/repositories/onboardingRepository";

const OBJECTIVES: Array<{
  id: OnboardingObjective;
  title: string;
  description: string;
}> = [
  {
    id: "explore-everything",
    title: "Explore Everything",
    description: "Keep the board broad and discovery-friendly while you build up a library."
  },
  {
    id: "burn-the-backlog",
    title: "Burn the Backlog",
    description: "Bias your setup toward finishing what you already own instead of chasing novelty."
  }
];

function getModeForObjective(objective: OnboardingObjective) {
  return objective === "burn-the-backlog" ? "completion" as const : "standard" as const;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedObjective, setSelectedObjective] = useState<OnboardingObjective>("explore-everything");
  const [isRestoreExpanded, setIsRestoreExpanded] = useState(false);
  const [starterTitle, setStarterTitle] = useState("");
  const [starterPool, setStarterPool] = useState<"daily" | "weekly" | "none">("daily");
  const [starterIsMultiplayer, setStarterIsMultiplayer] = useState(false);
  const [selectedCoverCandidate, setSelectedCoverCandidate] = useState<IgdbSearchCandidate | null>(null);
  const [coverAlternatives, setCoverAlternatives] = useState<IgdbSearchCandidate[]>([]);
  const [isSearchingCover, setIsSearchingCover] = useState(false);
  const [coverMessage, setCoverMessage] = useState<string | null>(null);
  const [addedStarterGames, setAddedStarterGames] = useState<Array<{ id: number; title: string; pool: string; reserved: boolean; coverName?: string | null }>>([]);
  const [reserveSelection, setReserveSelection] = useState("");
  const [starterMessage, setStarterMessage] = useState<string | null>(null);
  const [isAddingStarterGame, setIsAddingStarterGame] = useState(false);
  const [isUpdatingReserve, setIsUpdatingReserve] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedStarterGames = useMemo(
    () => [...addedStarterGames].sort((left, right) => left.title.localeCompare(right.title)),
    [addedStarterGames]
  );
  const currentReserve = sortedStarterGames.find((game) => game.reserved) ?? null;

  function resetCoverState() {
    setSelectedCoverCandidate(null);
    setCoverAlternatives([]);
    setCoverMessage(null);
  }

  async function handleRestoreBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsRestoring(true);
    setError(null);

    try {
      const text = await file.text();
      const result = await restoreFullDataBackup(text);
      const importedObjective = await getOnboardingObjective();

      if (importedObjective) {
        await markOnboardingCompleted();
      } else {
        await initializeGameMode(getModeForObjective(selectedObjective));
        await completeOnboarding(selectedObjective);
      }

      navigate("/next-up/board", {
        replace: true,
        state: {
          restoredBackup: result,
          restoredBackupMessage: formatFullDataRestoreSummary(result)
        }
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restore the backup.");
    } finally {
      event.target.value = "";
      setIsRestoring(false);
    }
  }

  async function handleAddStarterGame(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!starterTitle.trim()) {
      setError("Starter game title is required.");
      return;
    }

    setIsAddingStarterGame(true);
    setError(null);
    setStarterMessage(null);

    try {
      const resolvedTitle = selectedCoverCandidate?.name?.trim() || starterTitle.trim();
      const addedGameId = await addGameInternal(resolvedTitle, starterPool, [], starterIsMultiplayer, false);

      if (selectedCoverCandidate) {
        await storeGameCoverCache(addedGameId, {
          igdbId: selectedCoverCandidate.id,
          imageUrl: selectedCoverCandidate.imageUrl,
          imageId: selectedCoverCandidate.imageId,
          confidence: selectedCoverCandidate.confidence,
          searchQuery: starterTitle.trim()
        });
      }

      const addedTitle = resolvedTitle.replace(/\s+/g, " ");

      setAddedStarterGames((current) => {
        const nextEntry = {
          id: addedGameId,
          title: addedTitle,
          pool: starterPool,
          reserved: false,
          coverName: selectedCoverCandidate?.name ?? null
        };

        const existingIndex = current.findIndex((game) => game.id === addedGameId);

        if (existingIndex === -1) {
          return [...current, nextEntry];
        }

        const next = [...current];
        next[existingIndex] = nextEntry;
        return next;
      });

      setStarterMessage(
        selectedCoverCandidate
          ? `Added \"${addedTitle}\" to the ${starterPool} pool with the selected cover at no cost.`
          : `Added \"${addedTitle}\" to the ${starterPool} pool at no cost.`
      );
      setStarterTitle("");
      setStarterPool("daily");
      setStarterIsMultiplayer(false);
      setReserveSelection((current) => current || String(addedGameId));
      resetCoverState();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the starter game.");
    } finally {
      setIsAddingStarterGame(false);
    }
  }

  async function handleFetchCover() {
    const query = starterTitle.trim();

    if (!query) {
      setError("Enter a game title before searching for a cover.");
      return;
    }

    setIsSearchingCover(true);
    setError(null);
    setCoverMessage(null);

    try {
      const response = await searchIgdbByTitle(query, { limit: 8 });

      setSelectedCoverCandidate(response.selected);
      setCoverAlternatives(response.alternatives);
      setCoverMessage(
        response.selected
          ? `Found a top cover match for \"${response.selected.name}\".`
          : response.alternatives.length > 0
            ? "No top match was selected automatically. Choose one of the alternatives below."
            : "No cover matches were found. You can still add the game without a cover."
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not fetch a cover from IGDB.");
    } finally {
      setIsSearchingCover(false);
    }
  }

  async function handleSetReserve() {
    const selectedGameId = Number(reserveSelection);

    if (!selectedGameId) {
      setError("Choose one of your starter games to use as reserve.");
      return;
    }

    setIsUpdatingReserve(true);
    setError(null);
    setStarterMessage(null);

    try {
      await setReserveGame(selectedGameId, { chargeCost: false });
      setAddedStarterGames((current) => current.map((game) => ({
        ...game,
        reserved: game.id === selectedGameId
      })));
      const selectedGame = addedStarterGames.find((game) => game.id === selectedGameId);
      setStarterMessage(`${selectedGame?.title ?? "Selected game"} is now your reserve game.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not set the reserve game.");
    } finally {
      setIsUpdatingReserve(false);
    }
  }

  async function handleContinue() {
    setIsSaving(true);
    setError(null);

    try {
      await initializeGameMode(getModeForObjective(selectedObjective));
      await completeOnboarding(selectedObjective);
      navigate("/next-up/board", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save onboarding progress.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-white sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[32px] border border-white/20 bg-slate-900/85 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)]">
        <div className="bg-[radial-gradient(circle_at_top_left,rgba(110,231,255,0.18),transparent_45%),linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0))] px-6 py-8 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Phase 9 Onboarding</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-accent sm:text-4xl">Set up Next Up for the way you actually play.</h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-300 sm:text-base">
            Start by choosing your play objective, then build a starter library with covers, and finally pick the reserve game that should sit off to the side.
          </p>

          <div className="mt-6 max-w-xl rounded-[24px] border border-white/10 bg-black/15 p-4">
            <button
              type="button"
              onClick={() => setIsRestoreExpanded((current) => !current)}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Returning user</p>
                <p className="mt-2 text-sm text-slate-200">Restore a full backup instead of walking through onboarding again.</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white">
                {isRestoreExpanded ? "Hide" : "Restore"}
              </span>
            </button>

            {isRestoreExpanded ? (
              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="text-sm text-slate-300">
                  Choose a full data JSON export created from Settings. Restoring will replace the current local app data on this device.
                </p>

                <input
                  ref={backupInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(event) => void handleRestoreBackup(event)}
                />

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => backupInputRef.current?.click()}
                    disabled={isRestoring || isSaving || isAddingStarterGame || isUpdatingReserve}
                    className="rounded-full border border-accent/30 bg-accent/10 px-5 py-3 text-sm font-semibold text-accent transition hover:border-accent/50 hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRestoring ? "Restoring..." : "Restore from backup"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)] sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Step 1</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-accent">Choose your objective</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Save the preference that should guide later Phase 9 rules once the rest of the system is implemented.
            </p>
          </div>

          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Preference only</p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {OBJECTIVES.map((objective) => {
            const isSelected = selectedObjective === objective.id;

            return (
              <button
                key={objective.id}
                type="button"
                onClick={() => setSelectedObjective(objective.id)}
                className={`rounded-[28px] border p-5 text-left transition ${
                  isSelected
                    ? "border-accent/50 bg-accent/10 shadow-[0_20px_60px_-40px_rgba(110,231,255,0.55)]"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{objective.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{objective.description}</p>
                  </div>

                  <span
                    className={`mt-1 inline-flex h-5 w-5 shrink-0 rounded-full border ${
                      isSelected ? "border-accent bg-accent" : "border-white/20 bg-transparent"
                    }`}
                    aria-hidden="true"
                  />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)] sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Step 2</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-accent">Enter your library</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Import all titles you want to play with. You can keep them outside of the pools, but adding games later will cost points, so be thorough!
            </p>
          </div>

          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Covers included</p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleAddStarterGame(event)}>
            <label className="block space-y-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-wide text-slate-400">Game title</span>
              <input
                value={starterTitle}
                onChange={(event) => {
                  setStarterTitle(event.target.value);
                  resetCoverState();
                }}
                placeholder="Enter a game you want on the board"
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-slate-950"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2 text-sm text-slate-300">
                <span className="text-xs uppercase tracking-wide text-slate-400">Starting pool</span>
                <select
                  value={starterPool}
                  onChange={(event) => setStarterPool(event.target.value as "daily" | "weekly" | "none")}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-slate-950"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="none">Outside active pools</option>
                </select>
              </label>

              <div className="flex h-full items-center rounded-2xl border border-accent/20 bg-accent/5 p-4 text-sm text-slate-300">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={starterIsMultiplayer}
                    onChange={(event) => setStarterIsMultiplayer(event.target.checked)}
                    className="h-4 w-4 rounded border-accent/40 bg-slate-950/80 text-accent accent-accent"
                  />
                  <span>Multiplayer?</span>
                </label>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-slate-950/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Cover picker</p>
                  <p className="mt-1 text-sm text-slate-300">Search IGDB before adding the game, then keep the top match or choose an alternative.</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleFetchCover()}
                  disabled={isSearchingCover || starterTitle.trim().length === 0}
                  className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-300 transition hover:border-sky-400/50 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSearchingCover ? "Searching..." : "Fetch cover"}
                </button>
              </div>

              {coverMessage ? (
                <p className="mt-3 text-sm text-slate-300">{coverMessage}</p>
              ) : null}

              {selectedCoverCandidate ? (
                <div className="mt-4 rounded-[20px] border border-accent/20 bg-accent/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Selected cover</p>
                  <div className="mt-3 flex gap-4">
                    <div className="h-28 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-900/70">
                      {selectedCoverCandidate.imageUrl ? (
                        <img src={selectedCoverCandidate.imageUrl} alt={selectedCoverCandidate.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-slate-400">No image</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-white">{selectedCoverCandidate.name}</p>
                      <p className="mt-2 text-sm text-slate-300">
                        {describeConfidence(selectedCoverCandidate.confidence).label} · {describeConfidence(selectedCoverCandidate.confidence).value}%
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {coverAlternatives.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Alternatives</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {coverAlternatives.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => setSelectedCoverCandidate(candidate)}
                        className={`rounded-2xl border p-3 text-left transition ${selectedCoverCandidate?.id === candidate.id ? "border-accent/40 bg-accent/10" : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"}`}
                      >
                        <p className="text-sm font-semibold text-white">{candidate.name}</p>
                        <p className="mt-1 text-xs text-slate-300">{describeConfidence(candidate.confidence).value}% match</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="submit"
                disabled={isAddingStarterGame || isRestoring || isSaving || isUpdatingReserve || !selectedCoverCandidate}
                className="rounded-full border border-accent/30 bg-accent/10 px-5 py-3 text-sm font-semibold text-accent transition hover:border-accent/50 hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAddingStarterGame ? "Adding..." : "Add game"}
              </button>
            </div>
          </form>

          {starterMessage ? (
            <p className="mt-4 text-sm text-emerald-300">{starterMessage}</p>
          ) : null}

          {addedStarterGames.length > 0 ? (
            <div className="mt-5 rounded-[24px] border border-white/10 bg-slate-950/40 p-4">
              <p className="text-sm font-semibold text-white">Starter titles added</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {addedStarterGames.map((game) => (
                  <span
                    key={game.id}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200"
                  >
                    {game.title} • {game.pool}{game.reserved ? " • reserve" : ""}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
      </section>

      <section className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)] sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Step 3</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-accent">Choose your reserve</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Once you have added your library, pick the title that should sit in reserve. This is free here, but will cost points to move later.
            </p>
          </div>

          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">After library entry</p>
        </div>

        {sortedStarterGames.length === 0 ? (
          <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            Add at least one starter game in Step 1 before choosing a reserve.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <label className="block space-y-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-wide text-slate-400">Reserve game</span>
              <select
                value={reserveSelection}
                onChange={(event) => setReserveSelection(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:bg-slate-950"
              >
                <option value="">Choose one of your starter games</option>
                {sortedStarterGames.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.title}
                  </option>
                ))}
              </select>
            </label>

            {currentReserve ? (
              <p className="text-sm text-slate-300">Current reserve: <span className="font-semibold text-white">{currentReserve.title}</span></p>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleSetReserve()}
                disabled={isUpdatingReserve || !reserveSelection || Number(reserveSelection) === currentReserve?.id}
                className="rounded-full border border-accent/30 bg-accent/10 px-5 py-3 text-sm font-semibold text-accent transition hover:border-accent/50 hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUpdatingReserve ? "Setting reserve..." : "Set reserve"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[32px] border border-white/20 bg-slate-900/85 p-6 shadow-[0_35px_100px_-45px_rgba(0,0,0,0.9)] sm:p-8">
        <div className="mt-0 rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          <p className="font-semibold text-white">What ships in this implementation</p>
          <p className="mt-2">
            First-run routing, onboarding lockout after library initialization, compact backup restore, cover selection during starter-library entry, and reserve selection after library setup are live now.
          </p>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-300">{error}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={isSaving || isRestoring || isAddingStarterGame}
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Continue to board"}
          </button>
        </div>
      </section>
    </div>
  );
}