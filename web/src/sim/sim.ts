/** Deterministic simulation core — ported from `wobblesoccer/core/sim.py`. */
import { C } from "./config";
import { RNG } from "./rng";
import { State, type Player } from "./state";
import { decode, type Action, type Intent } from "./action";
import { computeActions, formationWorld } from "./ai";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class SoccerSim {
  state = new State();
  rng: RNG;
  constructor(public teamSize = C.TEAM_SIZE, public matchSeconds = C.MATCH_SECONDS, seed = 1) {
    this.rng = new RNG(seed);
    this.freshState();
    this.kickoff();
  }

  private freshState() {
    const s = new State();
    s.teamSize = this.teamSize;
    s.timeLeft = this.matchSeconds;
    const players: Player[] = [];
    for (let i = 0; i < this.teamSize * 2; i++) {
      players.push({
        pos: [0, 0, 0],
        vel: [0, 0, 0],
        face: [i < this.teamSize ? 1 : -1, 0],
        team: i < this.teamSize ? 0 : 1,
        kickCooldown: 0,
      });
    }
    s.players = players;
    s.ballPos = [0, C.BALL_RADIUS, 0];
    this.state = s;
  }

  reset(seed?: number): State {
    if (seed !== undefined) this.rng = new RNG(seed);
    this.freshState();
    this.kickoff();
    return this.state;
  }

  kickoff() {
    const s = this.state;
    for (const t of [0, 1]) {
      const homes = formationWorld(this.teamSize, t);
      const idx = s.teamIndices(t);
      idx.forEach((pi, k) => {
        s.players[pi].pos = [homes[k][0], 0, homes[k][1]];
        s.players[pi].vel = [0, 0, 0];
        s.players[pi].face = [t === 0 ? 1 : -1, 0];
      });
    }
    s.ballPos = [0, C.BALL_RADIUS, 0];
    s.ballVel = [0, 0, 0];
    s.players.forEach((p) => (p.kickCooldown = 0));
    s.possession = -1;
    this.updateActive();
  }

  step(agentAction: Action, aiControlsActive = false): State {
    const s = this.state;
    s.lastGoalTeam = -1;
    s.lastKicker = -1;
    s.lastKickWasShoot = false;

    const raw = computeActions(s, this.rng);
    if (!aiControlsActive) raw[s.activePlayer] = agentAction; // else: pure AI-vs-AI
    const intents: Intent[] = raw.map((r, i) => decode(r, s.players[i].face));

    this.movePlayers(intents);
    this.resolveCollisions();
    this.updatePossession();
    const kicked = this.applyKicks(intents);
    if (s.possession >= 0 && !kicked) this.dribble();
    else this.integrateBall();
    this.checkGoal();

    for (const p of s.players) p.kickCooldown = Math.max(0, p.kickCooldown - C.DT);
    s.timeLeft = Math.max(0, s.timeLeft - C.DT);
    this.updateActive();
    return s;
  }

  private movePlayers(intents: Intent[]) {
    const s = this.state;
    const maxDv = C.PLAYER_ACCEL * C.DT;
    for (let i = 0; i < s.players.length; i++) {
      const p = s.players[i];
      const maxSpeed = C.PLAYER_MAX_SPEED * (this.isKeeper(i) ? C.GK_SPEED_BONUS : 1);
      const desired = [intents[i].move[0] * maxSpeed, intents[i].move[1] * maxSpeed];
      let dvx = desired[0] - p.vel[0];
      let dvz = desired[1] - p.vel[2];
      const n = Math.hypot(dvx, dvz);
      if (n > maxDv) {
        dvx *= maxDv / n;
        dvz *= maxDv / n;
      }
      p.vel[0] += dvx;
      p.vel[2] += dvz;
      p.pos[0] += p.vel[0] * C.DT;
      p.pos[2] += p.vel[2] * C.DT;
      const speed = Math.hypot(p.vel[0], p.vel[2]);
      if (speed > 0.3) p.face = [p.vel[0] / speed, p.vel[2] / speed];
      p.pos[0] = clamp(p.pos[0], -C.HALF_LENGTH + C.PLAYER_RADIUS, C.HALF_LENGTH - C.PLAYER_RADIUS);
      p.pos[2] = clamp(p.pos[2], -C.HALF_WIDTH + C.PLAYER_RADIUS, C.HALF_WIDTH - C.PLAYER_RADIUS);
      p.pos[1] = 0;
      p.vel[1] = 0;
    }
  }

  private resolveCollisions() {
    const s = this.state;
    const N = s.players.length;
    const minD = 2 * C.PLAYER_RADIUS;
    for (let a = 0; a < N; a++) {
      for (let b = a + 1; b < N; b++) {
        const pa = s.players[a].pos;
        const pb = s.players[b].pos;
        const dx = pb[0] - pa[0];
        const dz = pb[2] - pa[2];
        const d = Math.hypot(dx, dz);
        if (d > 1e-6 && d < minD) {
          const overlap = (minD - d) * 0.5 * C.PLAYER_PUSH;
          const ux = dx / d;
          const uz = dz / d;
          pa[0] -= ux * overlap;
          pa[2] -= uz * overlap;
          pb[0] += ux * overlap;
          pb[2] += uz * overlap;
        }
      }
    }
  }

  private updatePossession() {
    const s = this.state;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < s.players.length; i++) {
      const p = s.players[i];
      if (p.kickCooldown > 0) continue;
      let reach = C.CAPTURE_RADIUS;
      let maxH = C.CAPTURE_HEIGHT;
      if (this.isKeeper(i)) {
        const inBox = p.team === 0 ? s.ballPos[0] < -C.HALF_LENGTH * 0.55 : s.ballPos[0] > C.HALF_LENGTH * 0.55;
        if (inBox) {
          reach = C.GK_REACH; // keepers can claim lofted shots in their own box
          maxH = C.GK_CATCH_HEIGHT;
        }
      }
      if (s.ballPos[1] >= maxH) continue;
      const d = Math.hypot(p.pos[0] - s.ballPos[0], p.pos[2] - s.ballPos[2]);
      if (d < reach && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    s.possession = best;
  }

  private isKeeper(i: number): boolean {
    return i === 0 || i === this.teamSize;
  }

  private applyKicks(intents: Intent[]): boolean {
    const s = this.state;
    // the possessor kicks if they want to; otherwise the nearest player who
    // wants to kick and is within lunge range pokes the loose ball (responsive!)
    let p = -1;
    if (s.possession >= 0 && (intents[s.possession].doPass || intents[s.possession].doShoot)) {
      p = s.possession;
    } else {
      const lunge = C.CAPTURE_RADIUS * 1.7;
      let bd = lunge;
      for (let i = 0; i < s.players.length; i++) {
        const it = intents[i];
        if ((it.doPass || it.doShoot) && s.players[i].kickCooldown <= 0 && s.ballPos[1] < C.CAPTURE_HEIGHT) {
          const d = Math.hypot(s.players[i].pos[0] - s.ballPos[0], s.players[i].pos[2] - s.ballPos[2]);
          if (d < bd) { bd = d; p = i; }
        }
      }
    }
    if (p < 0) return false;
    const it = intents[p];
    const d = it.aimDir;
    let speed: number;
    let loft: number;
    if (it.doShoot) {
      speed = C.SHOOT_SPEED_MIN + it.power * (C.SHOOT_SPEED_MAX - C.SHOOT_SPEED_MIN);
      loft = C.SHOOT_LOFT * (0.5 + 0.5 * it.power);
    } else {
      speed = C.PASS_SPEED_MIN + it.power * (C.PASS_SPEED_MAX - C.PASS_SPEED_MIN);
      loft = C.PASS_LOFT;
    }
    const pl = s.players[p];
    s.ballPos[0] = pl.pos[0] + d[0] * C.DRIBBLE_OFFSET;
    s.ballPos[2] = pl.pos[2] + d[1] * C.DRIBBLE_OFFSET;
    s.ballPos[1] = C.BALL_RADIUS;
    s.ballVel[0] = d[0] * speed;
    s.ballVel[2] = d[1] * speed;
    s.ballVel[1] = loft;
    s.possession = -1;
    s.lastKicker = p;
    s.lastKickWasShoot = it.doShoot;
    pl.kickCooldown = C.KICK_COOLDOWN;
    return true;
  }

  private dribble() {
    const s = this.state;
    const pl = s.players[s.possession];
    let bx = pl.pos[0] + pl.face[0] * C.DRIBBLE_OFFSET;
    let bz = pl.pos[2] + pl.face[1] * C.DRIBBLE_OFFSET;
    bz = clamp(bz, -(C.HALF_WIDTH - C.BALL_RADIUS), C.HALF_WIDTH - C.BALL_RADIUS);
    if (Math.abs(bz) >= C.GOAL_HALF_WIDTH) bx = clamp(bx, -C.HALF_LENGTH, C.HALF_LENGTH);
    s.ballPos = [bx, C.BALL_RADIUS, bz];
    s.ballVel = [pl.vel[0], 0, pl.vel[2]];
  }

  private integrateBall() {
    const s = this.state;
    s.ballVel[1] -= C.GRAVITY * C.DT;
    s.ballPos[0] += s.ballVel[0] * C.DT;
    s.ballPos[1] += s.ballVel[1] * C.DT;
    s.ballPos[2] += s.ballVel[2] * C.DT;

    if (s.ballPos[1] < C.BALL_RADIUS) {
      s.ballPos[1] = C.BALL_RADIUS;
      if (s.ballVel[1] < 0) s.ballVel[1] = -s.ballVel[1] * C.GROUND_RESTITUTION;
      if (Math.abs(s.ballVel[1]) < 0.6) s.ballVel[1] = 0;
      s.ballVel[0] *= C.BALL_GROUND_DAMP;
      s.ballVel[2] *= C.BALL_GROUND_DAMP;
    } else {
      s.ballVel[0] *= C.BALL_AIR_DAMP;
      s.ballVel[2] *= C.BALL_AIR_DAMP;
    }

    const zlim = C.HALF_WIDTH - C.BALL_RADIUS;
    if (s.ballPos[2] > zlim) {
      s.ballPos[2] = zlim;
      s.ballVel[2] = -s.ballVel[2] * C.WALL_RESTITUTION;
    } else if (s.ballPos[2] < -zlim) {
      s.ballPos[2] = -zlim;
      s.ballVel[2] = -s.ballVel[2] * C.WALL_RESTITUTION;
    }

    const inMouth = Math.abs(s.ballPos[2]) < C.GOAL_HALF_WIDTH && s.ballPos[1] < C.GOAL_HEIGHT;
    if (!inMouth) {
      const xlim = C.HALF_LENGTH - C.BALL_RADIUS;
      if (s.ballPos[0] > xlim) {
        s.ballPos[0] = xlim;
        s.ballVel[0] = -s.ballVel[0] * C.WALL_RESTITUTION;
      } else if (s.ballPos[0] < -xlim) {
        s.ballPos[0] = -xlim;
        s.ballVel[0] = -s.ballVel[0] * C.WALL_RESTITUTION;
      }
    }
  }

  private checkGoal() {
    const s = this.state;
    if (Math.abs(s.ballPos[2]) < C.GOAL_HALF_WIDTH && s.ballPos[1] < C.GOAL_HEIGHT) {
      let scored = -1;
      if (s.ballPos[0] > C.HALF_LENGTH) scored = 0;
      else if (s.ballPos[0] < -C.HALF_LENGTH) scored = 1;
      if (scored >= 0) {
        s.score[scored] += 1;
        s.lastGoalTeam = scored;
        this.kickoff();
      }
    }
  }

  private updateActive() {
    const s = this.state;
    const idx = s.teamIndices(0);
    let best = idx[0];
    let bd = Infinity;
    for (const i of idx) {
      const d = Math.hypot(s.players[i].pos[0] - s.ballPos[0], s.players[i].pos[2] - s.ballPos[2]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    s.activePlayer = best;
  }
}
