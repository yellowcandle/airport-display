# Tasks: Kai Tak Departure Board

## 1. Project scaffold & data layer

- [x] 1.1 Scaffold repo: `public/` dir, `worker.js`, `wrangler.toml` with static assets binding; verify `wrangler dev` serves a placeholder page
- [x] 1.2 Implement `/api/departures` in the Worker: fetch HKIA API for today (HKT), extract today's list, return trimmed rows `{flights, destIata, scheduled, terminal, aisle, gate, status}`
- [x] 1.3 Add 60s edge caching and stale-on-upstream-failure (`stale: true`) to the Worker; verify with repeated curls that upstream is hit at most once per minute
- [x] 1.4 Build `public/destinations.json`: IATA → `{en, zh}` for all destinations in a live API pull (~130 codes), Traditional Chinese names; script the extraction of unique codes from the API to seed the list

## 2. Split-flap engine

- [x] 2.1 Implement drum-mode cell in `flap.js`: CSS 3D half-flap structure, character drum stepping with per-cell randomized 70–110ms step timing, retarget-mid-flip safety, no-op on same value
- [x] 2.2 Implement card-mode cell (single printed flap) for airline codes and Chinese destination names, including flip-to-blank
- [x] 2.3 Self-check page/harness: a test row that flips through fixture values on click, verifying intermediate characters, desync ripple, and retargeting (spec scenarios in split-flap-engine)

## 3. Board skin

- [ ] 3.1 Build the board markup and CSS in `index.html`/`board.css`: yellow frame, black board, bilingual header (`AIRCRAFT DEPARTURES` / `離港班機`), bilingual column labels, 12-row grid matching reference photo proportions
- [ ] 3.2 Compose row cells per spec: airline card, flight drums, EN destination drums, ZH card, scheduled/check-in/status/embark drums, red lamp; wire lamp to boarding/final-call statuses
- [ ] 3.3 Implement `H.MM` time formatting and proportional whole-board scaling to window width; verify ~1280×800 fits 12 rows without scroll

## 4. Data mapping & choreography

- [ ] 4.1 Implement client data layer in `board.js`: 60s polling with jitter, status mapping to board vocabulary, embark = scheduled − 55min, destination lookup with raw-IATA fallback + console log for missing codes
- [ ] 4.2 Implement row selection: next 12 non-cancelled flights, keep DEPARTED rows visible ~2 min; initial flap-in from blank board
- [ ] 4.3 Implement diffing: in-place cell updates for gate/status/time changes (only affected cells flip); no animation on identical polls
- [ ] 4.4 Implement roll-up cascade: on row removal, rows below re-flap upward top-to-bottom with ~150ms stagger, newcomer flaps into bottom row; mid-board removal cascades only rows below
- [ ] 4.5 Implement codeshare rotation: flight cell + airline card rotate through codeshare list every ~10s

## 5. Polish & deploy

- [x] 5.1 Stale indicator (subtle, on `stale: true`) and HKT date-boundary handling verified around midnight logic (unit-style self-check with mocked clock) — `data.js` toggles `.is-stale` corner label; `scripts/check-hkt-date.mjs` asserts the HKT boundary logic (8/8 pass)
- [x] 5.2 Visual pass against the three reference photos: frame color, typography, spacing, lamp placement; tweak until it reads as Kai Tak — sharp frame corners, black header on yellow frame, lowercase column labels; verified via headless-Chrome render
- [x] 5.3a Add README with local-run/deploy instructions and API attribution (data.gov.hk / AAHK)
- [ ] 5.3b Deploy with `wrangler deploy`, verify live data on the deployed URL (NOT performed — deploy deferred per instruction)

## 6. Arrivals board (new scope — parallel "AIRCRAFT ARRIVALS / 抵港班機" page)

Second passenger-arrivals board mirroring the departures board's look, flap
engine, and data-pipeline conventions. Reuses `flap.js`, `destinations.json`,
and `airlines.json` unchanged (IATA/airline lookups are direction-agnostic).
Departures flow (`index.html`/`board.js`/`data.js`/`worker.js` departures path)
left behaviorally identical.

- [x] 6.1 Add `GET /api/arrivals` to `worker.js`: same HKT-date computation, 60s edge-cache + stale-fallback pipeline, factored into a shared `handleFlights(ctx, dir)` parameterized by a direction descriptor (`DEPARTURES`/`ARRIVALS`). Departures path is byte-identical (same URL string, same trim fields, `arrival=false`). Arrival rows trimmed to `{flights:[{no,airline}], originIata, scheduled, terminal, baggage, hall, stand, status}` — maps the arrival API's `origin[0]` → `originIata` (the live JSON literally uses `origin`, not `destination`, in arrival mode).
- [x] 6.2 Sampled the live arrivals API (`arrival=true&cargo=false`) to confirm real field names + status vocabulary. Confirmed fields: `origin[]`, `baggage` (reclaim belt, e.g. "14"), `hall` (A/B), `stand` (e.g. "D315"), `terminal` (empty for arrivals), `time`, `flight[]` (codeshare list), `status`, `statusCode` (always null). Distinct raw status strings: `""` (scheduled), `Est at HH:MM`, `Landed HH:MM`, `At gate HH:MM` (occasionally with a trailing `(DD/MM/YYYY)` for a previous-day arrival).
- [x] 6.3 New `public/arrivals.html`: structurally mirrors `index.html` (same fonts, `.stage > .frame > .board` skeleton, blank-first script pattern). Header "Aircraft Arrivals" / "抵港班機"; columns flight 班機 | from 來自 | scheduled 預定時間 | baggage 行李帶 | status 情況 (no check-in/embark columns — replaced by baggage reclaim belt). Board element `class="board kaitak arrivals"`.
- [x] 6.4 New `public/arrivals-board.css`: loaded after `board.css`, overrides only the column grid for the arrivals layout (drops check-in/embark, adds a baggage column and a wider 13-slot status column). All shared skin (frame, header, `.kaitak` flap theming, lamp, stale indicator) reused from `board.css`.
- [x] 6.5 New `public/arrivals-board.js` (`window.KaiTakArr`): adapted from `board.js`. Row = airline card, flight drums, origin EN drums (13 slots), origin ZH card, scheduled drums, baggage drums (3 slots), status drums (13 slots), lamp. Tiny helpers (`formatTime`, `fitBoard`) duplicated rather than shared so no departures file is touched and the two pages never load each other's scripts. Reuses `flap.js` as-is.
- [x] 6.6 New `public/arrivals-data.js` (parallel to `data.js`): 60s±jitter polling of `/api/arrivals`, same row-selection / roll-up-cascade / codeshare-rotation choreography. Arrival status vocabulary mapped to board strings: `""`→blank, `Est at HH:MM`→`EST H.MM`, `Landed HH:MM`→`LANDED H.MM`, `At gate HH:MM`→`AT GATE H.MM` (+ defensive `CANCELLED`/`DELAYED`/`DIVERTED`). Origin looked up in `destinations.json`, airline in `airlines.json`. Row expiry: an `AT GATE` (fully arrived) flight is kept visible ~2 min after first observed, then cascades off — the arrivals analogue of the departures `DEPARTED` grace period.
- [x] 6.7 Lamp-lit rule: lit when mapped status contains `LANDED` or `AT GATE` — i.e. the aircraft is on the ground and passengers/baggage are arriving now. This is the arrivals analogue of the departures lamp lighting during `BOARDING`/`FINAL CALL`: it flags the rows a viewer should act on immediately (head to the reclaim belt).
- [x] 6.8 Cross-page nav: small muted fixed-corner `.page-nav` link added to both pages (`index.html` → `抵港 arrivals →`, `arrivals.html` → `← departures 離港`), styled in `board.css` (purely additive rule, sits on the near-black stage outside the scaled frame so it never distorts).
- [x] 6.9 Verification: `node --check` passes on all JS; all 113 live-sampled origin IATA codes resolve in `destinations.json`; a real arrival row traced end-to-end (raw → worker trim → render model) renders correctly (e.g. `UO 671`/`CX 5671` codeshare from `NGO`→`NAGOYA`/`名古屋`, `AT GATE 23.38` = 13 chars, lamp lit). Departures path confirmed behaviorally unchanged. (Live `wrangler dev` smoke test not run — the local wrangler version predates the repo's modern `[assets]` schema and can't boot this `wrangler.toml`, a pre-existing env mismatch affecting departures too; `wrangler deploy` deferred per instruction.)
