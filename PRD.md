# POV BOXING — Product Requirements Document

*Exercise 2 ("Your hands are the controller") — Tech, Data and AI in Gaming.*

## 1. One-liner
A first-person (POV), stylized-3D webcam boxing game where you build your own boxer and fight your way from a sweaty local gym to the world championship — using nothing but your real fists in front of the camera.

## 2. Goals & constraints
- **Hands are the only controller.** Webcam hand tracking only — no keyboard or mouse during gameplay (menus also navigable by hand; see §8).
- **Desktop web game**, runs in Chrome, shareable by URL.
- **Learnable in ~30 seconds**, minimal reading. Every move is shown once with an icon/animation in the tutorial.
- **Feels like a game, not a tech demo:** clear objective (win the title), responsive controls, strong hit feedback, restart/retry.
- **Traditional boxing.** Familiar rules, no fantasy powers. The fun comes from reading the opponent and timing.
- **Stable 30fps** game loop target.

## 3. Core loop
```
Create boxer → Career ladder → Walkout intro → FIGHT (up to 3 rounds)
      ↑                                            │
      └──── lose: retry same fight ◄───────────────┤
                                                   └─ win: unlock next venue/opponent → … → Title fight → Champion ending
```

**Inside a fight (the moment-to-moment loop):**
1. Opponent shows a **tell** (wind-up glow + pose) before every attack.
2. Player either **guards** (blocks, takes chip damage) or **parries** (swipes it away → opponent stunned).
3. During the **stun window** (~1.5s), player punches freely for bonus damage.
4. Opponent also punishes **spamming**: 4+ punches without guarding → opponent blocks and counter-punches.

## 4. Controls (hand gestures)

All thresholds are normalized by the player's calibrated hand size (§5) so they work at any distance.

| Move | Gesture | Detection (MediaPipe Hand Landmarker) | Phase |
|---|---|---|---|
| **Straight (jab/cross)** | Punch toward the camera | Hand bounding-box size grows ≥ 35% within ~150ms. Also counts if the hand was growing fast and then tracking is lost (motion blur). Left/right hand = left/right punch. | V1 |
| **Guard** | Both fists up in front of face | Both hands in the upper-center region of the frame, close together, held ≥ 150ms. | V1 |
| **Parry** | Open your hand and show your palm ✋ | 3+ straight fingers (fingertip farther from the wrist than the middle joint) for 2 frames. Punches only count from a closed fist, so the two moves can't be confused. Successful parry (late in the opponent's wind-up) → opponent stunned. | V1 |
| **Uppercut** | Punch upward from low | Fast upward wrist velocity starting from the lower half of the frame, with little size growth. | V2 |
| **Hook** | — | Dropped: a sideways-swipe hook was too easy to confuse with punches in testing. | — |

**Rules:**
- Per-hand cooldown ~250ms after a punch so one motion = one punch.
- An on-screen **move indicator** (small text/icon near the gloves) always shows what was detected — critical for player trust and debugging.
- Webcam preview shown small in a corner with landmarks drawn, toggleable.

## 5. Calibration (before the first fight, re-runnable from settings)
1. "Hold your guard up" (2s) → records the hands' resting size and position.
2. "Throw one punch" → records how much the hand grows.
3. Confirms with a ✅ and saves to localStorage.

Must handle: different lighting, distances, left-handed players (no assumptions about dominant hand).

## 6. Combat model
- **Player:** Health 100, regenerates slowly between rounds. Stamina is *not* tracked (keep it simple).
- **Damage:** Straight 6 · Uppercut 10 · Hook 9 · ×2 during stun window · Guarded hits deal 20% chip damage.
- **Opponent attacks:** each has a wind-up (tell) length, a damage value, and a target (high/body — visual only in V1).
- **Knockdowns:** when health hits 0, that boxer goes down. Referee counts to 10.
  - **Player down:** pump both fists up and down fast to fill a "get up" meter before 10. Each knockdown in a fight makes the meter harder. 3 knockdowns in a fight = KO loss.
  - **Opponent down:** gets up with partial health depending on the fight number; 3 knockdowns = KO win.
- **Rounds:** up to 3 rounds × 60s. If no KO, decided by judges (total damage dealt).
- **Between rounds:** 5s corner screen with a one-line tip from your trainer (e.g., "He drops his left before the hook!").

## 7. Career mode (5 fights)

| # | Venue | Opponent (archetype) | Behavior |
|---|---|---|---|
| 1 | **Basement gym** — concrete, one bulb, a few people watching | "Rusty" Vega — out-of-shape veteran | Slow, long tells, only straights |
| 2 | **Local club** — folding chairs, smoky, small crowd | Danny "Two-Step" Okafor — speedy amateur | Faster, starts double jabs |
| 3 | **Regional arena** — banners, stands half-full | Ivan "The Wall" Petrov — heavy guard | Blocks often; you must parry to open him up |
| 4 | **National championship** — packed arena, TV cameras | Marco "El Toro" Ruiz — brawler | Aggressive combos, signature: charging hook |
| 5 | **World title, Las Vegas–style** — lights, pyro, huge crowd | "King" Jordan Hayes — the champion | Mixes everything, short tells, feints (fake wind-ups) |

- **Win** → next fight unlocks, venue upgrades, short "headline" card ("Nobody saw it coming: [Nickname] stuns Rusty Vega!").
- **Lose** → stay on the same fight, retry. The trainer gives a tip about that opponent's tell.
- **Champion ending** → belt ceremony with your custom boxer, confetti, career stats (fights, knockdowns, punches thrown), "Play again" (new boxer).
- Progress saved to localStorage.

## 8. Boxer creator
Preset parts on a single screen (no freeform editor):
- Skin tone (6), face shape (4), hair (6 incl. bald), facial hair (4), eyebrows (3)
- Trunks color, glove color, robe color
- Name + nickname (pick from a list of fun nicknames, or randomize — no typing needed)

Each option swaps a mesh or a material on the shared 3D character (§9) — e.g., a different hair mesh, a skin color, a face texture — so the creator shows your boxer live on a slowly rotating turntable.

Your boxer appears on: the creator, career ladder, walkout scene (3D, camera orbits your boxer in the ring), fight posters, knockdown/round-win moments, the champion ending (3D belt ceremony). **In the fight itself** you see only your gloves (first person) in your chosen glove color.

**Menu navigation by hand:** a cursor follows the index fingertip; hovering a button for ~1s selects it (fill ring animation). Keyboard/mouse also work in menus as a fallback, but never in fights.

## 9. Presentation
- **View:** true 3D first person. The camera is at your boxer's eye height in the ring, with a gentle idle bob. Opponent stands in front of you; your 3D gloves are in the lower part of the view and follow your real hand positions (mapped from the webcam into 3D space, with smoothing).
- **Art style:** stylized low-poly 3D, Wii Sports / Mii-like — chunky, rounded, toy-like characters, bright saturated colors, soft lighting, toon/flat shading. Charming and readable, not realistic.
- **Characters — built in code, no imported models:** every boxer (player and opponents) uses **one shared procedural rig** made of simple primitives: sphere head, capsule torso, capsule upper/lower arms, sphere gloves, short legs. Face (eyes, brows, mouth, nose) is a canvas-drawn texture on the head, so expressions can change (normal, angry, hurt, dizzy). Opponents differ by body proportions (scale), colors, hair/beard meshes and face texture.
- **Animation — procedural, no animation files:** each state is a set of target joint rotations/positions that the rig tweens to (ease in/out). Punch = shoulder/elbow rotate + glove extends; block = gloves up to face; hit = head/torso snap back; knockdown = whole body tips over.
- **Opponent states:** idle (bobbing + bouncing on feet), wind-up (arm pulls back + fist glows emissive orange), attack, blocking, hit (left/right/up), stunned (wobble + dizzy stars), knocked down, KO.
- **Venues — built in 3D:** a shared ring (canvas, ropes, posts, corner pads) placed in a different environment per fight. Venue upgrades come from lighting, colors, props and crowd: basement (one point light, bare walls, 5–6 crowd figures) → title fight (spotlights, colored rim lights, banners, big crowd, pyro particles). Crowd = cheap low-poly figures or image billboards (instanced), animated with simple bobbing.
- **HUD:** HTML/CSS overlay on top of the 3D canvas — two health bars at top (player left, opponent right), round number + timer center, knockdown count pips, detected move indicator near the gloves.

### Game feel (must-haves)
- 60–80ms **hit-stop** on landed punches, larger on stun-window hits.
- **Camera shake/jolt** scaled to damage (head snaps back when you're hit); red vignette when the player is hit.
- Glove **impact flash** and a quick camera push-in on stun-window hits.
- Opponent face/body squash on impact, sweat/spit particles.
- Sound: glove impacts (3+ variants), whoosh on misses, block thud, parry "clang", crowd that swells with combos, bell, referee count, trainer voice lines (optional).
- Crowd size and loudness scale with the venue.

## 10. Screens / flow
1. **Title** — "Raise your fists to start" (camera permission prompt + guard pose starts the game).
2. **Calibration** (first time).
3. **Tutorial** — 3 quick drills: punch the pad, guard against a slow punch, parry a punch. ~30s total.
4. **Boxer creator.**
5. **Career ladder** — vertical ladder of 5 venues, your boxer's portrait on current rung.
6. **Walkout / intro card** — ring announcer style: "In the red corner…".
7. **Fight.**
8. **Between rounds** — corner tip.
9. **Result** — Win (headline card) / Lose (retry + tip).
10. **Champion ending.**
- **Pause:** hide both hands from the camera for 2s → pause menu.

## 11. Technical approach
- **Stack:** Single-page web app (React + TypeScript is fine for AI Studio; vanilla JS also fine). 3D rendering with **Three.js** on a WebGL canvas; HUD and menus as an HTML overlay.
- **Hand tracking:** `@mediapipe/tasks-vision` HandLandmarker, `numHands: 2`, running in VIDEO mode on the webcam feed, GPU delegate where available.
- **Gesture module** isolated from game logic: input = landmarks per frame, output = events (`STRAIGHT_L`, `STRAIGHT_R`, `GUARD_ON`, `GUARD_OFF`, `PARRY_L`, `PARRY_R`, later `UPPERCUT_*`, `HOOK_*`). Velocities smoothed over 3–4 frames.
- **Game loop:** fixed 30fps update; tracking may run at its own rate, game reads the latest events.
- **Debug overlay** (toggle with `D` key, dev only): landmarks, hand sizes, velocities, last detected event.
- **Hand → 3D mapping:** webcam x/y → glove x/y in front of the camera; hand size → glove depth. Mirror horizontally so it feels like a mirror. Lerp each frame to hide tracking jitter. On a detected punch, the glove plays an extension animation regardless of exact tracking so it always looks clean.
- **Assets:** almost everything generated in code (characters, ring, venues). Optional images: crowd billboard textures, banners, posters, title art. Sounds as small mp3/ogg files.
- **Performance budget** (hand tracking and 3D both use the GPU):
  - Target 30fps on a mid-range laptop; test on a weak laptop early.
  - Low-poly everything, ≤ ~100 draw calls; instance the crowd; max 1 shadow-casting light (or fake blob shadows).
  - Render at device pixel ratio capped at 1.5; tracking runs on a downscaled video (e.g. 640×480).
  - Quality setting (Low/High) that turns off shadows, reduces crowd and particles.
- **Persistence:** localStorage for boxer, calibration, career progress.
- **Hosting:** AI Studio share link / static host (GitHub Pages, Netlify, Vercel).

## 12. Build milestones
1. **Tracking core** — webcam + HandLandmarker, calibration, live readout of STRAIGHT / GUARD / PARRY. *Don't move on until this feels reliable.*
2. **3D scene + one fight** — Three.js ring, first-person camera, 3D gloves following your hands, one procedural opponent with tells, guard, parry → stun → counter, health bars, KO.
3. **Game feel** — hit-stop, shake, particles, sounds, crowd.
4. **Boxer creator** + hand-cursor menus.
5. **Career mode** — 5 opponents & venues, ladder, retry on loss, champion ending, save progress.
6. **Rounds & knockdowns** — timer, judges, 10-count with fist-pump get-up.
7. **V2 moves** — uppercut, then hook (only if detection stays reliable).
8. **Polish** — tutorial, trainer tips, test with friends on different computers & lighting.

## 13. Success criteria
- A friend who has never seen it understands how to play within 30 seconds.
- Detected move matches intended move ≥ 90% of the time in normal room lighting.
- Each opponent feels different, and the title fight feels like an event.
- Someone who loses wants to retry immediately.

## 14. Out of scope
- Multiplayer, online leaderboards, body/head tracking, stamina system, training minigames between fights, realistic 3D graphics, imported rigged models or motion-captured animations.
