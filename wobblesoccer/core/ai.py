"""Lightweight scripted AI.

Produces a raw action vector (see :mod:`action`) for every player.  The
simulation then overwrites the one row belonging to the agent/human, so AI and
learned policies use exactly the same control channel.

The behaviour is intentionally simple and readable: a keeper that hugs its line,
a chaser that goes for the ball, the rest holding a ball-reactive formation, and
basic dribble / pass / shoot decisions for whoever is on the ball.
"""

from __future__ import annotations

import numpy as np

from . import config as C


def base_formation(team_size: int) -> np.ndarray:
    """Home positions for team 0 as fractions of (HALF_LENGTH, HALF_WIDTH).

    Index 0 is the keeper.  Team 0 defends -x, so homes sit in the -x half.
    """
    homes = np.zeros((team_size, 2), dtype=np.float64)
    homes[0] = (-0.9, 0.0)                      # keeper
    outfield = team_size - 1
    back = outfield // 2
    front = outfield - back

    def line(n, x):
        zs = [0.0] if n <= 1 else list(np.linspace(-0.55, 0.55, n))
        return [(x, z) for z in zs]

    homes[1:1 + back] = line(back, -0.55)
    homes[1 + back:] = line(front, -0.12)
    return homes


def formation_world(team_size: int, team: int) -> np.ndarray:
    """Base home positions in world x/z for a given team."""
    homes = base_formation(team_size)
    world = np.empty_like(homes)
    sign = 1.0 if team == 0 else -1.0
    world[:, 0] = sign * homes[:, 0] * C.HALF_LENGTH
    world[:, 1] = homes[:, 1] * C.HALF_WIDTH
    return world


def _goal_center(team: int) -> np.ndarray:
    """The goal a given team is attacking."""
    x = C.HALF_LENGTH if team == 0 else -C.HALF_LENGTH
    return np.array([x, 0.0])


def _keeper_index(team: int, team_size: int) -> int:
    return 0 if team == 0 else team_size


def compute_actions(state, rng) -> np.ndarray:
    """Return an (N, 6) array of raw actions, one per player."""
    N = state.num_players
    ts = state.team_size
    actions = np.zeros((N, 6), dtype=np.float32)
    actions[:, 4] = -1.0  # pass off
    actions[:, 5] = -1.0  # shoot off

    pos = state.player_pos[:, [0, 2]]            # (N, 2) x/z
    ball = state.ball_pos[[0, 2]]
    ball_vel = state.ball_vel[[0, 2]]
    intercept = ball + ball_vel * C.CHASE_LEAD

    # nearest chaser per team (outfield preferred but keeper can join if closest)
    dist_to_ball = np.linalg.norm(pos - ball, axis=1)
    chaser = {}
    for t in (0, 1):
        idx = state.team_indices(t)
        chaser[t] = int(idx[np.argmin(dist_to_ball[idx])])

    formations = {t: formation_world(ts, t) for t in (0, 1)}
    ball_x_norm = float(np.clip(state.ball_pos[0] / C.HALF_LENGTH, -1.0, 1.0))

    for i in range(N):
        t = int(state.team[i])
        opp = 1 - t
        goal = _goal_center(t)
        is_keeper = (i == _keeper_index(t, ts))

        # --- keeper -------------------------------------------------------
        if is_keeper:
            own_goal_x = -C.HALF_LENGTH if t == 0 else C.HALF_LENGTH
            tgt = np.array([own_goal_x * 0.93,
                            float(np.clip(ball[1] * 0.6,
                                          -C.GOAL_HALF_WIDTH, C.GOAL_HALF_WIDTH))])
            if state.possession == i:
                # clear it up the pitch toward our furthest-forward team-mate
                mates = [j for j in state.team_indices(t) if j != i]
                fwd = max(mates, key=lambda j: (1 if t == 0 else -1) * pos[j, 0])
                aim = _aim_to(pos[i], pos[fwd], rng)
                actions[i, 2:4] = aim
                actions[i, 4] = 1.0
            else:
                actions[i, 0:2] = _move_to(pos[i], tgt)
            continue

        # --- on the ball --------------------------------------------------
        if state.possession == i:
            d_goal = float(np.linalg.norm(pos[i] - goal))
            near_opp = _nearest_opponent_dist(pos, state.team, i, opp)
            if d_goal < C.SHOOT_RANGE:
                aim = _aim_to(pos[i], goal, rng)
                actions[i, 2:4] = aim * float(np.clip(d_goal / C.SHOOT_RANGE, 0.55, 1.0))
                actions[i, 5] = 1.0
            else:
                mate = _best_pass_target(state, pos, i, t, opp, goal)
                if mate is not None and near_opp < 2.6:
                    aim = _aim_to(pos[i], pos[mate], rng)
                    d = float(np.linalg.norm(pos[i] - pos[mate]))
                    actions[i, 2:4] = aim * float(np.clip(d / 18.0, 0.4, 1.0))
                    actions[i, 4] = 1.0
                else:
                    # dribble toward goal
                    actions[i, 0:2] = _move_to(pos[i], goal, jitter=rng.normal(0, 0.05, 2))
                    actions[i, 2:4] = _aim_to(pos[i], goal, rng) * 0.2
            continue

        # --- off the ball -------------------------------------------------
        if i == chaser[t]:
            actions[i, 0:2] = _move_to(pos[i], intercept, jitter=rng.normal(0, 0.04, 2))
        else:
            home = formations[t][_home_slot(state, i, t, ts)]
            # push the line up/down the pitch with the ball
            home = home.copy()
            home[0] += ball_x_norm * 0.45 * C.HALF_LENGTH * (1 if t == 0 else 1)
            home[0] = float(np.clip(home[0], -C.HALF_LENGTH * 0.97, C.HALF_LENGTH * 0.97))
            actions[i, 0:2] = _move_to(pos[i], home, slow=True)

    return actions


# --- small helpers --------------------------------------------------------

def _home_slot(state, i, t, ts) -> int:
    """Map a player index to its formation row (0..ts-1)."""
    return i if t == 0 else i - ts


def _move_to(src, dst, jitter=None, slow=False):
    d = dst - src
    n = float(np.hypot(d[0], d[1]))
    if n < 1e-6:
        return np.zeros(2, dtype=np.float32)
    v = d / n
    if jitter is not None:
        v = v + jitter
    # ease off when nearly there so players settle instead of vibrating
    scale = min(1.0, n / 1.5) if slow else 1.0
    out = v * scale
    on = float(np.hypot(out[0], out[1]))
    if on > 1.0:
        out /= on
    return out.astype(np.float32)


def _aim_to(src, dst, rng):
    d = dst - src
    n = float(np.hypot(d[0], d[1]))
    if n < 1e-6:
        return np.array([1.0, 0.0], dtype=np.float32)
    ang = np.arctan2(d[1], d[0]) + rng.normal(0, C.AIM_NOISE)
    return np.array([np.cos(ang), np.sin(ang)], dtype=np.float32)


def _nearest_opponent_dist(pos, team, i, opp):
    idx = np.where(team == opp)[0]
    if len(idx) == 0:
        return 1e9
    return float(np.min(np.linalg.norm(pos[idx] - pos[i], axis=1)))


def _best_pass_target(state, pos, i, t, opp, goal):
    """Pick a team-mate that is more advanced and reasonably open, else None."""
    mates = [j for j in state.team_indices(t) if j != i]
    best, best_score = None, -1e9
    for j in mates:
        advance = -float(np.linalg.norm(pos[j] - goal))        # closer to goal is better
        openness = _nearest_opponent_dist(pos, state.team, j, opp)
        ahead = (pos[j, 0] - pos[i, 0]) * (1 if t == 0 else -1)
        if ahead <= 1.0:
            continue
        score = advance + 0.8 * openness
        if score > best_score:
            best, best_score = j, score
    return best
