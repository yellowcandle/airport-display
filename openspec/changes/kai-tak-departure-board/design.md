# Design: Kai Tak Departure Board

## Context

Greenfield repo containing only reference photos of the Kai Tak "AIRCRAFT DEPARTURES / 離港班機" board. Verified facts from exploration (2026-07-03):

- HKIA API: `GET https://www.hongkongairport.com/flightinfo-rest/rest/flights/past?date=<YYYY-MM-DD>&lang=<en|zh_HK>&cargo=false&arrival=false` returns the full day (~450 departures) including future flights. No key required. `www.hkairport.com` 301-redirects to `www.hongkongairport.com`.
- Per-flight fields: `time` (scheduled), `flight[]` (codeshares, each `{no, airline}`), `destination[]` (IATA codes only, even with `lang=zh_HK`), `terminal`, `aisle` (check-in row), `gate`, `status` (free text: empty = scheduled, `Est HH:MM`, `Boarding`, `Final Call`, `Gate Closed`, `Dep HH:MM`; Chinese equivalents with `lang=zh_HK`).
- **The API returns 403 to any request carrying an `Origin` header** — browser `fetch()` always sends one cross-origin, so direct client-side calls are impossible. A server-side proxy is mandatory.
- Target: laptop browser tab, deployed on Cloudflare. Modern data (real gates, T1/T2, codeshares) presented inside the vintage 1990s frame.

## Goals / Non-Goals

**Goals:**
- Visually faithful Kai Tak board: yellow frame, black rows, bilingual header, single-flap Chinese destinations, airline flaps, red boarding lamps, `H.MM` times.
- Convincing split-flap animation: per-character drums flipping through intermediate characters at slightly randomized speeds.
- Roll-up cascade on departure: rows re-flap upward top-to-bottom, new flight enters at the bottom.
- Live data, ~60s freshness, one HKIA request per minute regardless of viewer count.
- Zero build step; deployable with `wrangler deploy`.

**Non-Goals:**
- Arrivals board, mobile layout, offline mode, historical/replay mode.
- Per-character Chinese flap animation (the real board used one printed flap per destination — we match that).
- Pixel-perfect airline liveries for every carrier (text-code flap is the fallback).
- Any framework, bundler, or test harness beyond a few self-checks.

## Decisions

### D1: Single Cloudflare Worker serves everything
One Worker handles `/` (static assets via Workers Static Assets) and `/api/departures` (proxy). Alternative — GitHub Pages + separate CORS proxy — rejected: two deployables, and public CORS proxies are unreliable. The Worker fetch to HKIA omits the `Origin` header (server-side fetch doesn't add one), bypassing the 403.

### D2: Edge caching, 60s TTL
The Worker caches the upstream JSON (Cache API or `cf: { cacheTtl: 60 }`) keyed by date+lang. N open tabs still produce ≤1 upstream request/min. Client polls `/api/departures` every 60s with jitter.

### D3: Proxy reshapes data server-side
The Worker fetches `lang=en` (statuses in English match the vintage board vocabulary), extracts today's list, and returns a trimmed row array: `{flights: [{no, airline}...], destIata, scheduled, terminal, aisle, gate, status}`. Destination name lookup stays client-side (static JSON, cacheable forever). Alternative — raw passthrough — rejected: 450 flights × codeshares is ~200KB; trimmed is ~30KB.

### D4: Flap engine = vanilla JS + CSS 3D, DOM-based
Each character cell is a small DOM structure (top half / bottom half / flipping leaf) animated with `transform: rotateX` and CSS transitions, stepped through a character drum (`" ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./-"`) by JS timers. Randomized per-cell step duration (~70–110ms) desynchronizes cells like real Solari drums. Alternatives: canvas (harder text layout, no CSS styling reuse) and existing libs like flapper/split-flap-display (wrong aesthetic, dependency for something ~200 lines). A cell supports two modes: **drum mode** (per-character) and **card mode** (single printed flap that flips once — used for airline logo/code and Chinese destination).

### D5: Row identity keyed by flight number
Board state is a list of row models keyed by primary flight `no`. On each poll, compute the target top-N list; diff against current. If the top row's flight left the list (departed), trigger the cascade: for each row i from top, re-flap to row i+1's content with ~150ms stagger per row; bottom row flaps in the newcomer. Non-cascade changes (gate assigned, status change) re-flap only the affected cells.

### D6: Which flights are shown
Show the next N rows (N ≈ 12, whatever fits a laptop viewport) of flights that have not yet departed: status not starting with `Dep`/`Cancelled`, ordered by scheduled time. Keep a flight visible for ~2 min after its status flips to `Dep …` so viewers see the DEPARTED status before the cascade removes it.

### D7: Column mapping (vintage frame, modern data)
| Board column | Source |
|---|---|
| airline flap | `flight[0].airline` → logo image if available, else 2-letter code card |
| flight | `flight[0].no`; codeshares rotate through the cell every ~10s (authentic split-flap behavior) |
| to (EN) | curated `destinations.json`: IATA → `{en, zh}` (~130 entries, hand-built once; unknown IATA falls back to the raw code) |
| to (ZH) | same table, rendered as one card-mode flap |
| scheduled | `time` reformatted `HH:MM` → `H.MM` |
| check-in | `terminal` + `aisle` (e.g. `T1 A`) |
| status | API status uppercased (`BOARDING`, `FINAL CALL`, `GATE CLOSED`, `EST 12.40`, `DEPARTED`) |
| embark | computed: scheduled − 55 min (matches 1996 photo: 9.00 → 8.05) |
| red lamp | lit when status is boarding/final call |

### D8: File layout
```
public/index.html        board markup + skin CSS + flap engine + choreography (split into
public/board.css           css/js files, still no build step)
public/flap.js
public/board.js
public/destinations.json
public/logos/*.svg       optional, added incrementally
worker.js                proxy + static asset config
wrangler.toml
```

## Risks / Trade-offs

- [HKIA API changes shape or adds bot protection to server fetches] → Worker returns last cached payload on upstream failure; board shows a subtle "stale" indicator instead of blanking.
- [Destination table incomplete — new routes appear] → fall back to raw IATA code in the EN cell, blank ZH flap; log missing codes to console for easy curation.
- [DOM flap animation perf: ~12 rows × ~40 cells × 3 elements] → ~1.5k nodes, transitions are GPU-composited transforms; fine on a laptop. If a full-board cascade stutters, cap concurrent flipping cells (queue rows).
- [Chinese destination names need Traditional Chinese matching Kai Tak signage] → curate manually from HKIA's own zh_HK site naming; single JSON file makes corrections trivial.
- [Timezone: API day is HKT; viewer may be elsewhere] → all date math in `Asia/Hong_Kong` via `Intl.DateTimeFormat`; the board shows HKT like the real one did.

## Migration Plan

Greenfield: deploy Worker via `wrangler deploy` (repo on GitHub, optional CF git integration for CI deploys). Rollback = redeploy previous version (`wrangler rollback`). Local dev: `wrangler dev` (proxy works locally since the fetch is server-side).

## Open Questions

- Flap sound: add the clack (Web Audio, muted by default — browsers block autoplay) or skip entirely? Skippable for v1.
- Airline logo flaps: how many carriers get real artwork vs. text-code cards in v1? Proposal: text cards for all in v1, logos as a follow-up.
