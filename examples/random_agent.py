#!/usr/bin/env python3
"""Smallest possible env smoke test: play a match with random actions.

    python examples/random_agent.py            # headless, prints the result

No training dependencies required (numpy + gymnasium only).  To *play* the game
with graphics, run the web app in ``web/`` instead (see the README).
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from wobblesoccer import SoccerEnv


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=30.0)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    env = SoccerEnv(match_seconds=args.seconds)
    obs, info = env.reset(seed=args.seed)
    total_r, steps = 0.0, 0
    while True:
        obs, r, term, trunc, info = env.step(env.action_space.sample())
        total_r += r
        steps += 1
        if term or trunc:
            break
    print(f"match over: {steps} steps, score {info['score']}, return {total_r:.3f}")
    env.close()


if __name__ == "__main__":
    main()
