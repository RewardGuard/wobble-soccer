/** Keyboard + mouse -> the shared 6-d action, plus edge-triggered UI keys. */
import * as THREE from "three";
import type { Action } from "./sim/action";
import type { State } from "./sim/state";

export class Input {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private ndc = new THREE.Vector2(0, 0);
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  pendingPass = false;
  pendingShoot = false;
  aim: { x: number; z: number; power: number; active: boolean } = { x: 0, z: 0, power: 0, active: false };

  constructor() {
    addEventListener("keydown", (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
      if (e.code === "KeyQ") this.pendingPass = true;
      if (e.code === "KeyE") this.pendingShoot = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    });
    addEventListener("keyup", (e) => this.held.delete(e.code));
    addEventListener("mousemove", (e) => {
      this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    });
    addEventListener("blur", () => this.held.clear());
  }

  justPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  isSprinting(): boolean {
    return this.held.has("ShiftLeft") || this.held.has("ShiftRight");
  }

  endFrame() {
    this.pressed.clear();
  }

  /** Build the action for the active player; also fills `this.aim` for the reticle. */
  buildAction(state: State, camera: THREE.Camera): Action {
    const k = (c: string) => (this.held.has(c) ? 1 : 0);
    // camera sits behind -x looking +x: W = +x (forward), D = +z (right)
    const moveX = k("KeyW") - k("KeyS");
    const moveZ = k("KeyD") - k("KeyA");

    const ap = state.players[state.activePlayer];
    this.ray.setFromCamera(this.ndc, camera);
    const hit = new THREE.Vector3();
    let ax = ap.face[0];
    let az = ap.face[1];
    let power = 0;
    if (this.ray.ray.intersectPlane(this.ground, hit)) {
      const dx = hit.x - ap.pos[0];
      const dz = hit.z - ap.pos[2];
      const len = Math.hypot(dx, dz);
      if (len > 1e-3) {
        ax = dx / len;
        az = dz / len;
        power = Math.max(0, Math.min(len / 12, 1));
      }
      this.aim = { x: hit.x, z: hit.z, power, active: true };
    } else {
      this.aim.active = false;
    }

    // directed pass: when passing, snap the aim toward the best team-mate near it
    if (this.pendingPass) {
      const mate = this.bestPassTarget(state, ap.pos[0], ap.pos[2], ax, az);
      if (mate) { ax = mate.dx; az = mate.dz; power = mate.power; }
    }

    return [moveX, moveZ, ax * power, az * power, this.pendingPass ? 1 : -1, this.pendingShoot ? 1 : -1];
  }

  /** Find the team-0 team-mate most aligned with the aim direction (aim-assist). */
  private bestPassTarget(state: State, px: number, pz: number, aimX: number, aimZ: number) {
    let best: { dx: number; dz: number; power: number } | null = null;
    let bestDot = 0.72; // ~44° cone
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      if (p.team !== 0 || i === state.activePlayer) continue;
      const dx = p.pos[0] - px;
      const dz = p.pos[2] - pz;
      const d = Math.hypot(dx, dz);
      if (d < 3) continue; // ignore team-mates right on top of us
      const ux = dx / d, uz = dz / d;
      const dot = ux * aimX + uz * aimZ;
      if (dot > bestDot) {
        bestDot = dot;
        best = { dx: ux, dz: uz, power: Math.max(0.45, Math.min(d / 24, 1)) };
      }
    }
    return best;
  }

  consumeKicks() {
    this.pendingPass = false;
    this.pendingShoot = false;
  }
}
