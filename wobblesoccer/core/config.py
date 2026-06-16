"""Tunable constants for the simulation core.

Everything here is plain data with **zero rendering / RL dependencies** so the
same numbers drive a headless training run and a 3D window alike.  Coordinate
system (matches the renderer):

    x : along the pitch, goal-to-goal.  Team 0 attacks +x, team 1 attacks -x.
    z : across the pitch (touchline to touchline).
    y : up.  The ball is fully 3D (it can fly and bounce); players slide on y=0.
"""

from __future__ import annotations

# --- Pitch geometry -------------------------------------------------------
HALF_LENGTH = 20.0            # x in [-20, 20]  -> 40 long
HALF_WIDTH = 13.0             # z in [-13, 13]  -> 26 wide
GOAL_HALF_WIDTH = 4.0         # goal mouth is 8 wide, centred on z=0
GOAL_HEIGHT = 4.0             # a shot must be below this to count (generous/arcade)
WALL_RESTITUTION = 0.65       # how bouncy the boards are

# --- Ball physics ---------------------------------------------------------
BALL_RADIUS = 0.4
GRAVITY = 22.0                # units / s^2, snappy rather than realistic
GROUND_RESTITUTION = 0.55     # vertical bounce energy kept
BALL_GROUND_DAMP = 0.97       # per-step horizontal damping while rolling
BALL_AIR_DAMP = 0.999         # per-step damping while airborne

# --- Players --------------------------------------------------------------
PLAYER_RADIUS = 0.7
PLAYER_MAX_SPEED = 8.5
PLAYER_ACCEL = 60.0           # units / s^2 toward the desired velocity
PLAYER_PUSH = 0.6             # how hard overlapping players shove apart

# --- Possession / dribbling ----------------------------------------------
CAPTURE_RADIUS = 1.3          # player-centre to ball-centre to gain control
CAPTURE_HEIGHT = 2.0          # ball must be below this to be controllable
DRIBBLE_OFFSET = 1.0          # ball sits this far ahead of the dribbler
KICK_COOLDOWN = 0.35          # seconds the kicker cannot re-capture the ball

# --- Kicks (power scales with aim magnitude in [0, 1]) --------------------
PASS_SPEED_MIN = 9.0
PASS_SPEED_MAX = 17.0
PASS_LOFT = 1.0               # small upward component on a pass
SHOOT_SPEED_MIN = 15.0
SHOOT_SPEED_MAX = 27.0
SHOOT_LOFT = 3.0             # shots get a bit of air

# --- AI -------------------------------------------------------------------
SHOOT_RANGE = 14.0            # distance to goal at which the AI tries a shot
AIM_NOISE = 0.06             # radians of aim jitter so the AI isn't perfect
CHASE_LEAD = 0.18            # seconds of ball-velocity lead when chasing

# --- Match ----------------------------------------------------------------
DT = 1.0 / 30.0               # fixed simulation timestep (30 Hz)
MATCH_SECONDS = 60.0
TEAM_SIZE = 5                 # 5-a-side by default (set 7 for 7-a-side)
