# Next Up IGDB Worker (Phase 1)

Cloudflare Worker proxy for IGDB search.

Deployed endpoint:

- `https://next-up-igdb-proxy.next-up-igdb.workers.dev`

## Endpoints

- `GET /health`
- `POST /search`

Request body for `/search`:

```json
{
  "query": "Elden Ring",
  "limit": 10
}
```

Response shape:

```json
{
  "ok": true,
  "query": "Elden Ring",
  "selected": {
    "id": 119171,
    "name": "Elden Ring",
    "imageUrl": "https://images.igdb.com/...",
    "imageId": "co4jni",
    "releaseDate": 1645747200,
    "totalRating": 95.2,
    "confidence": 98
  },
  "alternatives": [],
  "rawCount": 10
}
```

## Local setup

1. Install deps:

```bash
npm install
```

2. Create `.dev.vars`:

```bash
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
```

3. Run:

```bash
npm run dev
```

## Notes

- Credentials are never exposed to the frontend.
- CORS is controlled by `ALLOWED_ORIGINS` in `wrangler.toml`.
- `search` uses retry/backoff for IGDB throttling and transient failures.

## Troubleshooting

- If `/search` returns `Token request failed (400)`, the worker can reach Twitch but the credentials are invalid or missing.
- Ensure both secrets are set in Cloudflare Worker:
  - `TWITCH_CLIENT_ID`
  - `TWITCH_CLIENT_SECRET`
- If your request tool sets `Origin`, it must be host-only (for example `http://localhost:5173`) and never include a path.
