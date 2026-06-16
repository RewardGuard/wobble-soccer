"""The deterministic, seedable simulation core.

``SoccerSim`` knows nothing about rendering or reinforcement learning.  It holds
a :class:`State`, advances it with :meth:`step`, and that is the *only* place the
rules live.  Given the same seed and the same sequence of actions it produces
exactly the same game, every time.
"""

from __future__ import annotations

import numpy as np

from . import ai
from . import action as action_mod
from . import config as C
from .state import State


class SoccerSim:
    def __init__(self, team_size: int = C.TEAM_SIZE,
                 match_seconds: float = C.MATCH_SECONDS,
                 seed: int | None = None):
        self.team_size = int(team_size)
        self.match_seconds = float(match_seconds)
        self.rng = np.random.default_rng(seed)
        self.state: State = self._fresh_state()
        self._kickoff()

    # ------------------------------------------------------------------ setup
    def _fresh_state(self) -> State:
        N = self.team_size * 2
        team = np.array([0] * self.team_size + [1] * self.team_size, dtype=np.int64)
        return State(
            ball_pos=np.array([0.0, C.BALL_RADIUS, 0.0]),
            ball_vel=np.zeros(3),
            player_pos=np.zeros((N, 3)),
            player_vel=np.zeros((N, 3)),
            player_face=np.tile(np.array([1.0, 0.0]), (N, 1)),
            team=team,
            kick_cooldown=np.zeros(N),
            possession=-1,
            active_player=0,
            score=np.zeros(2, dtype=np.int64),
            time_left=self.match_seconds,
            team_size=self.team_size,
        )

    def reset(self, seed: int | None = None) -> State:
        if seed is not None:
            self.rng = np.random.default_rng(seed)
        self.state = self._fresh_state()
        self._kickoff()
        return self.state

    def _kickoff(self) -> None:
        s = self.state
        for t in (0, 1):
            homes = ai.formation_world(self.team_size, t)
            idx = s.team_indices(t)
            s.player_pos[idx, 0] = homes[:, 0]
            s.player_pos[idx, 2] = homes[:, 1]
            s.player_pos[idx, 1] = 0.0
            face = 1.0 if t == 0 else -1.0
            s.player_face[idx] = np.array([face, 0.0])
        s.player_vel[:] = 0.0
        s.ball_pos[:] = (0.0, C.BALL_RADIUS, 0.0)
        s.ball_vel[:] = 0.0
        s.kick_cooldown[:] = 0.0
        s.possession = -1
        self._update_active()

    # ------------------------------------------------------------------- step
    def step(self, agent_action) -> State:
        s = self.state
        s.last_goal_team = -1

        # 1. one raw action per player: AI for everyone, agent overrides its body
        raw = ai.compute_actions(s, self.rng)
        raw[s.active_player] = np.asarray(agent_action, dtype=np.float32).reshape(-1)
        intents = [action_mod.decode(raw[i], s.player_face[i])
                   for i in range(s.num_players)]

        # 2. move bodies, then unstick overlaps
        self._move_players(intents)
        self._resolve_player_collisions()

        # 3. who controls the ball now?
        self._update_possession()

        # 4. kicks (only the controller can release it)
        kicked = self._apply_kicks(intents)

        # 5. ball follows the dribbler, or flies free under physics
        if s.possession >= 0 and not kicked:
            self._dribble()
        else:
            self._integrate_ball()

        # 6. goals, clocks, camera/agent focus
        self._check_goal()
        s.kick_cooldown = np.maximum(0.0, s.kick_cooldown - C.DT)
        s.time_left = max(0.0, s.time_left - C.DT)
        self._update_active()
        return s

    # --------------------------------------------------------------- players
    def _move_players(self, intents) -> None:
        s = self.state
        max_dv = C.PLAYER_ACCEL * C.DT
        for i in range(s.num_players):
            desired = intents[i].move * C.PLAYER_MAX_SPEED
            cur = s.player_vel[i, [0, 2]]
            dv = desired - cur
            n = float(np.hypot(dv[0], dv[1]))
            if n > max_dv:
                dv *= max_dv / n
            cur = cur + dv
            s.player_vel[i, 0], s.player_vel[i, 2] = cur
            s.player_pos[i, 0] += cur[0] * C.DT
            s.player_pos[i, 2] += cur[1] * C.DT
            speed = float(np.hypot(cur[0], cur[1]))
            if speed > 0.3:
                s.player_face[i] = cur / speed
            # keepers and outfielders alike stay on the grass, inside the boards
            s.player_pos[i, 0] = np.clip(s.player_pos[i, 0],
                                         -C.HALF_LENGTH + C.PLAYER_RADIUS,
                                         C.HALF_LENGTH - C.PLAYER_RADIUS)
            s.player_pos[i, 2] = np.clip(s.player_pos[i, 2],
                                         -C.HALF_WIDTH + C.PLAYER_RADIUS,
                                         C.HALF_WIDTH - C.PLAYER_RADIUS)
            s.player_pos[i, 1] = 0.0
            s.player_vel[i, 1] = 0.0

    def _resolve_player_collisions(self) -> None:
        s = self.state
        N = s.num_players
        min_d = 2.0 * C.PLAYER_RADIUS
        for a in range(N):
            for b in range(a + 1, N):
                dx = s.player_pos[b, 0] - s.player_pos[a, 0]
                dz = s.player_pos[b, 2] - s.player_pos[a, 2]
                d = float(np.hypot(dx, dz))
                if 1e-6 < d < min_d:
                    overlap = (min_d - d) * 0.5 * C.PLAYER_PUSH
                    ux, uz = dx / d, dz / d
                    s.player_pos[a, 0] -= ux * overlap
                    s.player_pos[a, 2] -= uz * overlap
                    s.player_pos[b, 0] += ux * overlap
                    s.player_pos[b, 2] += uz * overlap

    # ------------------------------------------------------------ possession
    def _update_possession(self) -> None:
        s = self.state
        pos2 = s.player_pos[:, [0, 2]]
        ball2 = s.ball_pos[[0, 2]]
        d = np.linalg.norm(pos2 - ball2, axis=1)
        eligible = ((s.kick_cooldown <= 0.0) &
                    (s.ball_pos[1] < C.CAPTURE_HEIGHT) &
                    (d < C.CAPTURE_RADIUS))
        if np.any(eligible):
            cand = np.where(eligible)[0]
            s.possession = int(cand[np.argmin(d[cand])])
        else:
            s.possession = -1

    def _apply_kicks(self, intents) -> bool:
        s = self.state
        p = s.possession
        if p < 0:
            return False
        it = intents[p]
        if not (it.do_pass or it.do_shoot):
            return False

        d = it.aim_dir
        if it.do_shoot:
            speed = C.SHOOT_SPEED_MIN + it.power * (C.SHOOT_SPEED_MAX - C.SHOOT_SPEED_MIN)
            loft = C.SHOOT_LOFT * (0.5 + 0.5 * it.power)
        else:
            speed = C.PASS_SPEED_MIN + it.power * (C.PASS_SPEED_MAX - C.PASS_SPEED_MIN)
            loft = C.PASS_LOFT
        # launch from where the ball was being dribbled, so it reads continuously
        s.ball_pos[0] = s.player_pos[p, 0] + d[0] * C.DRIBBLE_OFFSET
        s.ball_pos[2] = s.player_pos[p, 2] + d[1] * C.DRIBBLE_OFFSET
        s.ball_pos[1] = C.BALL_RADIUS
        s.ball_vel[0] = d[0] * speed
        s.ball_vel[2] = d[1] * speed
        s.ball_vel[1] = loft
        s.possession = -1
        s.kick_cooldown[p] = C.KICK_COOLDOWN
        return True

    def _dribble(self) -> None:
        s = self.state
        p = s.possession
        fd = s.player_face[p]
        bx = s.player_pos[p, 0] + fd[0] * C.DRIBBLE_OFFSET
        bz = s.player_pos[p, 2] + fd[1] * C.DRIBBLE_OFFSET
        # don't let a side-on dribble shove the ball through the boards
        bz = float(np.clip(bz, -(C.HALF_WIDTH - C.BALL_RADIUS), C.HALF_WIDTH - C.BALL_RADIUS))
        in_mouth = abs(bz) < C.GOAL_HALF_WIDTH
        if not in_mouth:
            bx = float(np.clip(bx, -C.HALF_LENGTH, C.HALF_LENGTH))
        s.ball_pos[0] = bx
        s.ball_pos[2] = bz
        s.ball_pos[1] = C.BALL_RADIUS
        s.ball_vel[0] = s.player_vel[p, 0]
        s.ball_vel[2] = s.player_vel[p, 2]
        s.ball_vel[1] = 0.0

    # ----------------------------------------------------------------- ball
    def _integrate_ball(self) -> None:
        s = self.state
        s.ball_vel[1] -= C.GRAVITY * C.DT
        s.ball_pos += s.ball_vel * C.DT

        # ground bounce + rolling friction
        if s.ball_pos[1] < C.BALL_RADIUS:
            s.ball_pos[1] = C.BALL_RADIUS
            if s.ball_vel[1] < 0:
                s.ball_vel[1] = -s.ball_vel[1] * C.GROUND_RESTITUTION
            if abs(s.ball_vel[1]) < 0.6:
                s.ball_vel[1] = 0.0
            s.ball_vel[0] *= C.BALL_GROUND_DAMP
            s.ball_vel[2] *= C.BALL_GROUND_DAMP
        else:
            s.ball_vel[0] *= C.BALL_AIR_DAMP
            s.ball_vel[2] *= C.BALL_AIR_DAMP

        # side boards (z)
        zlim = C.HALF_WIDTH - C.BALL_RADIUS
        if s.ball_pos[2] > zlim:
            s.ball_pos[2] = zlim
            s.ball_vel[2] = -s.ball_vel[2] * C.WALL_RESTITUTION
        elif s.ball_pos[2] < -zlim:
            s.ball_pos[2] = -zlim
            s.ball_vel[2] = -s.ball_vel[2] * C.WALL_RESTITUTION

        # end boards (x) — but let the ball pass through the goal mouth
        in_mouth = abs(s.ball_pos[2]) < C.GOAL_HALF_WIDTH and s.ball_pos[1] < C.GOAL_HEIGHT
        if not in_mouth:
            xlim = C.HALF_LENGTH - C.BALL_RADIUS
            if s.ball_pos[0] > xlim:
                s.ball_pos[0] = xlim
                s.ball_vel[0] = -s.ball_vel[0] * C.WALL_RESTITUTION
            elif s.ball_pos[0] < -xlim:
                s.ball_pos[0] = -xlim
                s.ball_vel[0] = -s.ball_vel[0] * C.WALL_RESTITUTION

    def _check_goal(self) -> None:
        s = self.state
        if abs(s.ball_pos[2]) < C.GOAL_HALF_WIDTH and s.ball_pos[1] < C.GOAL_HEIGHT:
            scored = -1
            if s.ball_pos[0] > C.HALF_LENGTH:
                scored = 0
            elif s.ball_pos[0] < -C.HALF_LENGTH:
                scored = 1
            if scored >= 0:
                s.score[scored] += 1
                s.last_goal_team = scored
                self._kickoff()

    # --------------------------------------------------------------- focus
    def _update_active(self) -> None:
        s = self.state
        idx = s.team_indices(0)
        ball2 = s.ball_pos[[0, 2]]
        d = np.linalg.norm(s.player_pos[idx][:, [0, 2]] - ball2, axis=1)
        s.active_player = int(idx[np.argmin(d)])
