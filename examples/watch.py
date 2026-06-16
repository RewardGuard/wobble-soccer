#!/usr/bin/env python3
"""Watch a trained policy play in the 3D window.

    python examples/watch.py --model ppo_wobble

This is the RL counterpart to ``play.py``: same game, same window, but the
agent is driven by a saved Stable-Baselines3 model instead of your keyboard.
It works because SoccerEnv supports ``render_mode="human"``.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from stable_baselines3 import PPO

from wobblesoccer import SoccerEnv


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=str, default="ppo_wobble")
    ap.add_argument("--seconds", type=float, default=60.0)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    model = PPO.load(args.model)
    env = SoccerEnv(match_seconds=args.seconds, render_mode="human")
    obs, info = env.reset(seed=args.seed)
    while True:
        action, _ = model.predict(obs, deterministic=True)
        obs, r, term, trunc, info = env.step(action)  # render happens inside step
        if term or trunc:
            obs, info = env.reset()
    # (close the window to quit)


if __name__ == "__main__":
    main()
