"""Wobble Soccer — a low-poly arcade soccer game that is also a Gym env.

Two ways in:

    from wobblesoccer import SoccerEnv          # the RL environment
    from wobblesoccer.core import SoccerSim     # the bare deterministic core

The env is also registered with Gymnasium, so this works too:

    import gymnasium as gym
    import wobblesoccer                          # registers the ids
    env = gym.make("WobbleSoccer-v0")
"""

from __future__ import annotations

from gymnasium.envs.registration import register

from .core import SoccerSim, State
from .env import SoccerEnv, default_reward

__all__ = ["SoccerEnv", "SoccerSim", "State", "default_reward"]

register(
    id="WobbleSoccer-v0",
    entry_point="wobblesoccer.env:SoccerEnv",
    kwargs={"team_size": 5},
)
register(
    id="WobbleSoccer7v7-v0",
    entry_point="wobblesoccer.env:SoccerEnv",
    kwargs={"team_size": 7},
)
