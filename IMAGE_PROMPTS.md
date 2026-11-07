# POV BOXING — Image Prompts

Use with Gemini (Nano Banana), ChatGPT, arena.ai/image or Leonardo. Generate several of each and keep the ones that match.

**Tip for a consistent look:** add the **style block** to the end of every prompt. Once you get one image you love, upload it as a reference with the next prompts ("same art style as the attached image").

> **Style block:** *Stylized low-poly 3D game, Wii Sports / Mii-like characters with chunky rounded toy-like bodies, sphere heads with simple cartoon faces, bright saturated colors, soft toon lighting, clean readable shapes, real-time WebGL game look (not a pre-rendered movie), 16:9 widescreen.*

The game builds its characters from simple 3D shapes in code, so keep prompts away from realistic or highly detailed characters — the closer the images are to "simple shapes, great lighting", the more faithfully the game can match them.

---

## 1. Moodboard
```
Create an image that is a moodboard for a desktop game. The game idea is a first-person webcam boxing game where you create your own boxer and rise from a gritty basement gym to a glamorous world championship in Las Vegas. Include color palettes for each venue (dim concrete gym → smoky local club → regional arena → packed national arena → neon title fight), character sketches of quirky boxer opponents, boxing gloves, championship belt, fight poster typography, and UI elements like health bars and round timers. [style block]
```

## 2. Gameplay screenshots (first-person fight)
Generate one per venue to "see" the whole career.

**Fight 1 — Basement gym**
```
Create an image that is a screenshot of a desktop game. The game idea is a first-person boxing game controlled by the player's real hands through a webcam. The view is from the player's eyes: two red boxing gloves in the lower left and right corners, and an out-of-shape, balding veteran boxer opponent in the center of a small ring in a gritty basement gym with concrete walls, one hanging light bulb and a few people watching. HUD: two health bars at the top, "ROUND 1" and a 0:47 timer in the middle, a small webcam preview window in the bottom-right corner showing a person with hand-tracking dots. [style block]
```

**Fight 2 — Local club (blocking a combo)**
```
Create an image that is a screenshot of a desktop game. The game idea is a first-person webcam boxing game. The view is from the player's eyes, with both gloves raised in front of the face in a guard, blocking. A fast, wiry young amateur opponent with a confident grin is mid double-jab, motion streaks behind his glove, a small "BLOCK" pop-up where the punch hits the gloves. Smoky local boxing club with folding chairs, a small crowd of about twenty people, string lights and hand-painted signs on brick walls. Health bars at the top, "ROUND 1" and a timer in the middle, small webcam preview in the corner. [style block]
```

**Fight 3 — Regional arena (parry moment)**
```
Create an image that is a screenshot of a desktop game. The game idea is a first-person webcam boxing game. The view is from the player's eyes, blue gloves in the lower corners. A huge, stoic heavyweight opponent in the center has just had his punch knocked aside and is stunned with cartoon dizzy stars over his head, a big "PARRY!" text pops on screen. Regional arena with banners and half-full stands. Health bars at the top, round 2 timer, small webcam preview in the corner. [style block]
```

**Fight 4 — National championship (big hit)**
```
Create an image that is a screenshot of a desktop game. The game idea is a first-person webcam boxing game. The player's glove is landing a punch on an aggressive bull-like brawler opponent, whose face squashes on impact with sweat droplets flying, a bright impact flash and slight motion blur. Packed national arena with TV cameras and spotlights. Health bars at the top, "ROUND 3", combo counter "x4". [style block]
```

**Fight 5 — World title (Las Vegas grand arena)** — attach `reference/fight4-national.jpg` as the base
```
Using the attached image as the base, keep exactly the same art style, camera angle, first-person gloves and HUD layout. Change only:
- Venue: an enormous, luxurious Las Vegas grand arena, about twice the size of the attached one. Mostly dark, with a gold and deep-red color scheme: gold trim around every tier, red velvet drapes, crystal chandeliers hanging from a very high ceiling, a huge four-sided video screen above the ring, gold "WORLD TITLE" banners, purple and gold spotlights sweeping, sparks fountaining from the four gold ring posts, a red carpet walkway. The crowd is dark silhouettes with hundreds of tiny white camera flashes.
- Opponent: a fictional champion (not a real person) — tall and muscular with a short beard and close-cropped hair, white trunks with gold trim, gold gloves, confident smirk. His right fist is pulled back and glowing bright orange (a warning that a punch is coming).
- HUD: two health bars and "TITLE FIGHT — ROUND 3" with one timer. No stamina bar.
```

## 3. Other screens

**Boxer creator**
```
Create an image that is a screenshot of a desktop game. The game idea is a boxing career game. This is the character creator screen: a young boxer stands in the center on a spotlighted platform, with large chunky selection panels on both sides for skin tone, face, hair, beard, trunks color and glove color shown as big icons. A glowing fingertip cursor with a circular loading ring is hovering over a button (the menu is controlled by hand tracking). A name tag at the bottom reads "KID 'THE SPARK' COHEN". [style block]
```

**Career ladder**
```
Create an image that is a screenshot of a desktop game. The game idea is a boxing career game. This is the career ladder screen: a vertical ladder of 5 venue cards from bottom to top — basement gym, local club, regional arena, national championship, world title in Las Vegas — each with its opponent's portrait. The bottom two are marked as won with a red "W" stamp, the third is glowing as the next fight, the top ones are locked and dark. The player's boxer portrait sits on the current rung. Gritty fight-poster typography. [style block]
```

**Walkout / fight intro card**
```
Create an image that is a screenshot of a desktop game. The game idea is a boxing career game. A dramatic pre-fight versus screen styled like a vintage boxing poster: the player's custom boxer on the left in a red robe, the opponent on the right, a big "VS" in the middle, names and nicknames in bold block letters, the venue name and "FIGHT 3 OF 5" at the bottom, spotlight beams and smoke. [style block]
```

**Knockdown / 10-count**
```
Create an image that is a screenshot of a desktop game. The game idea is a first-person webcam boxing game. The player has been knocked down: the view is tilted and blurry, looking up at the ring lights, a referee leans in holding up 7 fingers, a big "7" in the center, and a "PUMP YOUR FISTS TO GET UP!" meter half full at the bottom. [style block]
```

**Champion ending**
```
Create an image that is a screenshot of a desktop game. The game idea is a boxing career game. The victory screen: the player's custom boxer stands in the center of the ring holding a huge gold championship belt above his head, confetti falling, crowd cheering, camera flashes, big "WORLD CHAMPION" title text, and a small stats panel (fights won, knockdowns, punches thrown) and a "PLAY AGAIN" button. [style block]
```

## 4. Asset prompts (to use directly in the game)

The venues and characters are built in 3D code, so these images are mainly **visual references to upload alongside the PRD** (so the AI matches the look), plus a few flat textures the game can use directly.

**Venue lighting references** — one per venue; upload with the prompt that builds that venue.
```
A 3D render of an empty boxing ring from the point of view of a boxer standing in one corner, no people in the ring, [basement gym with concrete walls and one hanging bulb / smoky local club with folding chairs / regional arena with banners and half-full stands / packed national arena with TV cameras and spotlights / huge Las Vegas title-fight arena with neon and pyrotechnics]. Focus on the lighting mood and color palette. [style block]
```

**Opponent turnaround sheets** — reference for building each opponent from primitives.
```
A character turnaround sheet for a stylized low-poly 3D boxing game opponent built from simple shapes (sphere head, capsule body and arms, round gloves): [an out-of-shape balding veteran named "Rusty" Vega]. Front, side and back views, plus 4 small pose thumbnails: idle stance, winding up a punch with a glowing orange fist, blocking, dizzy with stars. Plain light-grey background, a few color swatches for skin, trunks and gloves. [style block]
```
Swap in: *a fast, wiry young amateur "Two-Step" Okafor* · *a huge stoic heavyweight "The Wall" Petrov* · *an aggressive bull-like brawler "El Toro" Ruiz* · *a confident gold-trimmed champion "King" Hayes*.

**Crowd billboard texture** (used directly in the game — drawn on flat panels in the stands)
```
A wide horizontal strip of a cheering boxing crowd, stylized low-poly 3D Mii-like spectators with simple faces, arms raised, varied colorful clothes, seen from the front, evenly lit, flat background, seamless and tileable left to right. [style block]
```

**Banners & posters** (textures for the arena walls)
```
A flat vintage-style boxing fight poster, bold block typography reading "TONIGHT: [OPPONENT NICKNAME]", two cartoon boxers facing off, worn paper texture, front-on with no perspective. [style block]
```

**Title screen / key art**
```
Key art for a boxing video game titled "POV BOXING": a determined young boxer from behind, gloves up, walking down a dark tunnel toward a blindingly bright arena full of lights, title text at the top, "RAISE YOUR FISTS TO START" at the bottom. [style block]
```
