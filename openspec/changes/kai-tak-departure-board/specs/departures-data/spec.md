# departures-data

## ADDED Requirements

### Requirement: Worker proxy endpoint
A Cloudflare Worker SHALL expose `GET /api/departures` that fetches the HKIA flight API (`https://www.hongkongairport.com/flightinfo-rest/rest/flights/past?date=<today HKT>&lang=en&cargo=false&arrival=false`) server-side and returns today's departure rows as trimmed JSON (`{flights: [{no, airline}], destIata, scheduled, terminal, aisle, gate, status}` per row). The Worker SHALL also serve the static site at `/`.

#### Scenario: Browser requests departures
- **WHEN** the page fetches `/api/departures`
- **THEN** it receives a 200 JSON response with today's (HKT) departure rows, regardless of the browser's `Origin` header

#### Scenario: Date boundary
- **WHEN** it is 00:30 HKT
- **THEN** the endpoint returns flights for the new HKT calendar day, not the viewer's local day

### Requirement: Upstream caching and failure handling
The Worker SHALL cache the upstream response for 60 seconds so concurrent viewers produce at most one upstream request per minute, and SHALL serve the last cached payload (marked `stale: true`) when the upstream request fails.

#### Scenario: Two tabs polling
- **WHEN** multiple clients hit `/api/departures` within the same minute
- **THEN** at most one request reaches the HKIA API

#### Scenario: HKIA API down
- **WHEN** the upstream fetch fails and a cached payload exists
- **THEN** the endpoint returns the cached rows with `stale: true`, and the client shows a subtle stale indicator without blanking the board

### Requirement: Destination name lookup
A static `destinations.json` SHALL map IATA airport codes to `{en, zh}` display names (Traditional Chinese) for destinations served from HKG. Unknown codes SHALL fall back to displaying the raw IATA code in English with a blank Chinese flap, and be logged to the console.

#### Scenario: Known destination
- **WHEN** a row has `destIata: "BKK"`
- **THEN** the board shows `BANGKOK` and `曼谷`

#### Scenario: New route not in table
- **WHEN** a row has an IATA code missing from the table
- **THEN** the board shows the raw code (e.g. `XYZ`), a blank Chinese flap, and logs the missing code

### Requirement: Status and embark mapping
API statuses SHALL be mapped to board vocabulary — empty → blank, `Est HH:MM` → `EST H.MM`, `Boarding`/`Boarding Soon` → `BOARDING`/`PREPARING`, `Final Call` → `FINAL CALL`, `Gate Closed` → `GATE CLOSED`, `Dep HH:MM` → `DEPARTED`, `Cancelled` → `CANCELLED` — and the embark column SHALL be computed as scheduled time minus 55 minutes.

#### Scenario: Estimated delay
- **WHEN** a flight's status is `Est 12:40`
- **THEN** the status cells show `EST 12.40`

#### Scenario: Embark computation
- **WHEN** a flight is scheduled at `9.00`
- **THEN** its embark column shows `8.05`

### Requirement: Codeshare rotation
When a flight has multiple codeshare flight numbers, the flight-number cell SHALL rotate through them, flapping to the next number roughly every 10 seconds; the airline card SHALL rotate in step.

#### Scenario: Codeshare flight displayed
- **WHEN** a row's flight list is `CX 880`, `AA 8933`
- **THEN** the flight cell alternates between the two numbers about every 10 seconds, flipping through the drum each time
