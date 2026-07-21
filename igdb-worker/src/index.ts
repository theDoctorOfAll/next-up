interface Env {
  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
  ALLOWED_ORIGINS?: string;
  DEFAULT_ORIGIN?: string;
}

interface SearchRequestBody {
  query?: string;
  limit?: number;
}

interface IgdbCover {
  image_id?: string;
}

interface IgdbGame {
  id: number;
  name: string;
  cover?: IgdbCover;
  first_release_date?: number;
  total_rating?: number;
}

interface RankedGame {
  id: number;
  name: string;
  imageUrl: string | null;
  imageId: string | null;
  releaseDate: number | null;
  totalRating: number | null;
  confidence: number;
}

interface TwitchTokenState {
  accessToken: string;
  expiresAtMs: number;
}

interface TwitchTokenResponse {
  access_token?: string;
  expires_in?: number;
  status?: number;
  message?: string;
}

let tokenState: TwitchTokenState | null = null;

const IGDB_API_URL = "https://api.igdb.com/v4/games";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_IGDB_RETRIES = 3;
const MAX_QUERY_LENGTH = 120;
const MAX_RESULT_LIMIT = 25;
const DEFAULT_RESULT_LIMIT = 10;

function parseAllowedOrigins(env: Env) {
  const configured = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(configured);
}

function buildCorsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin"
  };
}

function jsonResponse(status: number, payload: unknown, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders
    }
  });
}

function resolveRequestOrigin(request: Request, env: Env) {
  const allowedOrigins = parseAllowedOrigins(env);
  const originHeader = request.headers.get("Origin");

  if (originHeader && allowedOrigins.has(originHeader)) {
    return originHeader;
  }

  if (!originHeader && env.DEFAULT_ORIGIN && allowedOrigins.has(env.DEFAULT_ORIGIN)) {
    return env.DEFAULT_ORIGIN;
  }

  return null;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreMatch(query: string, candidate: string) {
  const normalizedQuery = normalizeForMatch(query);
  const normalizedCandidate = normalizeForMatch(candidate);

  if (!normalizedQuery || !normalizedCandidate) {
    return 0;
  }

  if (normalizedQuery === normalizedCandidate) {
    return 98;
  }

  if (normalizedCandidate.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedCandidate)) {
    return 90;
  }

  const queryTokens = new Set(normalizedQuery.split(" "));
  const candidateTokens = new Set(normalizedCandidate.split(" "));

  let overlap = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1;
    }
  }

  const union = new Set([...queryTokens, ...candidateTokens]).size;
  const jaccard = union === 0 ? 0 : overlap / union;

  // Bias toward stronger starts while still allowing partial overlap.
  const startBonus = normalizedCandidate.includes(normalizedQuery.split(" ")[0] ?? "") ? 0.08 : 0;
  const score = Math.min(1, jaccard + startBonus);

  return Math.round(score * 100);
}

function toCoverUrl(imageId?: string) {
  if (!imageId) {
    return null;
  }

  return `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
}

function requireEnvValue(value: string | undefined, name: string) {
  if (!value || !value.trim()) {
    throw new Error(`${name} is not configured in worker secrets.`);
  }

  return value.trim();
}

async function getTwitchAccessToken(env: Env) {
  const nowMs = Date.now();

  if (tokenState && tokenState.expiresAtMs - 30_000 > nowMs) {
    return tokenState.accessToken;
  }

  const clientId = requireEnvValue(env.TWITCH_CLIENT_ID, "TWITCH_CLIENT_ID");
  const clientSecret = requireEnvValue(env.TWITCH_CLIENT_SECRET, "TWITCH_CLIENT_SECRET");

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials"
  });

  const response = await fetchWithTimeout(`${TWITCH_TOKEN_URL}?${params.toString()}`, {
    method: "POST"
  });

  if (!response.ok) {
    let detail = "";

    try {
      const data = await response.json<TwitchTokenResponse>();
      detail = data.message?.trim() ?? "";
    } catch {
      // Keep fallback message when Twitch doesn't return JSON.
    }

    const reason = detail ? `: ${detail}` : "";
    throw new Error(`Token request failed (${response.status})${reason}`);
  }

  const data = await response.json<TwitchTokenResponse>();

  if (!data.access_token || !data.expires_in) {
    throw new Error("Token response missing required fields.");
  }

  tokenState = {
    accessToken: data.access_token,
    expiresAtMs: nowMs + data.expires_in * 1000
  };

  return data.access_token;
}

async function searchIgdb(env: Env, query: string, limit: number) {
  const oauthToken = await getTwitchAccessToken(env);

  const body = [
    "fields id,name,cover.image_id,first_release_date,total_rating;",
    `search \"${query.replace(/\\/g, "\\\\").replace(/\"/g, '\\\"')}\";`,
    `limit ${limit};`
  ].join("\n");

  let attempt = 0;
  let delayMs = 250;

  while (attempt < MAX_IGDB_RETRIES) {
    attempt += 1;

    const response = await fetchWithTimeout(IGDB_API_URL, {
      method: "POST",
      headers: {
        "Client-ID": env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${oauthToken}`,
        "Content-Type": "text/plain"
      },
      body
    });

    if (response.ok) {
      const data = await response.json<IgdbGame[]>();
      return data;
    }

    // Retry on upstream throttling or transient server faults.
    if (response.status === 429 || response.status >= 500) {
      if (attempt >= MAX_IGDB_RETRIES) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs *= 2;
      continue;
    }

    throw new Error(`IGDB request failed (${response.status}).`);
  }

  throw new Error("IGDB request failed after retries.");
}

function rankResults(query: string, items: IgdbGame[]) {
  const ranked: RankedGame[] = items.map((item) => {
    const imageId = item.cover?.image_id ?? null;
    return {
      id: item.id,
      name: item.name,
      imageUrl: toCoverUrl(imageId ?? undefined),
      imageId,
      releaseDate: item.first_release_date ?? null,
      totalRating: item.total_rating ?? null,
      confidence: scoreMatch(query, item.name)
    };
  });

  ranked.sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }

    return left.name.localeCompare(right.name);
  });

  return ranked;
}

function validateSearchBody(body: SearchRequestBody) {
  const query = typeof body.query === "string" ? body.query.trim() : "";

  if (!query) {
    throw new Error("query is required.");
  }

  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error(`query is too long (max ${MAX_QUERY_LENGTH} chars).`);
  }

  const requestedLimit = Number.isFinite(body.limit)
    ? Math.floor(Number(body.limit))
    : DEFAULT_RESULT_LIMIT;

  const limit = Math.max(1, Math.min(MAX_RESULT_LIMIT, requestedLimit));

  return { query, limit };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = resolveRequestOrigin(request, env);

    if (!origin) {
      return new Response("Origin not allowed.", { status: 403 });
    }

    const corsHeaders = buildCorsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(200, {
        ok: true,
        service: "next-up-igdb-proxy",
        timestamp: Date.now()
      }, corsHeaders);
    }

    if (request.method === "POST" && url.pathname === "/search") {
      try {
        const body = await request.json<SearchRequestBody>();
        const { query, limit } = validateSearchBody(body);
        const igdbResults = await searchIgdb(env, query, limit);
        const ranked = rankResults(query, igdbResults);

        return jsonResponse(200, {
          ok: true,
          query,
          selected: ranked[0] ?? null,
          alternatives: ranked.slice(1),
          rawCount: igdbResults.length
        }, corsHeaders);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error.";

        return jsonResponse(400, {
          ok: false,
          error: message
        }, corsHeaders);
      }
    }

    return jsonResponse(404, {
      ok: false,
      error: "Not found. Use POST /search or GET /health."
    }, corsHeaders);
  }
};
