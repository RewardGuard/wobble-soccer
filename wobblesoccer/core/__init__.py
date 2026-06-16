"""Pure simulation core — no rendering, no RL, no global state.

Import :class:`SoccerSim` to run a deterministic match, or reach for the
:mod:`wobblesoccer.env` Gymnasium wrapper for training.
"""

from . import action, ai, config
from .sim import SoccerSim
from .state import State

__all__ = ["SoccerSim", "State", "config", "action", "ai"]
