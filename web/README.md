# Wobble Soccer — Web game (Three.js + TypeScript)

The playable game: a fast 2.5D arcade soccer match that runs in the browser.
Sprite footballers with shadows on a 3D pitch, a ball-following camera, a radar
minimap and a clean HUD — in the spirit of *Super Liquid Soccer*.

It shares its rules with the Python RL core: the simulation in [`src/sim/`](src/sim)
is a faithful port of [`../wobblesoccer/core`](../wobblesoccer/core), so the game
you play and the environment an agent trains in behave the same way.

## Run it

```bash
cd web
npm install
npm run dev          # open the printed http://localhost:5173 URL
```

Build a portable static bundle (deployable anywhere, itch.io/Poki-style):

```bash
npm run build        # outputs dist/
npm run preview      # serve the built bundle
```

## Controls

| input | action |
|------|--------|
| **W A S D** | move the controlled player (the one ringed in yellow; it auto-switches to whoever's nearest the ball) |
| **mouse** | aim — the farther the cursor from your player, the more powerful the kick |
| **Q** | pass |
| **E** | shoot (also kicks off / restarts) |
| **Esc** / **P** | pause |
| **R** | restart match |
| **T** | toggle AI-vs-AI demo (attract mode) |

## How it's built

```
web/src/
├── sim/            # deterministic game logic (ported from the Python core)
│   ├── config.ts   # all tunable constants
│   ├── rng.ts      # seedable RNG
│   ├── state.ts    # the clonable game state (used for render interpolation)
│   ├── action.ts   # the shared 6-d action encoding
│   ├── ai.ts       # scripted teammates & opponents (incl. goalkeepers)
│   └── sim.ts      # SoccerSim.step(): physics + rules, 30 Hz fixed step
├── render/         # Three.js
│   ├── textures.ts # procedural pitch / ball / shadow textures
│   ├── sprites.ts  # procedural animated footballer sprite sheets
│   └── scene.ts    # scene, goals, sprite players, ball, follow-camera
├── ui/             # DOM HUD + radar minimap
├── input.ts        # keyboard/mouse -> action (+ aim raycast)
└── main.ts         # fixed-timestep loop with 60fps render interpolation
```

The sim runs at a fixed 30 Hz and the renderer interpolates to the display
refresh rate, so play stays smooth without changing the physics.
