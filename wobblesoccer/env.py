"""Gymnasium wrapper around the pure :class:`~wobblesoccer.core.sim.SoccerSim`.

This is the thin RL layer.  It defines the observation/action spaces, flattens
state into a vector, and applies a reward.  Nothing here changes the rules — the
rules live entirely in the core, so a policy trained against this env and a human
playing in the 3D window are competing in the exact same game.

    import gymnasium as gym
    from wobblesoccer.env import SoccerEnv

    env = SoccerEnv()                 # headless, fast (no rendering imports)
    obs, info = env.reset(seed=0)
    obs, reward, terminated, truncated, info = env.step(env.action_space.sample())
"""

from __future__ import annotations

from typing import Callable, Optional

import numpy as np
import gymnasium as gym
from gymnasium import spaces

from .core import config as C
from .core.action import ACTION_DIM
from .core.sim import SoccerSim
from .core.state import State

# Scales used to normalise the observation into a friendly range for an MLP.
_BALL_VEL_SCALE = 30.0
_OBS_CLIP = 10.0


# ==========================================================================
#  REWARD FUNCTION  --  THIS IS THE ONE PLACE TO EDIT YOUR REWARD
# ==========================================================================
# The agent always plays as TEAM 0 (it attacks +x).  A reward function takes
# the state *before* and *after* a step plus the info dict, and returns a float.
#
# To use your own, just pass it in:  SoccerEnv(reward_fn=my_reward)
# Signature:  my_reward(prev: State, cur: State, info: dict) -> float
#
# Tip: keep shaping terms small relative to GOAL_REWARD so the agent can't farm
# shaping instead of scoring.  Tools like https://rewardguard.dev help you watch
# the live reward signal and catch reward hacking while you train.
# --------------------------------------------------------------------------
GOAL_REWARD = 1.0          # scoring (+) / conceding (-) — the real objective
POSSESSION_BONUS = 0.002   # small nudge for team 0 holding the ball
PROGRESS_WEIGHT = 0.01     # reward moving the ball toward the opponent goal (+x)
NEAR_BALL_WEIGHT = 0.0005  # gently encourage the controlled player to engage


def reward_components(prev: State, cur: State, info: dict) -> dict:
    """Per-step *breakdown* of the default reward (team 0's perspective).

    Returning named pieces instead of one opaque number is what makes the
    rewardguard.dev integration trivial: each term can be watched separately so
    you can see if shaping is drowning out the actual goal signal.  The env puts
    this dict in ``info["reward_components"]`` every step.
    """
    goals_for = int(cur.score[0] - prev.score[0])
    goals_against = int(cur.score[1] - prev.score[1])

    possession = POSSESSION_BONUS if (cur.possession >= 0 and
                                      cur.team[cur.possession] == 0) else 0.0
    progress = PROGRESS_WEIGHT * float(cur.ball_pos[0] - prev.ball_pos[0])
    ap = cur.active_player
    d = float(np.hypot(cur.player_pos[ap, 0] - cur.ball_pos[0],
                       cur.player_pos[ap, 2] - cur.ball_pos[2]))
    return {
        "goal": GOAL_REWARD * (goals_for - goals_against),  # the real objective
        "possession": possession,                           # shaping
        "progress": progress,                               # shaping
        "engage": -NEAR_BALL_WEIGHT * d,                    # shaping
    }


def default_reward(prev: State, cur: State, info: dict) -> float:
    """The default, easily-overridable reward (team 0's perspective)."""
    return float(sum(reward_components(prev, cur, info).values()))
# ==========================================================================


class SoccerEnv(gym.Env):
    """A small-sided arcade-soccer environment.

    Parameters
    ----------
    team_size : players per side (5 -> 5-a-side, 7 -> 7-a-side).
    match_seconds : length of an episode in simulated seconds.
    render_mode : ``"human"`` opens a 3D window; ``None`` is fast and headless.
    reward_fn : override the reward; defaults to :func:`default_reward`.
    """

    metadata = {"render_modes": ["human"], "render_fps": int(round(1.0 / C.DT))}

    def __init__(self,
                 team_size: int = C.TEAM_SIZE,
                 match_seconds: float = C.MATCH_SECONDS,
                 render_mode: Optional[str] = None,
                 reward_fn: Optional[Callable[[State, State, dict], float]] = None):
        super().__init__()
        self.team_size = int(team_size)
        self.match_seconds = float(match_seconds)
        self.render_mode = render_mode
        self.reward_fn = reward_fn or default_reward

        self.sim = SoccerSim(team_size=self.team_size,
                             match_seconds=self.match_seconds)
        self._renderer = None  # lazily created only when rendering

        N = self.team_size * 2
        obs_dim = 6 + 4 * N + 2 + N + 4 + 2 + 1
        self.observation_space = spaces.Box(
            low=-_OBS_CLIP, high=_OBS_CLIP, shape=(obs_dim,), dtype=np.float32)
        # [move_x, move_z, aim_x, aim_z, pass, shoot], all in [-1, 1]
        self.action_space = spaces.Box(
            low=-1.0, high=1.0, shape=(ACTION_DIM,), dtype=np.float32)

    # ---------------------------------------------------------------- gym API
    def reset(self, *, seed: Optional[int] = None, options: Optional[dict] = None):
        super().reset(seed=seed)
        self.sim.reset(seed=seed)
        return self._get_obs(), self._get_info()

    def step(self, action):
        action = np.clip(np.asarray(action, dtype=np.float32), -1.0, 1.0)
        prev = self.sim.state.copy()
        cur = self.sim.step(action)
        info = self._get_info()

        # Compute reward, and always expose a per-component breakdown in info so
        # monitors (e.g. rewardguard.dev) can watch each term.  A custom reward_fn
        # may also return (total, {component: value}) to expose its own breakdown.
        if self.reward_fn is default_reward:
            components = reward_components(prev, cur, info)
            reward = float(sum(components.values()))
        else:
            res = self.reward_fn(prev, cur, info)
            if isinstance(res, tuple):
                reward = float(res[0])
                components = {k: float(v) for k, v in res[1].items()}
            else:
                reward = float(res)
                components = {"reward": reward}
        info["reward_components"] = components

        truncated = cur.time_left <= 0.0       # episode ends when the clock runs out
        terminated = False
        if self.render_mode == "human":
            self.render()
        return self._get_obs(), reward, terminated, truncated, info

    def render(self):
        if self.render_mode != "human":
            return
        if self._renderer is None:
            from .render.view import Renderer  # imported only when actually rendering
            self._renderer = Renderer(self.team_size)
        self._renderer.sync(self.sim.state)
        self._renderer.pump()

    def close(self):
        if self._renderer is not None:
            self._renderer.close()
            self._renderer = None

    # ----------------------------------------------------------- observation
    def _get_obs(self) -> np.ndarray:
        s = self.sim.state
        N = s.num_players
        parts = []

        # ball position (x, y, z) and velocity, normalised
        parts += [s.ball_pos[0] / C.HALF_LENGTH,
                  s.ball_pos[1] / C.GOAL_HEIGHT,
                  s.ball_pos[2] / C.HALF_WIDTH]
        parts += [s.ball_vel[0] / _BALL_VEL_SCALE,
                  s.ball_vel[1] / _BALL_VEL_SCALE,
                  s.ball_vel[2] / _BALL_VEL_SCALE]

        # every player: x/z position and velocity (players never leave the ground)
        for i in range(N):
            parts += [s.player_pos[i, 0] / C.HALF_LENGTH,
                      s.player_pos[i, 2] / C.HALF_WIDTH,
                      s.player_vel[i, 0] / C.PLAYER_MAX_SPEED,
                      s.player_vel[i, 2] / C.PLAYER_MAX_SPEED]

        # possession flag: which side holds the ball
        team0_has = 1.0 if (s.possession >= 0 and s.team[s.possession] == 0) else 0.0
        team1_has = 1.0 if (s.possession >= 0 and s.team[s.possession] == 1) else 0.0
        parts += [team0_has, team1_has]

        # one-hot of the body the agent is currently driving
        active = np.zeros(N, dtype=np.float32)
        active[s.active_player] = 1.0
        parts += list(active)

        # goal locations (constant, but included as the spec asks)
        parts += [C.HALF_LENGTH / C.HALF_LENGTH, 0.0,     # opponent goal (attack +x)
                  -C.HALF_LENGTH / C.HALF_LENGTH, 0.0]    # own goal

        # score and time remaining
        parts += [s.score[0] / 10.0, s.score[1] / 10.0]
        parts += [s.time_left / max(self.match_seconds, 1e-6)]

        obs = np.asarray(parts, dtype=np.float32)
        return np.clip(obs, -_OBS_CLIP, _OBS_CLIP)

    def _get_info(self) -> dict:
        s = self.sim.state
        return {
            "score": (int(s.score[0]), int(s.score[1])),
            "possession": int(s.possession),
            "possession_team": int(s.team[s.possession]) if s.possession >= 0 else -1,
            "active_player": int(s.active_player),
            "time_left": float(s.time_left),
            "last_goal_team": int(s.last_goal_team),
        }
