# Wobble Soccer — World Cup 2026 (web game)

A 3D arcade soccer **World Cup** that runs in the browser. Pick one of 48 nations
and play its matches in 3D — articulated low-poly players with real-time shadows,
a packed stadium (stands, crowd, floodlights, ad boards), filmic lighting — while
every other match is simulated from team strength. Knockout ties go to a
**penalty shootout** you play yourself.

Built with Three.js + TypeScript + Vite. Its match rules are a faithful port of
the Python RL core in [`../wobblesoccer/core`](../wobblesoccer/core), so the game
you play and the environment an agent trains in behave the same.

## Run it

```bash
cd web
npm install
npm run dev          # open the printed http://localhost:5173 URL
```

Build a portable static bundle (deployable anywhere):

```bash
npm run build        # outputs dist/
npm run preview
```

## How to play

1. **Pick your nation** from the 48-team grid.
2. **Group stage** — play your 3 group matches in 3D; the rest auto-simulate. Top
   2 of each group + the 8 best third-placed teams advance (32).
3. **Knockouts** — Round of 32 → 16 → QF → SF → Final. Win or go home; a draw
   after full time goes to a **penalty shootout**.
4. Lift the trophy. 🏆

### Match controls

| input | action |
|------|--------|
| **W A S D** | move the controlled player (ringed in yellow; auto-switches to whoever's nearest the ball) |
| **mouse** | aim — farther from your player = more power |
| **Q** / **E** | pass / shoot |
| **Esc** / **P** | pause |
| **T** | auto-play (let the AI play your match) |

### Shootout controls

Click a numbered zone of the goal (or press **1–6**). You **shoot** for your team
and **dive** for the opponent's. Best of 5, then sudden death.

## How it's built

```
web/src/
├── sim/             # deterministic match logic (ported from the Python core)
├── render/
│   ├── player3d.ts  # articulated 3D footballer (procedural) + animation
│   ├── stadium.ts   # tiered stands, instanced crowd, floodlights, ad boards
│   ├── textures.ts  # procedural pitch / ball textures
│   └── scene.ts     # scene, shadows, lighting, follow-camera
├── data/teams.ts    # the 48 nations (colours + strength)
├── tournament/      # group draw, standings, knockouts, quick-sim
├── ui/              # HUD, radar minimap, World Cup screens
├── shootout.ts      # interactive penalty shootout
└── main.ts          # orchestrator: menu ↔ match ↔ shootout ↔ bracket
```

The match sim runs at a fixed 30 Hz and the renderer interpolates to the display
refresh rate. The nations field is an approximation of the 2026 line-up — edit
`data/teams.ts` to taste.

## Drop-in model slots

Every visual piece has a **slot**: drop a glTF at the path below and it's used
automatically; leave it empty and the game uses a built-in **procedural
placeholder**. Nothing custom ships with the repo — populate the slots with your
own or clearly-licensed models (e.g. modelled yourself, [Mixamo](https://www.mixamo.com),
or CC0 from Quaternius / KayKit).

| Slot file (`web/public/models/…`) | What it replaces | Placeholder if empty |
|---|---|---|
| `player.glb` | outfield player (rigged; **run** + **idle** clips) | bundled `Xbot.glb` |
| `gk.glb` | goalkeeper (rigged) | the player model |
| `referee.glb` | referee (rigged) | none |
| `goal.glb` | goal | procedural posts + net |
| `stadium.glb` | stadium | procedural stands + crowd |
| `bench.glb` | dugout/bench | none |

Players are scaled to height and **tinted per team** by body region (head = skin,
torso = jersey, shorts, socks, boots), so a plain/grey model works best. Static
props (goal/stadium) are auto-scaled to fit the pitch. Example:

```bash
cp my_player.glb   web/public/models/player.glb
cp my_keeper.glb   web/public/models/gk.glb
cp my_goal.glb     web/public/models/goal.glb
cp my_stadium.glb  web/public/models/stadium.glb
```

## Credits

The default animated player model (`public/models/Xbot.glb`) is the rigged
humanoid from the [three.js](https://github.com/mrdoob/three.js) example assets
(MIT-licensed). Everything else — pitch, stadium, ball, UI — is procedural.
