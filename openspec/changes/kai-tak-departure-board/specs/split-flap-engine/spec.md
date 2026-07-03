# split-flap-engine

## ADDED Requirements

### Requirement: Character drum cells
The engine SHALL render text as rows of character cells, where each cell animates between characters by flipping through the intermediate characters of a fixed drum sequence (`" ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./-"`), never jumping directly to the target character.

#### Scenario: Cell changes value
- **WHEN** a cell displaying `A` is set to `D`
- **THEN** the cell visibly flips through `B` and `C` before settling on `D`

#### Scenario: Character outside the drum
- **WHEN** a cell is set to a character not in the drum sequence
- **THEN** the cell settles on the blank character instead of looping forever

### Requirement: Desynchronized flip timing
Each cell SHALL flip at its own randomized step duration (roughly 70–110ms per character step) so that simultaneous updates across cells do not animate in lockstep.

#### Scenario: Whole row updates at once
- **WHEN** all cells in a row are given new targets in the same frame
- **THEN** cells finish at different times, producing a ripple rather than a synchronized swap

### Requirement: Card-mode flaps
The engine SHALL support single-flap "card" cells that flip once between whole printed faces (used for airline logos/codes and Chinese destination names), with the same visual flap mechanics as drum cells.

#### Scenario: Chinese destination changes
- **WHEN** a card cell showing `曼谷` is set to `東京`
- **THEN** the cell performs a single top-to-bottom flip revealing `東京` as one unit

#### Scenario: Card cleared
- **WHEN** a card cell is set to an empty value
- **THEN** it flips to a blank black face

### Requirement: Idempotent updates
Setting a cell to its current value SHALL produce no animation, and setting a new target mid-flip SHALL retarget the ongoing animation without visual glitches or orphaned timers.

#### Scenario: Same value re-applied
- **WHEN** a poll returns unchanged data and every cell is re-set to its current value
- **THEN** no cell flips

#### Scenario: Retarget mid-flip
- **WHEN** a cell flipping toward `M` is given the new target `C`
- **THEN** the flip continues around the drum to `C` and exactly one animation loop remains active for that cell
