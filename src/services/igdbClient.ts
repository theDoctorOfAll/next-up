const DEFAULT_IGDB_WORKER_URL = "https://next-up-igdb-proxy.next-up-igdb.workers.dev";
const DEFAULT_TIMEOUT_MS = 8_000;

export interface IgdbSearchCandidate {
  id: number;
  name: string;
  imageUrl: string | null;
  imageId: string | null;
  releaseDate: number | null;
  totalRating: number | null;
  confidence: number;
}

export interface IgdbSearchResponse {
  ok: true;
  query: string;
  selected: IgdbSearchCandidate | null;
  alternatives: IgdbSearchCandidate[];
  rawCount: number;
}

interface IgdbSearchErrorResponse {
  ok: false;
  error: string;
}

export interface SearchIgdbOptions {
  limit?: number;
  timeoutMs?: number;
}

export function getIgdbWorkerUrl() {
  const configured = import.meta.env.VITE_IGDB_WORKER_URL?.trim();

  if (!configured) {
    return DEFAULT_IGDB_WORKER_URL;
  }

  return configured.replace(/\/+$/, "");
}

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getTitleSimilarity(query: string, candidate: string) {
  const normalizedQuery = normalizeTitle(query);
  const normalizedCandidate = normalizeTitle(candidate);

  if (!normalizedQuery || !normalizedCandidate) {
    return 0;
  }

  if (normalizedQuery === normalizedCandidate) {
    return 1;
  }

  const queryTokens = normalizedQuery.split(" ");
  const candidateTokens = normalizedCandidate.split(" ");
  const querySet = new Set(queryTokens);
  const candidateSet = new Set(candidateTokens);

  let overlap = 0;
  for (const token of querySet) {
    if (candidateSet.has(token)) {
      overlap += 1;
    }
  }

  const unionSize = new Set([...querySet, ...candidateSet]).size;

  if (unionSize === 0) {
    return 0;
  }

  return overlap / unionSize;
}

function classifyConfidence(confidence: number) {
  if (confidence >= 90) {
    return "high" as const;
  }

  if (confidence >= 70) {
    return "medium" as const;
  }

  return "low" as const;
}

export function describeConfidence(confidence: number) {
  const normalized = Math.max(0, Math.min(100, Math.round(confidence)));
  const band = classifyConfidence(normalized);

  return {
    value: normalized,
    band,
    label: band === "high" ? "High confidence" : band === "medium" ? "Medium confidence" : "Low confidence"
  };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function searchIgdbByTitle(query: string, options: SearchIgdbOptions = {}): Promise<IgdbSearchResponse> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    throw new Error("Search query is required.");
  }

  const limit = options.limit ?? 10;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = `${getIgdbWorkerUrl()}/search`;

  let response: Response;

  try {
    response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: trimmedQuery,
        limit
      })
    }, timeoutMs);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("IGDB request timed out.");
    }

    throw new Error("Could not reach IGDB worker.");
  }

  if (!response.ok) {
    let errorMessage = `IGDB worker request failed (${response.status}).`;

    try {
      const errorBody = await response.json() as Partial<IgdbSearchErrorResponse>;
      if (errorBody.error) {
        errorMessage = errorBody.error;
      }
    } catch {
      // Keep fallback error message.
    }

    throw new Error(errorMessage);
  }

  const data = await response.json() as IgdbSearchResponse | IgdbSearchErrorResponse;

  if (!data.ok) {
    throw new Error(data.error || "IGDB worker returned an error.");
  }

  return data;
}
