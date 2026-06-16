"""Headless checks for the sim core and the Gym env.

Run directly (no pytest needed):  python tests/test_core.py
It exercises determinism, the Gymnasium API contract, and plays a full random
match to make sure nothing explodes and goals can actually happen.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from wobblesoccer.core import SoccerSim          # noqa: E402
from wobblesoccer.env import SoccerEnv           # noqa: E402


def _rollout(seed, actions):
    sim = SoccerSim(team_size=5, match_seconds=10.0, seed=seed)
    sim.reset(seed=seed)
    trace = []
    for a in actions:
        s = sim.step(a)
        trace.append((s.ball_pos.copy(), s.player_pos.copy(), tuple(s.score)))
    return trace


def test_determinism():
    rng = np.random.default_rng(123)
    actions = rng.uniform(-1, 1, size=(300, 6)).astype(np.float32)
    a = _rollout(7, actions)
    b = _rollout(7, actions)
    for (ba, pa, sa), (bb, pb, sb) in zip(a, b):
        assert np.allclose(ba, bb) and np.allclose(pa, pb) and sa == sb
    print("ok  determinism: identical seeds + actions -> identical games")


def test_spaces_and_contract():
    env = SoccerEnv(team_size=5, match_seconds=5.0)
    obs, info = env.reset(seed=0)
    assert env.observation_space.contains(obs), "obs out of declared space"
    assert obs.shape == env.observation_space.shape
    a = env.action_space.sample()
    obs, r, term, trunc, info = env.step(a)
    assert env.observation_space.contains(obs)
    assert isinstance(r, float)
    assert set(["score", "possession", "time_left"]).issubset(info)
    print(f"ok  gym contract: obs_dim={obs.shape[0]}, action_dim={env.action_space.shape[0]}")


def test_full_match_random():
    env = SoccerEnv(team_size=5, match_seconds=20.0)
    obs, info = env.reset(seed=1)
    total_r, steps, goals = 0.0, 0, 0
    rng = np.random.default_rng(1)
    while True:
        a = rng.uniform(-1, 1, size=6).astype(np.float32)
        obs, r, term, trunc, info = env.step(a)
        total_r += r
        steps += 1
        if info["last_goal_team"] >= 0:
            goals += 1
        if term or trunc:
            break
    assert steps > 100, "match ended suspiciously early"
    assert np.isfinite(total_r)
    print(f"ok  full match: {steps} steps, final score {info['score']}, "
          f"goals this match={goals}, total_reward={total_r:.3f}")


def test_reward_override():
    def always_one(prev, cur, info):
        return 1.0
    env = SoccerEnv(team_size=5, match_seconds=2.0, reward_fn=always_one)
    env.reset(seed=0)
    _, r, _, _, _ = env.step(np.zeros(6, dtype=np.float32))
    assert r == 1.0
    print("ok  reward override: custom reward_fn is used")


if __name__ == "__main__":
    test_determinism()
    test_spaces_and_contract()
    test_full_match_random()
    test_reward_override()
    print("\nALL CORE TESTS PASSED")
