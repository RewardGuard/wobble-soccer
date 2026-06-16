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

    return [moveX, moveZ, ax * power, az * power, this.pendingPass ? 1 : -1, this.pendingShoot ? 1 : -1];
  }

  consumeKicks() {
    this.pendingPass = false;
    this.pendingShoot = false;
  }
}
