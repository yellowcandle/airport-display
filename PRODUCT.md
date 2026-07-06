# PRODUCT.md — Kai Tak Departure/Arrivals Board

## Register

**Brand** — design *is* the product. This is a faithful visual recreation of a
physical artifact (the 1990s Kai Tak split-flap board), not an app that serves a
separate function. The craft of the recreation is the whole point.

## Purpose

A web recreation of the split-flap "AIRCRAFT DEPARTURES / 離港班機" board from
Hong Kong's old Kai Tak Airport, driven by **live** Hong Kong International
Airport (HKIA) open data. Real flights, gates, and codeshares flip through
today's schedule as they would have in the 1990s. A tribute piece.

## Target users

Aviation/Hong Kong nostalgics, designers, and passers-by. Viewed as ambient
display (large screen, glanceable) or briefly explored on desktop/mobile. No
task to complete — the experience is *watching the board flip*.

## Brand personality

Vintage · mechanical · bilingual · understated. The Solari/Kai Tak departures
hall: marigold frame, black split-flap rows, IBM Plex Mono drums, kaiti Chinese
(self-hosted TW-Kai 自由香港楷書), boarding-lamp red, `H.MM` dot times.

## Anti-references

- Modern flat airport-app UI / Material dashboards. This is not an app skin.
- Skeuomorphic overkill (fake screws, heavy bevels, drop-shadow soup).
- The 2020s "glassmorphism + neon gradient" departure-board reinterpretation.
- Generic SaaS polish (cards everywhere, eyebrow kickers, hero-metric tiles).

## Strategic design principles

1. **Authenticity over embellishment.** Every choice traces to the real board
   or the reference photos. When unsure, match the artifact.
2. **The mechanics are the delight.** Flap animation, roll-up cascade when a
   flight departs, codeshare rotation, the clack of the flips — motion is core,
   not decoration.
3. **Legible at a glance.** It's a departures board; a traveler must read it.
   High contrast cream-on-black, no decorative low-contrast text.
4. **Bilingual parity.** English and 繁體中文 carry equal weight, as on the real
   board.

## Accessibility

Body/label text holds WCAG AA against the black board. Reduced-motion users get a
calmer board (shorter/instant flips). Sound is off-first until a gesture and has
a visible mute toggle.

## Live config

No framework, no build step. Static assets in `public/` served by a Cloudflare
Worker (`worker.js`) that also proxies `GET /api/{departures,arrivals}` from
HKIA. Local dev: `npx wrangler@4 dev`. Deployed:
`airport-display.herballemon.workers.dev`.
