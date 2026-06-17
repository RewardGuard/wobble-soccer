/** Three.js scene: stadium, pitch, goals, 3D players, ball, reticle, follow-cam. */
import * as THREE from "three";
import { C } from "../sim/config";
import type { State } from "../sim/state";
import { makePitchTexture, makeBallTexture } from "./textures";
import { makeStadium } from "./stadium";
import { ModelPlayer, type Kit } from "./playerModel";

class BallView {
  mesh: THREE.Mesh;
  private last = new THREE.Vector3();
  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(C.BALL_RADIUS, 20, 16),
      new THREE.MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.55, metalness: 0 }),
    );
    this.mesh.castShadow = true;
  }
  update(prev: number[], cur: number[], alpha: number) {
    const x = prev[0] + (cur[0] - prev[0]) * alpha;
    const y = prev[1] + (cur[1] - prev[1]) * alpha;
    const z = prev[2] + (cur[2] - prev[2]) * alpha;
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.z -= (x - this.last.x) / C.BALL_RADIUS;
    this.mesh.rotation.x += (z - this.last.z) / C.BALL_RADIUS;
    this.last.set(x, y, z);
  }
}

export class GameScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private players: ModelPlayer[] = [];
  private ball = new BallView();
  private reticle = new THREE.Group();
  private camTarget = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.Fog(0xadd4f0, 90, 220);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
    this.camera.position.set(-16, 17, 0);

    this.buildSky();
    this.buildLights();
    this.buildField();
    this.scene.add(makeStadium());
    this.scene.add(this.ball.mesh);
    this.buildReticle();
    this.resize();
  }

  /** (Re)build the player models for a new match's two teams. */
  setTeams(kits: Kit[]) {
    this.clearPlayers();
    for (const kit of kits) {
      const p = new ModelPlayer(kit);
      this.players.push(p);
      this.scene.add(p.group);
    }
  }

  clearPlayers() {
    for (const p of this.players) this.scene.remove(p.group);
    this.players = [];
  }

  private buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        fog: false,
        uniforms: { top: { value: new THREE.Color(0x2b6fc6) }, bot: { value: new THREE.Color(0xcfeaff) } },
        vertexShader: "varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader: "varying vec3 vP; uniform vec3 top; uniform vec3 bot; void main(){ float h=clamp(normalize(vP).y*0.6+0.35,0.0,1.0); gl_FragColor=vec4(mix(bot,top,h),1.0); }",
      }),
    );
    this.scene.add(sky);
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x4a7a4a, 0.85));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
    sun.position.set(-22, 34, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera as THREE.OrthographicCamera;
    cam.left = -30; cam.right = 30; cam.top = 22; cam.bottom = -22; cam.near = 1; cam.far = 90;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  }

  private buildField() {
    const surround = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshStandardMaterial({ color: 0x2c7a3a, roughness: 1 }),
    );
    surround.rotation.x = -Math.PI / 2;
    surround.position.y = -0.05;
    surround.receiveShadow = true;
    this.scene.add(surround);

    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * C.HALF_LENGTH, 2 * C.HALF_WIDTH),
      new THREE.MeshStandardMaterial({ map: makePitchTexture(), roughness: 0.95 }),
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    this.scene.add(pitch);

    // low boards around the pitch (gaps at the goals)
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.7 });
    const addBox = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), boardMat);
      m.position.set(x, y, z);
      this.scene.add(m);
    };
    for (const s of [-1, 1]) {
      addBox(0, 0.3, s * (C.HALF_WIDTH + 0.25), 2 * C.HALF_LENGTH, 0.6, 0.3);
      const seg = (C.HALF_WIDTH - C.GOAL_HALF_WIDTH) / 2;
      for (const s2 of [-1, 1]) addBox(s * (C.HALF_LENGTH + 0.25), 0.3, s2 * (C.GOAL_HALF_WIDTH + seg / 2), 0.3, 0.6, seg);
    }
    for (const s of [-1, 1]) this.buildGoal(s);
    // corner flags
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.buildCornerFlag(sx, sz);
  }

  private buildGoal(sign: number) {
    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const gw = C.GOAL_HALF_WIDTH;
    const gh = C.GOAL_HEIGHT;
    const x = sign * C.HALF_LENGTH;
    const post = (z: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, gh, 12), postMat);
      m.position.set(x, gh / 2, z);
      m.castShadow = true;
      this.scene.add(m);
    };
    post(-gw); post(gw);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 2 * gw, 12), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(x, gh, 0);
    bar.castShadow = true;
    this.scene.add(bar);
    // net: a translucent wireframe box behind the line
    const net = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, gh, 2 * gw, 6, Math.round(gh), Math.round(gw)),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.22 }),
    );
    net.position.set(x + sign * 0.95, gh / 2, 0);
    this.scene.add(net);
  }

  private buildCornerFlag(sx: number, sz: number) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee }),
    );
    pole.position.set(sx * (C.HALF_LENGTH - 0.3), 0.7, sz * (C.HALF_WIDTH - 0.3));
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.32),
      new THREE.MeshStandardMaterial({ color: 0xffd23f, side: THREE.DoubleSide }),
    );
    flag.position.set(sx * (C.HALF_LENGTH - 0.3) + sx * 0.25, 1.2, sz * (C.HALF_WIDTH - 0.3));
    this.scene.add(pole, flag);
  }

  private buildReticle() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.74, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    this.reticle.add(ring);
    this.reticle.visible = false;
    this.scene.add(this.reticle);
  }

  setReticle(x: number, z: number, visible: boolean) {
    this.reticle.visible = visible;
    if (visible) this.reticle.position.set(x, 0.04, z);
  }

  kickAnim(i: number) {
    if (i >= 0 && i < this.players.length) this.players[i].kick();
  }

  sync(prev: State, cur: State, alpha: number, dt: number) {
    for (let i = 0; i < this.players.length; i++) {
      const p = cur.players[i];
      const pp = prev.players[i];
      const x = pp.pos[0] + (p.pos[0] - pp.pos[0]) * alpha;
      const z = pp.pos[2] + (p.pos[2] - pp.pos[2]) * alpha;
      const speed = Math.hypot(p.vel[0], p.vel[2]);
      this.players[i].update(x, z, p.face[0], p.face[1], speed, i === cur.activePlayer, dt);
    }
    this.ball.update(prev.ballPos, cur.ballPos, alpha);
  }

  updateCamera(targetX: number, targetZ: number, dt: number) {
    const tx = Math.max(-C.HALF_LENGTH * 0.6, Math.min(C.HALF_LENGTH * 0.6, targetX));
    const tz = Math.max(-C.HALF_WIDTH * 0.5, Math.min(C.HALF_WIDTH * 0.5, targetZ));
    this.camTarget.lerp(new THREE.Vector3(tx, 0, tz), 1 - Math.pow(0.0015, dt));
    const desired = new THREE.Vector3(this.camTarget.x - 16, 16, this.camTarget.z);
    this.camera.position.lerp(desired, 1 - Math.pow(0.0008, dt));
    this.camera.lookAt(this.camTarget.x + 6, 1.2, this.camTarget.z);
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
