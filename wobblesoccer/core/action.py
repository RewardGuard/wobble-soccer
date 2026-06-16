"""The single action representation shared by humans, scripted AI and RL agents.

A raw action is a length-6 vector in [-1, 1] (a Gymnasium ``Box``):

    [0] move_x     desired move direction, x
    [1] move_z     desired move direction, z
    [2] aim_x      aim vector, x   (magnitude 0..1 -> kick power)
    [3] aim_z      aim vector, z
    [4] pass       trigger a pass  when > 0
    [5] shoot      trigger a shot  when > 0

The exact same vector is produced by the keyboard/mouse layer, by the built-in
AI and by a trained policy, so nothing in the core has to know who is playing.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

ACTION_DIM = 6
_EPS = 1e-6


@dataclass
class Intent:
    """A decoded, ready-to-apply control command for one player."""

    move: np.ndarray          # (2,) clipped to unit length, x/z
    aim_dir: np.ndarray       # (2,) unit vector, x/z (falls back to facing)
    power: float              # 0..1, scales kick speed
    do_pass: bool
    do_shoot: bool


def decode(raw, facing: np.ndarray) -> Intent:
    """Turn a raw length-6 action into an :class:`Intent`.

    ``facing`` is the player's current unit facing, used when the aim vector is
    too small to define a direction.
    """
    raw = np.asarray(raw, dtype=np.float64).reshape(-1)

    move = raw[0:2].copy()
    mlen = float(np.hypot(move[0], move[1]))
    if mlen > 1.0:
        move /= mlen

    aim = raw[2:4].copy()
    alen = float(np.hypot(aim[0], aim[1]))
    if alen > _EPS:
        aim_dir = aim / alen
        power = float(min(alen, 1.0))
    else:
        aim_dir = facing.copy()
        power = 0.0

    do_shoot = bool(raw[5] > 0.0)
    do_pass = bool(raw[4] > 0.0) and not do_shoot  # shooting wins ties
    return Intent(move=move, aim_dir=aim_dir, power=power,
                  do_pass=do_pass, do_shoot=do_shoot)


def encode(move=(0.0, 0.0), aim=(0.0, 0.0), do_pass=False, do_shoot=False):
    """Helper to build a raw action vector (used by the input layer)."""
    out = np.zeros(ACTION_DIM, dtype=np.float32)
    out[0], out[1] = move
    out[2], out[3] = aim
    out[4] = 1.0 if do_pass else -1.0
    out[5] = 1.0 if do_shoot else -1.0
    return out
