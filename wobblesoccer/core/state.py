"""The full simulation state as a plain, copyable data object.

A :class:`State` is everything you need to reconstruct a frame: ball, players,
who has the ball, the score and the clock.  It holds only numpy arrays / scalars
so it is cheap to copy (for reward functions that compare before/after) and easy
to flatten into an RL observation.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class State:
    # --- ball ---
    ball_pos: np.ndarray              # (3,) x, y, z
    ball_vel: np.ndarray              # (3,)

    # --- players (rows 0..team_size-1 are team 0, the rest are team 1) ---
    player_pos: np.ndarray            # (N, 3)
    player_vel: np.ndarray            # (N, 3)
    player_face: np.ndarray           # (N, 2) unit facing in the x/z plane
    team: np.ndarray                  # (N,) int 0 or 1
    kick_cooldown: np.ndarray         # (N,) seconds until the player can grab again

    # --- match bookkeeping ---
    possession: int                   # player index holding the ball, or -1
    active_player: int                # team-0 index the agent/human is driving
    score: np.ndarray                 # (2,) ints, [team0, team1]
    time_left: float                  # seconds remaining

    team_size: int = 5

    # convenience flags the renderer / reward can read without recomputing
    last_goal_team: int = -1          # which team just scored this step, else -1

    def copy(self) -> "State":
        return State(
            ball_pos=self.ball_pos.copy(),
            ball_vel=self.ball_vel.copy(),
            player_pos=self.player_pos.copy(),
            player_vel=self.player_vel.copy(),
            player_face=self.player_face.copy(),
            team=self.team.copy(),
            kick_cooldown=self.kick_cooldown.copy(),
            possession=self.possession,
            active_player=self.active_player,
            score=self.score.copy(),
            time_left=self.time_left,
            team_size=self.team_size,
            last_goal_team=self.last_goal_team,
        )

    @property
    def num_players(self) -> int:
        return self.player_pos.shape[0]

    def team_indices(self, t: int) -> np.ndarray:
        """Indices of the players on team ``t``."""
        return np.where(self.team == t)[0]
