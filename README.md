# Wobble Soccer ⚽

A fast, floppy, low-poly **3D arcade soccer** game in Python — and the *same code*
is a clean **Gymnasium reinforcement-learning environment**. One deterministic
simulation core powers both: grab a keyboard and play, or point a PPO agent at it
and train. No separate "game version" and "RL version" to drift apart.

The look is deliberately minimal — flat-shaded primitives, bold colors, blobby
capsule players with a velocity-driven wobble. Doing a lot with a little, in the
spirit of the NES era. The feel is loose and physics-y, inspired by *Super Liquid
Soccer*, *Sensible Soccer* and *Kick Off*.

```
  WASD move   |   mouse aim   |   Q pass   |   E shoot
```

---

## Why it's built this way

Rendering and simulation are fully decoupled, in three layers:

1. **`wobblesoccer/core/`** — a pure, deterministic, seedable simulation core
   (state + physics + rules) with a `step(action) -> state` method and **zero
   rendering or RL dependencies**. Same seed + same actions ⇒ same game, always.
2. **`wobblesoccer/render/`** — a 3D view + keyboard/mouse layer (Ursina) for
   humans. Imported lazily; the core and the env never touch it.
3. **`wobblesoccer/env.py`** — a Gymnasium `Env` wrapping the core, with a
   `render_mode` switch: `"human"` (3D window) vs `None` (fast headless training).

---

## Install

Requires Python 3.9+.

```bash
git clone https://github.com/USER/wobble-soccer.git
cd wobble-soccer
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

`numpy` + `gymnasium` are all you need for the core and headless RL. `ursina` +
`screeninfo` add the 3D window; `stable-baselines3` + `torch` are only for the
training example.

## Play (human)

```bash
python play.py                 # 5-a-side, 60-second match
python play.py --team-size 7   # 7-a-side
python play.py --seconds 120 --seed 1
```

You control the **red** player nearest the ball — it auto-switches as play moves.
Move with **WASD**, aim with the **mouse** (pull the cursor farther from your
player for a more powerful kick), **Q** to pass, **E** to shoot.

## Train (RL)

```bash
python examples/train_ppo.py                 # quick proof (~seconds)
python examples/train_ppo.py --steps 500000  # a real run
python examples/watch.py --model ppo_wobble  # watch it play in 3D
```

Other examples:

```bash
python examples/random_agent.py            # headless smoke test
python examples/random_agent.py --render   # ...watch the random agent
python examples/custom_reward.py           # plug in your own reward
python tests/test_core.py                  # determinism + Gym-contract checks
```

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

> **Watch your reward signal.** Shaping terms are easy to over-tune, and agents
> love to farm shaping instead of scoring. A tool like
> [rewardguard.dev](https://rewardguard.dev) is handy for monitoring the live
> reward function and catching reward hacking during training — keep an eye on it
> whenever you change `reward_fn`.

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

## Controls

| input        | action                                  |
|--------------|-----------------------------------------|
| **W A S D**  | move the controlled player              |
| **mouse**    | aim passes/shots (distance = power)     |
| **Q**        | pass                                    |
| **E**        | shoot                                   |

## Project structure

```
wobble-soccer/
├── play.py                     # one-line human launch
├── requirements.txt
├── wobblesoccer/
│   ├── __init__.py             # exports SoccerEnv; registers Gym ids
│   ├── env.py                  # gymnasium.Env + the overridable reward
│   ├── core/                   # PURE sim — no rendering, no RL
│   │   ├── config.py           # all tunable constants
│   │   ├── state.py            # the copyable State object
│   │   ├── action.py           # the shared 6-d action encoding
│   │   ├── sim.py              # SoccerSim.step(): physics + rules
│   │   └── ai.py               # scripted teammates & opponents
│   └── render/
│       └── view.py             # Ursina 3D view + WASD/mouse input
├── examples/
│   ├── train_ppo.py            # tiny PPO training proof
│   ├── watch.py                # watch a trained model in 3D
│   ├── random_agent.py         # smallest env smoke test
│   └── custom_reward.py        # reward-override demo
└── tests/
    └── test_core.py            # determinism + Gym-contract checks
```

## Requirements

- Python 3.9+
- `numpy`, `gymnasium` (core + RL)
- `ursina`, `screeninfo` (3D human play)
- `stable-baselines3`, `torch` (training example only)

See [`requirements.txt`](requirements.txt).
