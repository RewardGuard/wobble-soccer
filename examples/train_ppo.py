#!/usr/bin/env python3
"""Tiny end-to-end training proof with Stable-Baselines3 PPO.

    python examples/train_ppo.py                 # quick proof (~a few thousand steps)
    python examples/train_ppo.py --steps 200000  # an actually-competitive run

It uses the *default* MlpPolicy with no custom glue — the env's spaces are
standard Gymnasium ``Box`` spaces, so a stock agent just works.  After training
it runs one greedy match and prints the score so you can see it learned to play.

Watch a saved model afterwards with:
    python examples/watch.py --model ppo_wobble
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.env_util import make_vec_env

from wobblesoccer import SoccerEnv


def make_env():
    # short matches keep the proof fast; bump match_seconds for real training
    return SoccerEnv(match_seconds=20.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=4096,
                    help="total training timesteps (small default = quick proof)")
    ap.add_argument("--envs", type=int, default=4, help="parallel envs")
    ap.add_argument("--out", type=str, default="ppo_wobble", help="model save path")
    ap.add_argument("--rewardguard", action="store_true",
                    help="monitor reward components live via rewardguard.dev")
    args = ap.parse_args()

    vec = make_vec_env(make_env, n_envs=args.envs)
    model = PPO("MlpPolicy", vec, n_steps=256, batch_size=256, verbose=1)

    callback = None
    if args.rewardguard:
        from wobblesoccer.integrations import make_monitor, make_sb3_callback
        callback = make_sb3_callback(make_monitor(), check_freq=2048)
        print("RewardGuard monitoring enabled (rewardguard.dev)")

    print(f"\nTraining PPO for {args.steps} timesteps on WobbleSoccer...\n")
    model.learn(total_timesteps=args.steps, callback=callback)
    model.save(args.out)
    print(f"\nSaved model -> {args.out}.zip")

    # quick greedy match to show the trained policy actually drives the agent
    env = make_env()
    obs, info = env.reset(seed=0)
    total_r = 0.0
    while True:
        action, _ = model.predict(obs, deterministic=True)
        obs, r, term, trunc, info = env.step(action)
        total_r += r
        if term or trunc:
            break
    print(f"Greedy eval match -> score {info['score']}, return {total_r:.2f}")
    env.close()


if __name__ == "__main__":
    main()
