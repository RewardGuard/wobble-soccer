#!/usr/bin/env python3
"""How to plug in your own reward function — the whole point of the RL design.

    python examples/custom_reward.py

The env takes a ``reward_fn(prev_state, cur_state, info) -> float``.  Swap it and
nothing else changes: same spaces, same agent code.  Below is a possession-and-
shots-on-goal reward as an example.  See ``wobblesoccer/env.py`` for the default.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from wobblesoccer import SoccerEnv
from wobblesoccer.core import config as C


def my_reward(prev, cur, info) -> float:
    """Reward keeping the ball and getting it into the attacking third."""
    r = 0.0
    # goals still dominate
    r += 5.0 * float((cur.score[0] - prev.score[0]) - (cur.score[1] - prev.score[1]))
    # reward holding possession as team 0
    if cur.possession >= 0 and cur.team[cur.possession] == 0:
        r += 0.01
    # bonus when the ball sits in the attacking third (x > +third)
    if cur.ball_pos[0] > C.HALF_LENGTH / 3.0:
        r += 0.005
    return r


def main():
    env = SoccerEnv(match_seconds=15.0, reward_fn=my_reward)
    obs, info = env.reset(seed=0)
    rng = np.random.default_rng(0)
    total = 0.0
    while True:
        obs, r, term, trunc, info = env.step(rng.uniform(-1, 1, size=6).astype(np.float32))
        total += r
        if term or trunc:
            break
    print(f"custom-reward match: score {info['score']}, total custom reward {total:.3f}")
    env.close()


if __name__ == "__main__":
    main()
