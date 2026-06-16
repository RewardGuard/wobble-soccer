/**
 * The shared 6-d action: [move_x, move_z, aim_x, aim_z, pass, shoot], in [-1,1].
 * aim magnitude (0..1) sets kick power.  Same encoding the Python RL env uses.
 */
import type { Vec2 } from "./state";

export type Action = [number, number, number, number, number, number];

export interface Intent {
  move: Vec2; // clipped to unit length
  aimDir: Vec2; // unit vector (falls back to facing)
  power: number; // 0..1
  doPass: boolean;
  doShoot: boolean;
}

const EPS = 1e-6;

export function decode(raw: Action, facing: Vec2): Intent {
  let move: Vec2 = [raw[0], raw[1]];
  const mlen = Math.hypot(move[0], move[1]);
  if (mlen > 1) move = [move[0] / mlen, move[1] / mlen];

  const aim: Vec2 = [raw[2], raw[3]];
  const alen = Math.hypot(aim[0], aim[1]);
  let aimDir: Vec2;
  let power: number;
  if (alen > EPS) {
    aimDir = [aim[0] / alen, aim[1] / alen];
    power = Math.min(alen, 1);
  } else {
    aimDir = [facing[0], facing[1]];
    power = 0;
  }

  const doShoot = raw[5] > 0;
  const doPass = raw[4] > 0 && !doShoot;
  return { move, aimDir, power, doPass, doShoot };
}

export function zeroAction(): Action {
  return [0, 0, 0, 0, -1, -1];
}
