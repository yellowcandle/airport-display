---
name: Kai Tak Departure Board
description: A live, split-flap recreation of Hong Kong's old Kai Tak airport board.
colors:
  frame-marigold: "#D9A62B"
  board-black: "#0D0D0D"
  flap-face: "#1A1A1A"
  flap-cream: "#F5F3EC"
  label-olive: "#8A8577"
  status-label-cream: "#E9E4D4"
  hud-cream: "#F3E4BE"
  signal-red: "#E8261C"
  revised-red: "#FF5040"
  lamp-dim: "#4A1210"
  stage-black: "#050505"
typography:
  display:
    fontFamily: "Oswald, 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.06em"
  display-zh:
    fontFamily: "'TW-Kai', 'Kaiti TC', 'STKaiti', 'BiauKai', 'DFKai-SB', serif"
    fontSize: "30px"
    fontWeight: 700
    letterSpacing: "0.12em"
  drum:
    fontFamily: "'IBM Plex Mono', monospace"
    fontSize: "18px"
    fontWeight: 700
    letterSpacing: "normal"
  label:
    fontFamily: "Oswald, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.03em"
  status:
    fontFamily: "Oswald, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.06em"
rounded:
  hairline: "1px"
  frame: "2px"
  cell: "3px"
  pill: "999px"
spacing:
  cell-gap: "10px"
  board-pad: "18px 22px"
  frame-pad: "14px 18px 16px"
components:
  flap-cell:
    backgroundColor: "{colors.flap-face}"
    textColor: "{colors.flap-cream}"
    typography: "{typography.drum}"
    rounded: "{rounded.cell}"
    width: "20px"
    height: "28px"
  flap-cell-time:
    backgroundColor: "{colors.flap-face}"
    textColor: "{colors.revised-red}"
    typography: "{typography.drum}"
    rounded: "{rounded.cell}"
  airline-card:
    backgroundColor: "{colors.flap-cream}"
    rounded: "{rounded.cell}"
    width: "50px"
    height: "26px"
  hud-pill:
    backgroundColor: "#D9A62B1F"
    textColor: "{colors.hud-cream}"
    typography: "{typography.status}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  hud-pill-hover:
    backgroundColor: "{colors.frame-marigold}"
    textColor: "{colors.board-black}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
---

# Design System: Kai Tak Departure Board

## 1. Overview

**Creative North Star: "The Kai Tak Departures Hall, 1996"**

This is not a UI that references a split-flap board; it *is* one, rebuilt in the
browser and wired to live Hong Kong International Airport data. Every decision
answers to a single question — *would this have been on the wall at Kai Tak?* —
and the craft of the reconstruction is the entire product. A matte black board
sits inside a scuffed marigold frame under hall lighting; mechanical drum
characters clatter over from blank as today's real flights, gates, and
codeshares roll up the schedule. Bilingual by construction: English condensed
grotesque and Traditional-Chinese kaiti carry equal weight, exactly as the
airport authority printed them.

The system is dense, mechanical, and quiet in palette but loud in motion. Color
is almost entirely structural — near-black surface, cream characters, one
marigold frame — and is spent deliberately: red is reserved for things that are
happening *now* (a lit boarding lamp, a revised departure time). The delight is
not decoration; it is the mechanism. Flaps flip, rows cascade upward when a
flight departs, codeshares rotate, and each flap lands with a synthesized clack.

It explicitly rejects the modern airport-app idiom: no flat Material dashboard,
no glassmorphism-and-neon "departure board reimagined," no SaaS card grids,
eyebrow kickers, or hero-metric tiles. It also refuses skeuomorphic overkill —
no fake screws, no bevel soup. The realism is in the *behaviour and type*, not
in trompe-l'œil texture.

**Key Characteristics:**
- Physical artifact, not app skin — matte board in a marigold frame.
- Structural color: near-monochrome surface, red spent only on live events.
- Motion is the product: flip, cascade, rotate, clack.
- Bilingual parity — condensed grotesque + brush kaiti, equal weight.
- Fixed-canvas: the board is composed once and scaled whole to the viewport.

## 2. Colors

A near-monochrome mechanical surface — black board, cream characters — lit by a
single marigold frame, with red held in reserve for live events.

### Primary
- **Frame Marigold** (`#D9A62B`): The board's signature. The full outer frame,
  the bilingual masthead sits *in* black on top of it, and it is the accent for
  every interactive HUD control (links, sound toggle) and their hover fill. This
  is the one saturated color on screen; its scarcity elsewhere is what lets it
  read as "the frame."

### Secondary
- **Signal Red** (`#E8261C`): The boarding lamp when lit — the single dot at the
  end of a row that means *act now* (boarding / final call on departures; landed
  / at-gate on arrivals). Backed by a soft red glow.
- **Revised Red** (`#FF5040`): The revised/actual-time drums in the rightmost
  column (departure / arrival time). Slightly warmer and brighter than the lamp
  so a changed time reads as information, not alarm.

### Neutral
- **Board Black** (`#0D0D0D`): The board field — the surface everything mounts
  on. Also the ink for the masthead printed on the marigold frame.
- **Stage Black** (`#050505`): The wall behind the board (`body`), one step
  darker than the board so the frame reads as a mounted object.
- **Flap Face** (`#1A1A1A`): The face of every drum/flap cell at rest — a hair
  lighter than the board so the character grid stays legible without lines.
- **Flap Cream** (`#F5F3EC`): The printed character on every flap, and the light
  "sticker" behind airline logos. The workhorse ink.
- **Status Cream** (`#E9E4D4`): The small backlit bilingual status text
  (BOARDING 登機). Slightly dimmer than flap cream — it's a caption, not a drum.
- **HUD Cream** (`#F3E4BE`): Text inside the marigold-outlined HUD pills, warm
  enough to belong to the frame family.
- **Muted Olive** (`#8A8577`): Column captions only (flight / to / scheduled…).
  Deliberately recessive so the caption row never competes with the data.
- **Lamp Dim** (`#4A1210`): The unlit boarding lamp — a dark ember, present but
  off.

### Named Rules
**The Red-Means-Now Rule.** Red is forbidden as decoration. It appears in
exactly two places: a lit boarding lamp (`#E8261C`) and a revised time
(`#FF5040`). If red is on the board, something is happening to that flight right
now. Never tint a heading, border, or label red.

**The One-Frame Rule.** Marigold (`#D9A62B`) is the frame and the HUD accent —
nothing else. It is never a fill behind data, never a text color on the board
field. Its job is to be the object's edge.

## 3. Typography

**Display Font:** Oswald (with Arial Narrow, Helvetica Neue fallback)
**Data Font:** IBM Plex Mono
**Chinese Font:** TW-Kai (自由香港楷書), self-hosted, with system kaiti
fallbacks (Kaiti TC, STKaiti, BiauKai, DFKai-SB)

**Character:** A three-way pairing on hard contrast axes — a condensed grotesque
masthead, a fixed-width monospace for the mechanical drums, and a brush-stroke
kaiti for the Chinese. Nothing here is a "neutral UI sans"; each face is doing a
period-correct job, and the mono is load-bearing because monospace is what makes
a split-flap grid align.

### Hierarchy
- **Display / Masthead** (Oswald 700, 40px, tracking 0.06em, uppercase): the
  "AIRCRAFT DEPARTURES / AIRCRAFT ARRIVALS" board title, printed black on the
  marigold frame.
- **Display 中文** (TW-Kai 700, 30px, tracking 0.12em): the Chinese masthead
  (離港班機 / 抵港班機), black on the frame, set beside the English.
- **Drum** (IBM Plex Mono 700, 18px): every flap character — flight number,
  destination, times, gate. The fixed advance width is what lets characters
  stack into aligned columns.
- **Status** (Oswald 600 13px EN over TW-Kai 600 12px ZH, `#E9E4D4`): the
  small two-line backlit status label (BOARDING 登機, GATE CLOSED 閘口關閉).
- **Label** (Oswald 600 12px EN / TW-Kai 600 11px ZH, `#8A8577`): the
  bilingual column captions. Lowercase English, per the real Kai Tak captions.

### Named Rules
**The Monospace-Is-Structural Rule.** The drum column type must stay monospace.
The alignment of the board depends on every glyph having the same advance;
swapping in a proportional face breaks the grid, not just the look.

**The Bilingual-Parity Rule.** English and Traditional Chinese are never
decorative translations of each other — they share the row and the visual
weight. Chinese is always kaiti (TW-Kai), never a Noto/Hei sans.

## 4. Elevation

The board is a flat physical object with exactly one shadow. Everything inside
the board — flaps, cards, lamps, labels — is matte and flush; depth on the board
comes from the *mechanism* (the folding flap leaf, the lamp's glow), not from
box-shadows. The only elevation in the system is the frame casting onto the wall
behind it, which is what makes the whole board read as mounted hardware.

### Shadow Vocabulary
- **Frame drop** (`box-shadow: 0 12px 40px rgba(0,0,0,0.6)`): the marigold frame
  onto the stage-black wall. The single grounding shadow of the entire design.
- **Lamp glow** (`box-shadow: 0 0 8px 2px rgba(232,38,28,0.8)`): emitted, not
  cast — the red halo of a *lit* boarding lamp. Off when the lamp is dim.

### Named Rules
**The One-Shadow Rule.** The frame is the only element that casts. No flap, card,
button, or label gets a drop shadow. If depth is needed on the board, it is
expressed through the flap fold or an emitted glow, never a shadow.

## 5. Components

### Flap Cell (signature)
- **Character:** the atom of the whole board — a fixed-size mechanical drum that
  flips from its current glyph to the next through a folding leaf.
- **Shape:** 20×28px, gently cornered (3px), face `#1A1A1A`, glyph `#F5F3EC`.
- **Motion:** flips via a `rotateX` leaf fold, `ease-in`, stepping through drum
  characters one at a time; groups fan a string across N cells. Idempotent —
  unchanged cells don't flip.
- **Time variant:** identical cell, glyph in Revised Red (`#FF5040`), used only
  in the departure/arrival time column.
- **Reduced motion:** honours `prefers-reduced-motion` — cells snap straight to
  value and the board falls silent.

### Airline Card
- **Character:** a small light "sticker" carrying the carrier's real logo.
- **Style:** cream (`#F5F3EC`) plate, 50×26px, 3px corners, logo `object-fit:
  contain`. Logo source is the Aviasales CDN by IATA code, with a per-carrier
  self-hosted override map for stale/rebranded logos.
- **Fallback:** if the logo can't load, a brand-colored 2-letter chip shows
  through (per-airline background, contrast-appropriate text).

### Boarding Lamp
- **Style:** a 14px dot at the row's end. Dim ember (`#4A1210`) at rest; when the
  flight is live, Signal Red (`#E8261C`) with an 8px red glow.
- **Meaning:** lit === act now (boarding / final call; landed / at-gate).

### Status Label
- **Style:** two stacked lines of backlit text (not flaps) — Oswald English over
  kaiti Chinese, both `#E9E4D4`, centered in the status column. Plain text,
  updated in place; it does not flip.

### HUD Pill (navigation + sound toggle)
- **Character:** the only chrome that isn't "the board" — small marigold-outlined
  pills fixed to the corners of the wall.
- **Shape:** fully rounded (`999px`), 6×12px padding, IBM Plex Mono 13px,
  `#F3E4BE` text, 1px `#D9A62B` (60% alpha) border on a faint marigold wash.
- **States:** hover/focus fills solid marigold (`#D9A62B`) with black text.
  Positions: about (top-left), board-switch (top-right), sound toggle
  (bottom-left).

### Frame + Board (container)
- **Frame:** marigold field, near-square corners (2px), `14px 18px 16px` padding,
  the one drop shadow. Scaled *as a whole* to fit the viewport — the board never
  reflows; it's composed at native size and `transform: scale`-d.
- **Board:** board-black field inside the frame, 1px corners, `18px 22px` padding.

## 6. Do's and Don'ts

### Do:
- **Do** keep the drum column in **IBM Plex Mono** — the grid alignment depends
  on a fixed advance width.
- **Do** set all Chinese in **TW-Kai** kaiti (自由香港楷書); re-run
  `scripts/subset-kai-font.sh` after adding any new Chinese glyphs.
- **Do** spend **red only on live events** — a lit lamp (`#E8261C`) or a revised
  time (`#FF5040`). Nothing else.
- **Do** give English and Traditional Chinese **equal weight** on every row and
  label (the Bilingual-Parity Rule).
- **Do** honour `prefers-reduced-motion` — snap cells to value and silence the
  clack — for any new animated element.
- **Do** scale the whole board to fit; compose at native size, never reflow the
  grid responsively.

### Don't:
- **Don't** turn this into a **flat Material dashboard or app skin** — it is a
  physical artifact, not product UI.
- **Don't** use **glassmorphism, neon gradients, or the "departure board
  reimagined"** idiom — blurs and glass are banned here.
- **Don't** ship **SaaS clichés**: card grids, tiny tracked eyebrow kickers,
  hero-metric tiles, `01/02/03` section numbers.
- **Don't** add **skeuomorphic overkill** — no fake screws, heavy bevels, or
  drop-shadow soup. Realism lives in behaviour and type, not texture.
- **Don't** give any flap, card, button, or label a **drop shadow** — the frame
  is the only element that casts (the One-Shadow Rule).
- **Don't** set Chinese in **Noto / a Hei sans** — it must be kaiti.
- **Don't** use marigold as a **fill behind data** or a text color on the board
  field — it is the frame and HUD accent only (the One-Frame Rule).
