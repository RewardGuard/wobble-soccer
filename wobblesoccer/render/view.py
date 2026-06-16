"""3D rendering + human input, built on Ursina.

This is the *only* module that imports a rendering engine.  It is deliberately
kept off the simulation/RL hot path: the core and the Gym env never import it.
Two entry points:

    Renderer  -- builds the low-poly scene and syncs it to a State each frame.
                 Used both by human play and by SoccerEnv(render_mode="human").
    play()    -- the full human game: WASD to move, mouse to aim, Q pass, E shoot.

Visual language: flat-shaded primitives, bold colors, blobby "capsule" players
with a velocity-driven wobble/squash — a lot of character from very little.
"""

from __future__ import annotations

import math

from ursina import (Ursina, Entity, Text, camera, color, mouse, held_keys,
                    window, application, DirectionalLight, AmbientLight, Vec3)

from ..core import config as C
from ..core.sim import SoccerSim
from ..core import action as action_mod

# bold, NES-ish palette (HSV is stable across Ursina versions)
_PITCH = color.color(120, 0.45, 0.50)
_PITCH_STRIPE = color.color(120, 0.45, 0.57)
_LINE = color.color(0, 0, 1.0)
_TEAM = (color.color(2, 0.80, 0.95), color.color(212, 0.70, 0.95))  # red, blue
_ACTIVE = color.color(48, 0.95, 1.0)                                # yellow ring
_BALL = color.white
_BOARD = color.color(40, 0.08, 0.88)
_POST = color.white


class Renderer:
    """Owns the Ursina window and one visual entity per simulation object."""

    def __init__(self, team_size: int = C.TEAM_SIZE, title: str = "Wobble Soccer"):
        self.team_size = team_size
        self.app = Ursina(title=title, borderless=False, vsync=True,
                          development_mode=False)
        window.color = color.color(210, 0.25, 0.12)
        window.fps_counter.enabled = False
        window.exit_button.visible = False

        self._build_pitch()
        self._build_goals()
        self._build_players(team_size)
        self.ball = Entity(model="sphere", color=_BALL, scale=2 * C.BALL_RADIUS)
        self._build_lights_and_camera()
        self._build_hud()
        self._t = 0.0

    # ----------------------------------------------------------- scene build
    def _build_pitch(self):
        L, W = C.HALF_LENGTH, C.HALF_WIDTH
        self.pitch = Entity(model="cube", color=_PITCH,
                            scale=(2 * L, 0.5, 2 * W), position=(0, -0.25, 0),
                            collider="box")
        # a few mowing stripes for that "intentional" look
        for i in range(-4, 5):
            Entity(model="cube", color=_PITCH_STRIPE if i % 2 else _PITCH,
                   scale=(2 * L / 9, 0.02, 2 * W), position=(i * (2 * L / 9), 0.01, 0))
        # halfway line + center spot + a chunky center circle made of segments
        Entity(model="cube", color=_LINE, scale=(0.25, 0.02, 2 * W), position=(0, 0.02, 0))
        Entity(model="sphere", color=_LINE, scale=0.6, position=(0, 0.02, 0))
        for a in range(24):
            ang = a / 24 * math.tau
            Entity(model="cube", color=_LINE, scale=(0.5, 0.02, 0.25),
                   position=(math.cos(ang) * 4, 0.02, math.sin(ang) * 4),
                   rotation_y=-math.degrees(ang))
        # perimeter boards (gap left for each goal mouth)
        for sign in (-1, 1):
            Entity(model="cube", color=_BOARD, scale=(2 * L, 0.8, 0.4),
                   position=(0, 0.4, sign * W))
            seg = (W - C.GOAL_HALF_WIDTH) / 2
            for s2 in (-1, 1):
                Entity(model="cube", color=_BOARD, scale=(0.4, 0.8, seg),
                       position=(sign * L, 0.4, s2 * (C.GOAL_HALF_WIDTH + seg / 2)))

    def _build_goals(self):
        L, gw, gh = C.HALF_LENGTH, C.GOAL_HALF_WIDTH, C.GOAL_HEIGHT
        for sign, tint in ((1, _TEAM[0]), (-1, _TEAM[1])):
            for z in (-gw, gw):                      # posts
                Entity(model="cube", color=_POST, scale=(0.3, gh, 0.3),
                       position=(sign * L, gh / 2, z))
            Entity(model="cube", color=_POST, scale=(0.3, 0.3, 2 * gw),  # crossbar
                   position=(sign * L, gh, 0))
            Entity(model="cube", color=tint, scale=(0.15, gh, 2 * gw),   # net plane
                   position=(sign * L + sign * 0.9, gh / 2, 0), alpha=0.18)

    def _build_players(self, team_size):
        self.players = []
        self.bodies = []
        self.rings = []
        for i in range(team_size * 2):
            team = 0 if i < team_size else 1
            root = Entity(position=(0, 0, 0))
            body = Entity(parent=root, model="sphere", color=_TEAM[team],
                          scale=(1.4, 2.0, 1.4), position=(0, 1.0, 0))
            # a paler "head" blob + a little facing nub for character
            Entity(parent=root, model="sphere", color=color.tint(_TEAM[team], 0.3),
                   scale=(1.0, 1.0, 1.0), position=(0, 2.0, 0))
            Entity(parent=root, model="cube", color=color.black,
                   scale=(0.25, 0.25, 0.5), position=(0, 1.6, 0.7))
            ring = Entity(model="circle", color=_ACTIVE, scale=2.6,
                          rotation_x=90, position=(0, 0.05, 0), enabled=False)
            self.players.append(root)
            self.bodies.append(body)
            self.rings.append(ring)

    def _build_lights_and_camera(self):
        AmbientLight(color=color.rgba(255, 255, 255, 180))
        sun = DirectionalLight()
        sun.look_at(Vec3(0.4, -1, 0.3))
        # broadside broadcast angle: long axis (x) runs across the screen
        camera.position = (0, 24, -36)
        camera.look_at(Vec3(0, 0, 3))
        camera.fov = 55

    def _build_hud(self):
        self.score_text = Text(text="0 - 0", parent=camera.ui, origin=(0, 0),
                               position=(0, 0.46), scale=2.2, color=color.white)
        self.timer_text = Text(text="", parent=camera.ui, origin=(0, 0),
                               position=(0, 0.40), scale=1.1, color=color.white)

    # ------------------------------------------------------------------ sync
    def sync(self, s):
        """Push a simulation State onto the scene (call once per rendered frame)."""
        self._t += getattr(__import__("ursina").time, "dt", C.DT)

        self.ball.position = (s.ball_pos[0], s.ball_pos[1], s.ball_pos[2])
        self.ball.rotation_x += s.ball_vel[0] * 6
        self.ball.rotation_z -= s.ball_vel[2] * 6

        for i, root in enumerate(self.players):
            root.position = (s.player_pos[i, 0], 0, s.player_pos[i, 2])
            fx, fz = s.player_face[i]
            root.rotation_y = math.degrees(math.atan2(fx, fz))
            speed = math.hypot(s.player_vel[i, 0], s.player_vel[i, 2])
            # wobble: lean side-to-side and squash/stretch with speed
            wob = math.sin(self._t * 9 + i) * min(speed, C.PLAYER_MAX_SPEED) * 1.4
            self.bodies[i].rotation_z = wob
            squash = 1.0 + 0.05 * math.sin(self._t * 12 + i * 1.7)
            self.bodies[i].scale = (1.4 / squash, 2.0 * squash, 1.4 / squash)
            self.rings[i].enabled = (i == s.active_player)

        self.score_text.text = f"{int(s.score[0])}  -  {int(s.score[1])}"
        m, sec = divmod(max(0, int(s.time_left)), 60)
        self.timer_text.text = f"{m}:{sec:02d}"

    def pump(self):
        """Advance the engine by one frame (used when an RL agent drives steps)."""
        application.base.taskMgr.step()

    def close(self):
        try:
            application.base.userExit()
        except Exception:
            pass


# ===========================================================================
#  Human play
# ===========================================================================
class _HumanController(Entity):
    """Reads WASD/mouse/Q/E, steps the sim at a fixed rate, syncs the view."""

    def __init__(self, sim: SoccerSim, renderer: Renderer):
        super().__init__()
        self.sim = sim
        self.renderer = renderer
        self._accum = 0.0
        self._pending_pass = False
        self._pending_shoot = False
        self._aim = (1.0, 0.0)

    def _build_action(self):
        s = self.sim.state
        mx = (held_keys["d"] - held_keys["a"])
        mz = (held_keys["w"] - held_keys["s"])

        # aim from the mouse: ray onto the pitch, vector from the active player
        if mouse.world_point is not None and mouse.hovered_entity == self.renderer.pitch:
            ap = s.active_player
            dx = mouse.world_point.x - s.player_pos[ap, 0]
            dz = mouse.world_point.z - s.player_pos[ap, 2]
            dist = math.hypot(dx, dz)
            if dist > 1e-3:
                power = max(0.0, min(dist / 12.0, 1.0))  # pull farther -> harder
                self._aim = (dx / dist * power, dz / dist * power)

        return action_mod.encode(move=(mx, mz), aim=self._aim,
                                 do_pass=self._pending_pass,
                                 do_shoot=self._pending_shoot)

    def update(self):
        from ursina import time as utime
        self._accum += utime.dt
        # fixed-timestep sim, decoupled from the render frame rate
        guard = 0
        while self._accum >= C.DT and guard < 6:
            self.sim.step(self._build_action())
            self._pending_pass = False
            self._pending_shoot = False
            self._accum -= C.DT
            guard += 1
        self.renderer.sync(self.sim.state)

    def input(self, key):
        if key == "q":
            self._pending_pass = True
        elif key == "e":
            self._pending_shoot = True


def play(team_size: int = C.TEAM_SIZE, match_seconds: float = C.MATCH_SECONDS,
         seed: int | None = None):
    """Launch the playable 3D game.  Blocks until the window is closed."""
    sim = SoccerSim(team_size=team_size, match_seconds=match_seconds, seed=seed)
    renderer = Renderer(team_size)
    Text(text="WASD move   |   mouse aim   |   Q pass   |   E shoot",
         parent=camera.ui, origin=(0, 0), position=(0, -0.46), scale=1.0,
         color=color.white)
    _HumanController(sim, renderer)
    renderer.app.run()
