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
