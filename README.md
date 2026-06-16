# Wobble Soccer ⚽ · World Cup 2026

A 3D arcade soccer **World Cup** you play in the browser, plus a matching
**Gymnasium reinforcement-learning environment**. The two share one set of rules,
so the game a human plays and the environment an agent trains in behave the same.

- 🎮 **Play it** — a Three.js + TypeScript web game: pick a nation and play its
  matches in 3D (articulated players, real-time shadows, a packed stadium), with
  group stage → knockouts → **penalty shootouts** → the final. → **[`web/`](web)**
- 🤖 **Train on it** — a headless `gymnasium.Env` with standard `Box` spaces and a
  one-line, overridable reward. Trains with stock Stable-Baselines3 PPO. → **[`wobblesoccer/`](wobblesoccer)**

```
  WASD move   |   mouse aim   |   Q pass   |   E shoot   |   T auto-play
```

---

## Play the game (web)

```bash
cd web
npm install
npm run dev          # open the printed http://localhost:5173 URL
```

Pick one of 48 nations, then play your group games and knockout ties in 3D — the
rest of the tournament is simulated. You control the player ringed in yellow (it
auto-switches to whoever's nearest the ball); aim with the mouse (farther = harder
kick), **Q** to pass, **E** to shoot, **Esc** to pause, **T** to let the AI play
for you. Knockout draws go to a penalty shootout. Full details in
**[web/README.md](web/README.md)**.

---

## The RL environment (Python)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt           # numpy + gymnasium (+ SB3/torch for training)

python examples/train_ppo.py              # quick PPO proof (~seconds)
python examples/train_ppo.py --steps 500000 --rewardguard   # a real run, monitored
python examples/random_agent.py           # headless smoke test
python examples/custom_reward.py          # plug in your own reward
python tests/test_core.py                 # determinism + Gym-contract checks
```

### Why it's built this way

The rules live in a pure, deterministic, seedable simulation core with **zero
rendering or RL dependencies** — `step(action) -> state`, same seed + same actions
⇒ same game, always. Two thin layers sit on top:

- **`wobblesoccer/env.py`** — the Gymnasium `Env` (headless) used for training.
- **`web/src/sim/`** — a faithful TypeScript port of the core that drives the
  browser game, so play and training stay in sync.

---

## Plug in your own RL agent

The env is a stock `gymnasium.Env` with standard `Box` spaces, so a standard
agent trains with **no custom glue**.

```python
import gymnasium as gym
import wobblesoccer                 # registers the env ids
env = gym.make("WobbleSoccer-v0")   # or "WobbleSoccer7v7-v0"

# ...or construct it directly for full control:
from wobblesoccer import SoccerEnv
env = SoccerEnv(team_size=5, match_seconds=60.0, render_mode=None)
```

### Action space — `Box(-1, 1, shape=(6,))`

| index | meaning                                             |
|------:|-----------------------------------------------------|
| 0     | move x                                               |
| 1     | move z                                               |
| 2     | aim x   *(vector magnitude 0–1 sets kick power)*     |
| 3     | aim z                                                |
| 4     | pass  — triggered when `> 0`                         |
| 5     | shoot — triggered when `> 0` (wins ties vs. pass)    |

### Observation space — `Box(shape=(15 + 5·N,))`, `N = 2·team_size`

A flat, normalized vector (65 dims for 5-a-side):

- ball position `(x, y, z)` and velocity `(x, y, z)`
- for every player: position `(x, z)` and velocity `(x, z)`
- possession flag `[team0_has_ball, team1_has_ball]`
- one-hot of the player the agent is currently controlling
- goal locations (opponent goal, own goal)
- score `[team0, team1]` and time remaining

The agent always plays as **team 0** (attacking +x), controlling the team-0
player nearest the ball (auto-switching). Teammates and all opponents are
scripted AI.

### Override the reward (one obvious place)

The reward lives in **one clearly-marked spot** at the top of
[`wobblesoccer/env.py`](wobblesoccer/env.py) (`default_reward`): `+1` for scoring,
`-1` for conceding, plus small shaping toward possession and attacking progress.
To use your own, just pass a function — nothing else changes:

```python
from wobblesoccer import SoccerEnv

def my_reward(prev, cur, info) -> float:
    # prev/cur are State objects (ball_pos, player_pos, score, possession, ...)
    scored   = (cur.score[0] - prev.score[0]) - (cur.score[1] - prev.score[1])
    have_ball = cur.possession >= 0 and cur.team[cur.possession] == 0
    return 5.0 * scored + (0.01 if have_ball else 0.0)

env = SoccerEnv(reward_fn=my_reward)
```

### Monitor your reward with RewardGuard (built-in, optional)

Shaping terms are easy to over-tune, and agents love to farm shaping instead of
scoring. This project has a first-class integration with
[rewardguard.dev](https://rewardguard.dev) for watching the live reward signal
and catching reward hacking during training.

It works because every `step()` puts a per-component breakdown in
`info["reward_components"]` (`goal`, `progress`, `possession`, `engage`). Feeding
that to a monitor is the whole integration:

```bash
pip install rewardguard
```

```python
from wobblesoccer import SoccerEnv
from wobblesoccer.integrations import make_monitor, summarize

env = SoccerEnv()
monitor = make_monitor()                       # expects goals to dominate
obs, info = env.reset(seed=0)
for _ in range(10_000):
    obs, r, term, trunc, info = env.step(env.action_space.sample())
    monitor.step(info["reward_components"])     # <- that's it
    if term or trunc:
        obs, info = env.reset()
print(summarize(monitor.check()))              # flags shaping that drowns out goals
```

With Stable-Baselines3, drop in the ready-made callback — or just pass
`--rewardguard` to the training example:

```python
from wobblesoccer.integrations import make_monitor, make_sb3_callback
model.learn(total_timesteps=500_000, callback=make_sb3_callback(make_monitor()))
```

```bash
python examples/train_ppo.py --steps 50000 --rewardguard
```

A custom `reward_fn` can expose its own components too by returning
`(total, {"component": value, ...})` instead of a plain float — they'll show up
in `info["reward_components"]` and flow straight to RewardGuard.

### Copy-pasteable Stable-Baselines3 example

```python
import wobblesoccer                       # registers env ids
from stable_baselines3 import PPO
from stable_baselines3.common.env_util import make_vec_env
from wobblesoccer import SoccerEnv

env = make_vec_env(lambda: SoccerEnv(match_seconds=30.0), n_envs=8)
model = PPO("MlpPolicy", env, verbose=1)
model.learn(total_timesteps=500_000)
model.save("ppo_wobble")
```

---

## Controls (web game)

| input | action |
|------|--------|
| **W A S D** | move the controlled player (auto-switches to whoever's nearest the ball) |
| **mouse** | aim passes/shots — distance from your player = power |
| **Q** | pass |
| **E** | shoot (also kicks off / restarts) |
| **Esc** / **P** | pause &nbsp;·&nbsp; **R** restart &nbsp;·&nbsp; **T** AI demo |

## Project structure

```
wobble-soccer/
├── web/                        # the playable World Cup game (Three.js + TS)
│   ├── src/sim/                # match rules ported from the Python core (parity)
│   ├── src/render/             # 3D players, stadium, shadows, follow-camera
│   ├── src/tournament/         # group draw, standings, knockouts, quick-sim
│   ├── src/data/teams.ts       # the 48 nations
│   ├── src/ui/                 # HUD, radar minimap, World Cup screens
│   ├── src/shootout.ts         # interactive penalty shootout
│   └── README.md               # how to run / build the web game
├── requirements.txt
├── wobblesoccer/               # the RL side (headless)
│   ├── __init__.py             # exports SoccerEnv; registers Gym ids
│   ├── env.py                  # gymnasium.Env + the overridable reward
│   ├── integrations/
│   │   └── rewardguard.py      # optional rewardguard.dev reward monitoring
│   └── core/                   # PURE sim — no rendering, no RL
│       ├── config.py           # all tunable constants
│       ├── state.py            # the copyable State object
│       ├── action.py           # the shared 6-d action encoding
│       ├── sim.py              # SoccerSim.step(): physics + rules
│       └── ai.py               # scripted teammates & opponents
├── examples/
│   ├── train_ppo.py            # tiny PPO training proof (+ --rewardguard)
│   ├── random_agent.py         # smallest env smoke test
│   └── custom_reward.py        # reward-override demo
└── tests/
    └── test_core.py            # determinism + Gym-contract checks
```

## Requirements

- **Play:** Node 18+ (`web/`, installs Three.js + Vite via `npm install`)
- **Train:** Python 3.9+, `numpy`, `gymnasium` (+ `stable-baselines3`, `torch`,
  optional `rewardguard` for the training example) — see [`requirements.txt`](requirements.txt)
