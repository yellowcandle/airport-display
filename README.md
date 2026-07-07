# 啟德復古航班顯示牌 · Kai Tak Retro Flight Board

A web recreation of the iconic split-flap "AIRCRAFT DEPARTURES / 離港班機" board
from Hong Kong's old Kai Tak Airport, driven by **live** Hong Kong International
Airport (HKIA) departure data. It reproduces the vintage 1990s look — muted
marigold frame, black split-flap rows, bilingual header and column labels, red
boarding lamps, and `H.MM` dot times — while showing today's real flights
(actual gates, terminals, and codeshares) flipping through drum-style
character animations, with a roll-up cascade when a flight departs.

## Architecture

- `public/` — the static board: `index.html`, `board.css`, and vanilla-JS
  modules (`flap.js` split-flap engine, `board.js` layout/rendering,
  `data.js` polling + choreography), plus `destinations.json` (IATA → EN/ZH
  destination names).
- `worker.js` — a Cloudflare Worker that serves the static assets and proxies
  `GET /api/departures`. The proxy is mandatory: the HKIA flight-info API
  returns `403` to any request carrying an `Origin` header, so a browser can
  never call it directly. The Worker fetches server-side (no `Origin`), trims
  the payload, caches it at the edge for 60s, and falls back to its last
  cached copy (marked `stale: true`) when the upstream is unreachable.
- No framework, no build step, no bundler.

## Run locally

Requires [Wrangler](https://developers.cloudflare.com/workers/wrangler/)
(Cloudflare's Workers CLI) and Node.js.

```bash
npx wrangler dev
# or, if wrangler is installed globally:
wrangler dev
```

This serves the board at the printed local URL (typically
`http://localhost:8787`). The `/api/departures` proxy works locally because
the upstream fetch is server-side.

There is also a self-check for the Worker's Hong Kong-time date logic:

```bash
node scripts/check-hkt-date.mjs
```

## Deploy

Deploy the Worker (static assets + proxy) to Cloudflare with:

```bash
wrangler deploy
```

Configuration lives in `wrangler.toml` (the `[assets]` binding serves
`./public`; `/api/*` is routed to the Worker first). Roll back a bad deploy
with `wrangler rollback`.

## Data source & attribution

Flight data comes from the **Hong Kong International Airport flight information
API**, operated by the **Airport Authority Hong Kong** and published as open
data via **data.gov.hk**:

- Dataset: <https://data.gov.hk/en-data/dataset/aahk-team1-flight-info>
- Endpoint used (departures):
  `https://www.hongkongairport.com/flightinfo-rest/rest/flights/past?date=<YYYY-MM-DD>&lang=en&cargo=false&arrival=false`

The data is free and requires no API key. This project is an unofficial
tribute and is not affiliated with or endorsed by the Airport Authority Hong
Kong.
