/**
 * Model loading with optional drop-in "slots". Each role tries to load a GLB
 * from public/models/<name>.glb; if it isn't there, the scene uses a procedural
 * placeholder instead. Drop your own (clearly-licensed) models in to replace any
 * slot — nothing here ships with custom assets.
 *
 *   player.glb    outfield player (rigged, run + idle clips)   [falls back to Xbot.glb]
 *   gk.glb        goalkeeper (rigged)                           [falls back to the player model]
 *   referee.glb   referee (rigged)                              [placeholder: none]
 *   goal.glb      goal                                          [placeholder: procedural posts+net]
 *   stadium.glb   stadium                                       [placeholder: procedural stands]
 *   bench.glb     dugout/bench                                  [placeholder: none]
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

export interface Kit {
  jersey: string;
  shorts: string;
  socks: string;
  skin: string;
  hair: string;
  number: number;
}

type GLTFData = { scene: THREE.Group; animations: THREE.AnimationClip[] };
const cache: Record<string, GLTFData> = {};

async function load(loader: GLTFLoader, base: string, key: string, candidates: string[]) {
  for (const p of candidates) {
    try {
      const g = await loader.loadAsync(`${base}models/${p}`);
      cache[key] = { scene: g.scene, animations: g.animations };
      return;
    } catch {
      /* slot empty / file missing — try next candidate, else leave unset */
    }
  }
}

export async function loadPlayerModel(): Promise<void> {
  if (cache.player) return;
  const loader = new GLTFLoader();
  const base = import.meta.env.BASE_URL;
  await Promise.all([
    load(loader, base, "player", ["player.glb", "Xbot.glb"]),
    load(loader, base, "gk", ["gk.glb", "player.glb", "Xbot.glb"]),
    load(loader, base, "referee", ["referee.glb"]),
    load(loader, base, "goal", ["goal.glb"]),
    load(loader, base, "stadium", ["stadium.glb"]),
    load(loader, base, "bench", ["bench.glb"]),
  ]);
}

export const hasModel = (key: string) => !!cache[key];

/** Clone of a static prop model (goal/stadium/bench), or null if the slot is empty. */
export function staticModel(key: string): THREE.Group | null {
  if (!cache[key]) return null;
  const g = cloneSkinned(cache[key].scene) as THREE.Group;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
  });
  return g;
}

function clipFrom(anims: THREE.AnimationClip[], names: string[]): THREE.AnimationClip | null {
  for (const n of names) {
    const hit = THREE.AnimationClip.findByName(anims, n) || anims.find((c) => c.name.toLowerCase().includes(n));
    if (hit) return hit;
  }
  return anims[0] || null;
}

function makeKitMaterial(kit: Kit, yMin: number, yMax: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uJersey = { value: new THREE.Color(kit.jersey) };
    sh.uniforms.uShorts = { value: new THREE.Color(kit.shorts) };
    sh.uniforms.uSkin = { value: new THREE.Color(kit.skin) };
    sh.uniforms.uSocks = { value: new THREE.Color(kit.socks) };
    sh.uniforms.uHair = { value: new THREE.Color(kit.hair) };
    sh.uniforms.uBoot = { value: new THREE.Color(0x1b1b1b) };
    sh.uniforms.uYMin = { value: yMin };
    sh.uniforms.uYMax = { value: yMax };
    sh.vertexShader = "varying float vKitY;\n" +
      sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vKitY = position.y;");
    sh.fragmentShader =
      "varying float vKitY;\nuniform vec3 uJersey,uShorts,uSkin,uSocks,uHair,uBoot;\nuniform float uYMin,uYMax;\n" +
      sh.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         float kt = (vKitY - uYMin) / max(uYMax - uYMin, 0.0001);
         vec3 kit;
         if (kt > 0.93) kit = uHair;
         else if (kt > 0.84) kit = uSkin;
         else if (kt > 0.46) kit = uJersey;
         else if (kt > 0.34) kit = uShorts;
         else if (kt > 0.12) kit = uSocks;
         else kit = uBoot;
         diffuseColor.rgb = kit;`,
      );
  };
  return m;
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

const RUN_HINTS: Record<string, string[]> = { outfield: ["run"], gk: ["walk", "traverse", "sprint", "run"] };

export class ModelPlayer {
  group = new THREE.Group();
  marker: THREE.Mesh;
  private mixer: THREE.AnimationMixer;
  private idle: THREE.AnimationAction;
  private run: THREE.AnimationAction;

  constructor(kit: Kit, role: "outfield" | "gk" = "outfield") {
    const data = cache[role] || cache.player;
    const model = cloneSkinned(data.scene) as THREE.Group;

    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    const s = (role === "gk" ? 1.7 : 1.6) / h;
    model.scale.set(s * 1.18, s, s * 1.18);
    model.position.y = -box.min.y * s;

    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.geometry.computeBoundingBox();
      const gb = m.geometry.boundingBox!;
      m.material = makeKitMaterial(kit, gb.min.y, gb.max.y);
    });
    this.group.add(model);

    this.mixer = new THREE.AnimationMixer(model);
    this.idle = this.mixer.clipAction(clipFrom(data.animations, ["idle"])!);
    this.run = this.mixer.clipAction(clipFrom(data.animations, RUN_HINTS[role])!);
    this.idle.play();
    this.run.play();
    this.idle.setEffectiveWeight(1);
    this.run.setEffectiveWeight(0);
    this.mixer.update(Math.random());

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.95, 28),
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.03;
    this.marker.visible = false;
    this.group.add(this.marker);
  }

  kick() {}

  update(x: number, z: number, faceX: number, faceZ: number, speed: number, active: boolean, dt: number) {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = dampAngle(this.group.rotation.y, Math.atan2(faceX, faceZ), 12, dt);
    const running = speed > 0.6;
    const rw = THREE.MathUtils.damp(this.run.getEffectiveWeight(), running ? 1 : 0, 10, dt);
    this.run.setEffectiveWeight(rw);
    this.idle.setEffectiveWeight(1 - rw);
    this.run.timeScale = Math.max(0.85, Math.min(speed / 6.5, 1.5));
    this.mixer.update(dt);
    this.marker.visible = active;
    if (active) {
      const sc = 1 + Math.sin(performance.now() / 250) * 0.07;
      this.marker.scale.set(sc, sc, sc);
      this.marker.rotation.z += dt * 1.5;
    }
  }
}

/** A standing/idling referee prop (only used if a referee.glb slot is filled). */
export class RefereeView {
  group = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  constructor() {
    const data = cache.referee;
    if (!data) return;
    const model = cloneSkinned(data.scene) as THREE.Group;
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    const s = 1.65 / h;
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
    this.group.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    const idle = clipFrom(data.animations, ["refidle", "idle"]);
    if (idle) this.mixer.clipAction(idle).play();
  }
  setPos(x: number, z: number, yaw: number) {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = yaw;
  }
  update(dt: number) {
    this.mixer?.update(dt);
  }
}
