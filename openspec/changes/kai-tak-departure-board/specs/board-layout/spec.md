# board-layout

## ADDED Requirements

### Requirement: Kai Tak visual frame
The board SHALL reproduce the Kai Tak departures board look: amber-yellow frame around a black board, header reading `AIRCRAFT DEPARTURES` on the left and `離港班機` on the right, and bilingual column labels (`flight 班機`, `to 前往`, `scheduled 預定時間`, `check-in 行李託運`, `status 情況`, `embark 入閘時間`) matching the reference photos in the repo root.

#### Scenario: Page loads
- **WHEN** the page is opened in a laptop browser
- **THEN** the yellow-framed bilingual board is visible without scrolling, with all six column groups and the row grid

### Requirement: Row cell composition
Each row SHALL contain, left to right: an airline card flap, a flight-number drum group, an English destination drum group, a Chinese destination card flap, a scheduled-time drum group, a check-in drum group, a status drum group, an embark-time drum group, and a red indicator lamp at the right edge.

#### Scenario: Flight rendered
- **WHEN** a flight `CX 713` to Bangkok scheduled `09:10` at terminal `T1` aisle `C`, status `Boarding`, is rendered
- **THEN** the row shows the airline card `CX`, `713` in the flight cells, `BANGKOK` and the single flap `曼谷` under "to", `9.10` under scheduled, `T1 C` under check-in, `BOARDING` under status, and `8.15` under embark

### Requirement: Dot-separated times
All times on the board SHALL be rendered as `H.MM` with a dot separator and no leading zero on the hour, matching the original board (e.g. `9.00`, `10.25`).

#### Scenario: Morning flight
- **WHEN** the API scheduled time is `09:05`
- **THEN** the board displays `9.05`

### Requirement: Boarding lamp
The red lamp at the row's right edge SHALL be lit when the flight's status is boarding or final call, and unlit otherwise.

#### Scenario: Boarding starts
- **WHEN** a row's status changes to `BOARDING`
- **THEN** its red lamp turns on

#### Scenario: Gate closed
- **WHEN** a row's status changes to `GATE CLOSED`
- **THEN** its red lamp turns off

### Requirement: Laptop viewport sizing
The board SHALL fit approximately 12 rows within a standard laptop viewport (~1280×800 and up) without vertical scrolling, scaling the board proportionally to the window width.

#### Scenario: Window resized
- **WHEN** the browser window is narrowed
- **THEN** the board scales down uniformly rather than wrapping or clipping columns
