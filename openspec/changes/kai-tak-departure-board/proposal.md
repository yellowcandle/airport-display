# Kai Tak Departure Board

## Why

Recreate the iconic split-flap "AIRCRAFT DEPARTURES / 離港班機" board from Kai Tak Airport (see reference photos `273e3b52764549cc9a57ad14a3cce144.jpg`, `images.jpg`, `images1.jpg` in the repo root) as a web page showing **live** Hong Kong International Airport departures. The nostalgia is the yellow frame and bilingual flaps; the delight is the roll-up cascade when a flight departs.

## What Changes

- New static web page: full-skeuomorphic Kai Tak board (yellow frame, black split-flap rows, bilingual header/columns, red boarding lamps, `H.MM` dot times).
- Vanilla-JS split-flap engine: per-character drum animation with intermediate characters and randomized flip speeds; single printed flaps for airline codes and Chinese destination names.
- Roll-up cascade: when a flight departs, each row re-flaps to the row below it, top-to-bottom staggered; a new flight flaps in at the bottom.
- Live data from the HKIA flight info API (data.gov.hk / hongkongairport.com), polled ~60s, showing modern reality (real gates, T1/T2, codeshare rotation) inside the vintage frame.
- Cloudflare Worker: serves the static page and proxies `/api/departures` (the HKIA API 403s any request carrying an `Origin` header, so browsers cannot call it directly), with ~60s edge caching.
- Curated IATA → destination name lookup table (English + Traditional Chinese) for the ~130 destinations served from HKG.

## Capabilities

### New Capabilities
- `split-flap-engine`: Character-drum flap animation for text cells and single-flap cells (airline code, Chinese destination), including flip mechanics, stagger, and randomized timing.
- `board-layout`: The Kai Tak visual skin — frame, header, columns (flight / to / scheduled / check-in / status / embark), lamps, typography, laptop-browser sizing.
- `departures-data`: Fetching, proxying, caching, and mapping HKIA API data into board rows (destination lookup, status mapping, embark computation, codeshare rotation).
- `board-choreography`: Row lifecycle — which flights are shown, the departure roll-up cascade, periodic refresh behavior.

### Modified Capabilities

_None — greenfield project._

## Impact

- New codebase: static `index.html` + CSS + vanilla JS, one Cloudflare Worker, one destinations JSON table. No framework, no build step.
- External dependency: HKIA flight info API (`https://www.hongkongairport.com/flightinfo-rest/rest/flights/past?date=<YYYY-MM-DD>&lang=<en|zh_HK>&cargo=false&arrival=false`). Free, no key, one call returns the full day including future flights.
- Deployment: Cloudflare (Worker or Pages + Function). GitHub Pages alone is not viable because of the Origin-header block.
