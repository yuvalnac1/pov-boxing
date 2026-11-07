# POV Boxing

First-person webcam boxing game — your hands are the controller. See [PRD.md](PRD.md) and [IMAGE_PROMPTS.md](IMAGE_PROMPTS.md).

## Run locally
The webcam only works on `localhost` or HTTPS, so serve the folder rather than opening the file:

```bash
npm install
npm run dev      # Vite dev server
npm run build    # static build in dist/
```

- **`/?dev`** — keyboard stand-in for testing without a camera: `F` / `J` left / right punch, `V` / `N` (or `Shift+F` / `Shift+J`) body shots, arrow keys to lean, `S` / `K` left / right parry (open hand), hold `Space` to block, `Space` stops the get-up marker after a knockdown. Add `&level=3` to jump to a career fight.
- **tracking-test.html** — the Milestone 1 gesture readout with meters, counters and a debug overlay (`D`).

## Controls
| Your hands | Move | Notes |
|---|---|---|
| ✊ Fist driven at the camera | **Punch** | Misses if the opponent has danced out of reach |
| ✋ Open one hand | **Parry** | Works late in his wind-up (or in the last 0.4s before impact). Too early = short lock-out. Fakes punish it |
| 🙌 Both fists up | **Block** | Stops most of a jab; hooks leak more, uppercuts split the guard |
| ⬇️ Punch low (fist below your guard) | **Body shot** | Less damage, goes under his high guard, slows his wind-ups |
| 🧍 Lean in / back | **Step in / sway** | Lean in to reach him (but his punches hurt more); lean back to sway out of range |
| ↔️ Lean left / right | **Slip** | Dodges jabs and uppercuts (not hooks). Any dodge = counter window (×1.5) |
| ⚡ Stamina bar | | Each punch costs stamina; it refills when you stop. Empty = weak punches |

Leaning uses MediaPipe Pose (shoulders + head), learned fresh at the start of each round, so stand normally during the intro.
`tracking-test.html` shows live lean values, body-shot detection and a "Set stance" button for tuning.

## v1.1 changes
- Harder fights: faster tells, more damage and HP, opponents counter off blocks and punish spam
- Ring movement: opponents circle, travel across the ring and step in/out of range; your view follows them
- Comic-book look: toon shading, inked outlines, red/blue corner rim lights, comic HUD
- Crowd: arms, standing up, fist pumps, bouncing to the beat, stadium waves; synthesized cheers, claps, whistles, "ooh"
- Synthesized fight-theme music (WebAudio step sequencer in `src/audio.js`)

## Status
| Milestone | State |
|---|---|
| 1. Tracking core (hand tracking, calibration, straight / open-palm parry / guard) | Built, needs real-webcam tuning |
| 2. 3D scene + one fight | Built |
| 3. Game feel (hit-stop, shake, sweat, pop-ups, synthesized sounds, crowd) | Built |
| 4. Boxer creator (look, gear, name; shown in walkout, champion ending, HUD, headlines, first-person gloves) | Built |
| 5. Career mode (5 venues and opponents, ladder, retry, champion ending) | Built |
| 6. Rounds and knockdowns (3 × 60s, judges, 10-count, timing-bar get-up: punch to stop the marker in the green) | Built |
| 7. V2 moves | Not started (the swipe-based hook was removed: it got confused with punches) |
| 8. Polish | Tutorial built (punch, guard, parry, counter drills with the coach; runs once after creating your boxer, replay from the ladder). Testing with friends not started |

## Graphics & performance
Three.js r169 with soft shadows, studio environment reflections, bloom, satin/leather/skin materials and smooth sculpted boxers.
The stage picks a quality tier automatically (`ultra` / `high` / `medium` / `low`): it starts at `high`, steps up after a steady
60fps, and steps down (bloom → resolution → shadows) if frames drop below ~45fps, so hand tracking and gameplay stay smooth.
`pov.stage.quality` in the console shows the current tier.

## Code
- `src/game.js` — screens and game flow, HUD, hand cursor for menus
- `src/creator.js` — boxer creator options, saved player, option rows
- `src/tutorial.js` — the training drills (same interface as a Fight, unit-tested)
- `src/fight.js` — fight rules and opponent AI (pure logic, unit-tested)
- `src/opponents.js` — the 5 career fights: venue, opponent look and AI tuning
- `src/stage.js`, `src/venues.js`, `src/boxer.js`, `src/gloves.js` — Three.js scene, venues, procedural boxer, first-person gloves
- `src/tracking.js`, `src/gestures.js`, `src/calibration.js`, `src/input.js` — webcam hand tracking → gesture events
- `src/audio.js` — synthesized sound effects
- `reference/` — the generated reference images for each fight (also used as ladder thumbnails)

## Tests
```bash
node --test tests/fight.test.mjs tests/gestures.test.mjs tests/tutorial.test.mjs
```

## Opponent headshots
The career ladder shows `public/portraits/{rusty,twostep,wall,toro,king}.png` (16:9, face centered) when they exist, and falls back to the old `reference/` thumbnails otherwise.
Prompts for all five are saved as image nodes on the canvas board ("Headshot — Fight N …"), ready to generate.
# pov-boxing
