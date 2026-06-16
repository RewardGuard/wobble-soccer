/** Three.js scene: pitch, goals, boards, sprite players, ball, reticle, camera. */
import * as THREE from "three";
import { C } from "../sim/config";
import type { Player, State } from "../sim/state";
import { makeBallTexture, makePitchTexture, makeShadowTexture } from "./textures";
import { makeSheet, type Kit, type Sheet } from "./sprites";

const SHADOW = makeShadowTexture();

class PlayerView {
  group = new THREE.Group();
  private sprite: THREE.Mesh;
  private shadow: THREE.Mesh;
  private front: Sheet;
  private back: Sheet;
  private animT = 0;
  private height = 2.9;
  marker: THREE.Mesh;

  constructor(kit: Kit) {
    this.front = makeSheet(kit, "front");
    this.back = makeSheet(kit, "back");
    for (const s of [this.front, this.back]) s.tex.repeat.set(1 / s.frames, 1);

    const w = this.height * this.front.aspect;
    const mat = new THREE.MeshBasicMaterial({
      map: this.front.tex,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    this.sprite = new THREE.Mesh(new THREE.PlaneGeometry(w, this.height), mat);
    this.sprite.position.y = this.height / 2;
    this.group.add(this.sprite);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 1.2),
      new THREE.MeshBasicMaterial({ map: SHADOW, transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.group.add(this.shadow);

    // "you control this one" ring on the ground
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.15, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffe14d,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.04;
    this.marker.visible = false;
    this.group.add(this.marker);
  }

  update(p: Player, prev: Player, alpha: number, active: boolean, camPos: THREE.Vector3, dt: number) {
    const x = prev.pos[0] + (p.pos[0] - prev.pos[0]) * alpha;
    const z = prev.pos[2] + (p.pos[2] - prev.pos[2]) * alpha;
    this.group.position.set(x, 0, z);

    // billboard: face the camera (yaw only)
    const yaw = Math.atan2(camPos.x - x, camPos.z - z);
    this.group.rotation.y = yaw;

    // choose front/back view + flip from facing
    const fx = p.face[0];
    const fz = p.face[1];
    const back = fx > 0.0;
    const sheet = back ? this.back : this.front;
    const mat = this.sprite.material as THREE.MeshBasicMaterial;
    if (mat.map !== sheet.tex) mat.map = sheet.tex;

    const speed = Math.hypot(p.vel[0], p.vel[2]);
    if (speed > 0.5) this.animT += dt * (5 + speed * 1.1);
    else this.animT = 0;
    const frame = Math.floor(this.animT) % sheet.frames;
    sheet.tex.offset.x = frame / sheet.frames;

    const flip = back ? fz > 0 : fz < 0;
    this.sprite.scale.x = flip ? -1 : 1; // front/back sheets share aspect; just mirror

    this.marker.visible = active;
    if (active) {
      const s = 1 + Math.sin(performance.now() / 250) * 0.07;
      this.marker.scale.set(s, s, s);
    }
  }
}

class BallView {
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  private last = new THREE.Vector3();
  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(C.BALL_RADIUS, 18, 14),
      new THREE.MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.7, metalness: 0 }),
    );
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: SHADOW, transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
  }
  update(prev: number[], cur: number[], alpha: number) {
    const x = prev[0] + (cur[0] - prev[0]) * alpha;
    const y = prev[1] + (cur[1] - prev[1]) * alpha;
    const z = prev[2] + (cur[2] - prev[2]) * alpha;
    this.mesh.position.set(x, y, z);
    // roll the ball by how far it moved
    const dx = x - this.last.x;
    const dz = z - this.last.z;
    this.mesh.rotation.z -= dx / C.BALL_RADIUS;
    this.mesh.rotation.x += dz / C.BALL_RADIUS;
    this.last.set(x, y, z);
    const s = 1.6 - Math.min(y / 8, 0.9);
    this.shadow.scale.set(s, s, s);
    const m = this.shadow.material as THREE.MeshBasicMaterial;
    m.opacity = 1 - Math.min(y / 9, 0.8);
    this.shadow.position.set(x, 0.02, z);
  }
}

export class GameScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private players: PlayerView[] = [];
  private ball = new BallView();
  private reticle = new THREE.Group();
  private camTarget = new THREE.Vector3();

  constructor(container: HTMLElement, kits: Kit[]) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x8fd0ef);
    this.scene.fog = new THREE.Fog(0x8fd0ef, 70, 140);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.camera.position.set(-16, 17, 0);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x4a7a4a, 1.05));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(-8, 20, 6);
    this.scene.add(sun);

    this.buildField();
    for (const kit of kits) {
      const pv = new PlayerView(kit);
      this.players.push(pv);
      this.scene.add(pv.group);
    }
    this.scene.add(this.ball.mesh, this.ball.shadow);
    this.buildReticle();
    this.resize();
  }

  private buildField() {
    // grass beyond the boards, to the horizon
    const surround = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshBasicMaterial({ color: 0x2c7a3a }),
    );
    surround.rotation.x = -Math.PI / 2;
    surround.position.y = -0.05;
    this.scene.add(surround);

    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * C.HALF_LENGTH, 2 * C.HALF_WIDTH),
      new THREE.MeshBasicMaterial({ map: makePitchTexture() }),
    );
    pitch.rotation.x = -Math.PI / 2;
    this.scene.add(pitch);

    // perimeter boards (gaps at the goals)
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xedeef0, roughness: 0.8 });
    const addBox = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), boardMat);
      m.position.set(x, y, z);
      this.scene.add(m);
    };
    for (const s of [-1, 1]) {
      addBox(0, 0.4, s * (C.HALF_WIDTH + 0.2), 2 * C.HALF_LENGTH, 0.8, 0.4);
      const seg = (C.HALF_WIDTH - C.GOAL_HALF_WIDTH) / 2;
      for (const s2 of [-1, 1]) {
        addBox(s * (C.HALF_LENGTH + 0.2), 0.4, s2 * (C.GOAL_HALF_WIDTH + seg / 2), 0.4, 0.8, seg);
      }
    }
    // goals
    for (const s of [-1, 1]) this.buildGoal(s);
  }

  private buildGoal(sign: number) {
    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const gw = C.GOAL_HALF_WIDTH;
    const gh = C.GOAL_HEIGHT;
    const x = sign * C.HALF_LENGTH;
    const post = (z: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, gh, 10), postMat);
      m.position.set(x, gh / 2, z);
      this.scene.add(m);
    };
    post(-gw);
    post(gw);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2 * gw, 10), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(x, gh, 0);
    this.scene.add(bar);
    // net
    const net = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, gh, 2 * gw),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, wireframe: true }),
    );
    net.position.set(x + sign * 0.9, gh / 2, 0);
    this.scene.add(net);
  }

  private buildReticle() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    this.reticle.add(ring);
    this.reticle.visible = false;
    this.scene.add(this.reticle);
  }

  setReticle(x: number, z: number, visible: boolean) {
    this.reticle.visible = visible;
    if (visible) this.reticle.position.set(x, 0.03, z);
  }

  sync(prev: State, cur: State, alpha: number, dt: number) {
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].update(cur.players[i], prev.players[i], alpha, i === cur.activePlayer, this.camera.position, dt);
    }
    this.ball.update(prev.ballPos, cur.ballPos, alpha);
  }

  updateCamera(targetX: number, targetZ: number, dt: number) {
    // keep the framing on the pitch instead of panning into the void
    const tx = Math.max(-C.HALF_LENGTH * 0.6, Math.min(C.HALF_LENGTH * 0.6, targetX));
    const tz = Math.max(-C.HALF_WIDTH * 0.5, Math.min(C.HALF_WIDTH * 0.5, targetZ));
    this.camTarget.lerp(new THREE.Vector3(tx, 0, tz), 1 - Math.pow(0.0015, dt));
    const desired = new THREE.Vector3(this.camTarget.x - 16, 17, this.camTarget.z);
    this.camera.position.lerp(desired, 1 - Math.pow(0.0008, dt));
    this.camera.lookAt(this.camTarget.x + 5, 1.2, this.camTarget.z);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
