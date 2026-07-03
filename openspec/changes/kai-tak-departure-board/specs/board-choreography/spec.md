# board-choreography

## ADDED Requirements

### Requirement: Row selection
The board SHALL display the next N (default 12) departures ordered by scheduled time, excluding cancelled flights and flights whose status became `DEPARTED` more than 2 minutes ago. A flight that just departed SHALL remain visible showing `DEPARTED` for ~2 minutes before being removed.

#### Scenario: Flight departs
- **WHEN** the top row's status changes to `DEPARTED`
- **THEN** the row shows `DEPARTED` and stays on the board for about 2 minutes before the cascade removes it

#### Scenario: Board population on load
- **WHEN** the page first loads at 14:00 HKT
- **THEN** the board fills with the next 12 not-yet-departed flights from 14:00 onward, flapping in from blank

### Requirement: Roll-up cascade
When a displayed flight is removed, every row below it SHALL re-flap to the content of the row beneath it, proceeding top-to-bottom with a per-row stagger (~150ms), and the next upcoming flight SHALL flap into the bottom row.

#### Scenario: Top row expires
- **WHEN** the top flight is removed from the display list
- **THEN** row 1 re-flaps to row 2's flight, row 2 to row 3's, and so on with visible top-to-bottom stagger, and a new flight flaps into the bottom row

#### Scenario: Mid-board removal
- **WHEN** a flight in the middle of the board is removed (e.g. cancelled)
- **THEN** only the rows below it cascade up; rows above it do not flip

### Requirement: In-place cell updates
Changes to a displayed flight that do not alter row order (gate assigned, status change, estimated time) SHALL re-flap only the affected cells, leaving the rest of the row and board untouched.

#### Scenario: Gate assigned
- **WHEN** a poll returns a gate for a flight that previously had none
- **THEN** only that row's gate/check-in cells flip; no other cell on the board animates

### Requirement: Polling cadence
The client SHALL poll `/api/departures` every 60 seconds (with small jitter), apply changes as diffs against current board state, and continue silently retrying on failed polls without clearing the board.

#### Scenario: Poll returns no changes
- **WHEN** consecutive polls return identical data
- **THEN** the board performs no animations

#### Scenario: Poll fails
- **WHEN** a poll request fails
- **THEN** the board keeps its current contents and retries on the next cycle
