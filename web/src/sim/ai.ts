/** Scripted teammates & opponents — ported from `wobblesoccer/core/ai.py`. */
import { C } from "./config";
import type { RNG } from "./rng";
import type { State, Vec2 } from "./state";
import type { Action } from "./action";

export function baseFormation(teamSize: number): number[][] {
  const homes: number[][] = [[-0.9, 0.0]]; // keeper
  const outfield = teamSize - 1;
  const back = Math.floor(outfield / 2);
  const front = outfield - back;
  const line = (n: number, x: number): number[][] => {
    if (n <= 1) return [[x, 0.0]];
    const out: number[][] = [];
    for (let i = 0; i < n; i++) out.push([x, -0.55 + (1.1 * i) / (n - 1)]);
    return out;
  };
  return homes.concat(line(back, -0.55), line(front, -0.12));
}

export function formationWorld(teamSize: number, team: number): number[][] {
  const sign = team === 0 ? 1 : -1;
  return baseFormation(teamSize).map((h) => [sign * h[0] * C.HALF_LENGTH, h[1] * C.HALF_WIDTH]);
}

function goalCenter(team: number): Vec2 {
  return [team === 0 ? C.HALF_LENGTH : -C.HALF_LENGTH, 0];
}

export function keeperIndex(team: number, teamSize: number): number {
  return team === 0 ? 0 : teamSize;
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function moveTo(src: Vec2, dst: Vec2, jitter?: Vec2, slow = false): Vec2 {
  const d: Vec2 = [dst[0] - src[0], dst[1] - src[1]];
  const n = Math.hypot(d[0], d[1]);
  if (n < 1e-6) return [0, 0];
  let v: Vec2 = [d[0] / n, d[1] / n];
  if (jitter) v = [v[0] + jitter[0], v[1] + jitter[1]];
  const scale = slow ? Math.min(1, n / 1.5) : 1;
  let out: Vec2 = [v[0] * scale, v[1] * scale];
  const on = Math.hypot(out[0], out[1]);
  if (on > 1) out = [out[0] / on, out[1] / on];
  return out;
}

function aimTo(src: Vec2, dst: Vec2, rng: RNG): Vec2 {
  const d: Vec2 = [dst[0] - src[0], dst[1] - src[1]];
  const n = Math.hypot(d[0], d[1]);
  if (n < 1e-6) return [1, 0];
  const ang = Math.atan2(d[1], d[0]) + rng.normal(0, C.AIM_NOISE);
  return [Math.cos(ang), Math.sin(ang)];
}

function nearestOpponentDist(pos: Vec2[], teams: number[], i: number, opp: number): number {
  let best = 1e9;
  for (let j = 0; j < pos.length; j++) {
    if (teams[j] === opp) best = Math.min(best, dist(pos[j], pos[i]));
  }
  return best;
}

function bestPassTarget(s: State, pos: Vec2[], i: number, t: number, opp: number, goal: Vec2): number | null {
  let best: number | null = null;
  let bestScore = -1e9;
  for (const j of s.teamIndices(t)) {
    if (j === i) continue;
    const ahead = (pos[j][0] - pos[i][0]) * (t === 0 ? 1 : -1);
    if (ahead <= 1.0) continue;
    const advance = -dist(pos[j], goal);
    const openness = nearestOpponentDist(pos, s.players.map((p) => p.team), j, opp);
    const score = advance + 0.8 * openness;
    if (score > bestScore) {
      best = j;
      bestScore = score;
    }
  }
  return best;
}

export function computeActions(s: State, rng: RNG): Action[] {
  const N = s.players.length;
  const ts = s.teamSize;
  const actions: Action[] = [];
  const pos: Vec2[] = s.players.map((p) => [p.pos[0], p.pos[2]]);
  const teams = s.players.map((p) => p.team);
  const ball: Vec2 = [s.ballPos[0], s.ballPos[2]];
  const ballVel: Vec2 = [s.ballVel[0], s.ballVel[2]];
  const intercept: Vec2 = [ball[0] + ballVel[0] * C.CHASE_LEAD, ball[1] + ballVel[1] * C.CHASE_LEAD];

  const chaser: Record<number, number> = {};
  for (const t of [0, 1]) {
    const idx = s.teamIndices(t);
    let bi = idx[0];
    let bd = 1e9;
    for (const j of idx) {
      const d = dist(pos[j], ball);
      if (d < bd) {
        bd = d;
        bi = j;
      }
    }
    chaser[t] = bi;
  }

  const formations: Record<number, number[][]> = {
    0: formationWorld(ts, 0),
    1: formationWorld(ts, 1),
  };
  const ballXNorm = Math.max(-1, Math.min(1, s.ballPos[0] / C.HALF_LENGTH));

  for (let i = 0; i < N; i++) {
    const a: Action = [0, 0, 0, 0, -1, -1];
    const t = teams[i];
    const opp = 1 - t;
    const goal = goalCenter(t);
    const isKeeper = i === keeperIndex(t, ts);

    if (isKeeper) {
      const ownGoalX = t === 0 ? -C.HALF_LENGTH : C.HALF_LENGTH;
      const inBox = t === 0 ? ball[0] < -C.HALF_LENGTH * 0.55 : ball[0] > C.HALF_LENGTH * 0.55;
      if (s.possession === i) {
        // clear it up the pitch to the furthest-forward team-mate
        const mates = s.teamIndices(t).filter((j) => j !== i);
        let fwd = mates[0];
        for (const j of mates) if ((t === 0 ? 1 : -1) * pos[j][0] > (t === 0 ? 1 : -1) * pos[fwd][0]) fwd = j;
        const aim = aimTo(pos[i], pos[fwd], rng);
        a[2] = aim[0];
        a[3] = aim[1];
        a[4] = 1;
      } else if (inBox && dist(pos[i], ball) < 4.5 && s.possession < 0) {
        // rush off the line to smother a loose ball in the box
        const m = moveTo(pos[i], ball);
        a[0] = m[0];
        a[1] = m[1];
      } else {
        // hold the line and cover the angle to the ball
        const tgt: Vec2 = [
          ownGoalX * 0.92,
          Math.max(-C.GOAL_HALF_WIDTH - 0.5, Math.min(C.GOAL_HALF_WIDTH + 0.5, ball[1] * 0.85)),
        ];
        const m = moveTo(pos[i], tgt);
        a[0] = m[0];
        a[1] = m[1];
      }
      actions.push(a);
      continue;
    }

    if (s.possession === i) {
      const dGoal = dist(pos[i], goal);
      const nearOpp = nearestOpponentDist(pos, teams, i, opp);
      if (dGoal < C.SHOOT_RANGE) {
        // aim for the open corner, away from where the keeper is standing
        const gk = keeperIndex(opp, ts);
        const kz = pos[gk] ? pos[gk][1] : 0;
        const target: Vec2 = [goal[0], (kz >= 0 ? -1 : 1) * C.GOAL_HALF_WIDTH * 0.72];
        const aim = aimTo(pos[i], target, rng);
        const p = Math.max(0.7, Math.min(1, dGoal / C.SHOOT_RANGE));
        a[2] = aim[0] * p;
        a[3] = aim[1] * p;
        a[5] = 1;
      } else {
        const mate = bestPassTarget(s, pos, i, t, opp, goal);
        if (mate !== null && nearOpp < 2.6) {
          const aim = aimTo(pos[i], pos[mate], rng);
          const d = dist(pos[i], pos[mate]);
          const p = Math.max(0.4, Math.min(1, d / 18));
          a[2] = aim[0] * p;
          a[3] = aim[1] * p;
          a[4] = 1;
        } else {
          const m = moveTo(pos[i], goal, [rng.normal(0, 0.05), rng.normal(0, 0.05)]);
          a[0] = m[0];
          a[1] = m[1];
          const aim = aimTo(pos[i], goal, rng);
          a[2] = aim[0] * 0.2;
          a[3] = aim[1] * 0.2;
        }
      }
      actions.push(a);
      continue;
    }

    if (i === chaser[t]) {
      const m = moveTo(pos[i], intercept, [rng.normal(0, 0.04), rng.normal(0, 0.04)]);
      a[0] = m[0];
      a[1] = m[1];
    } else {
      const slot = t === 0 ? i : i - ts;
      const home: Vec2 = [formations[t][slot][0], formations[t][slot][1]];
      home[0] += ballXNorm * 0.45 * C.HALF_LENGTH;
      home[0] = Math.max(-C.HALF_LENGTH * 0.97, Math.min(C.HALF_LENGTH * 0.97, home[0]));
      const m = moveTo(pos[i], home, undefined, true);
      a[0] = m[0];
      a[1] = m[1];
    }
    actions.push(a);
  }
  return actions;
}
