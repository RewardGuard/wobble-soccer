/**
 * Player rendered from a rigged, animated glTF humanoid (three.js example model,
 * MIT-licensed) — proper skeletal idle/run animation, tinted per team kit.
 * Loaded once and cloned per player with SkeletonUtils.
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

let GLTF: { scene: THREE.Group; animations: THREE.AnimationClip[] } | null = null;

export async function loadPlayerModel(): Promise<void> {
  if (GLTF) return;
  const loader = new GLTFLoader();
  const g = await loader.loadAsync(`${import.meta.env.BASE_URL}models/Xbot.glb`);
  GLTF = { scene: g.scene, animations: g.animations };
}

/** A kitted material: colours the rigged body by rest-pose height (hair / skin /
 *  jersey / shorts / socks / boots) so the humanoid reads as a footballer. */
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

/** Frame-rate-independent damping toward a target angle (shortest way round). */
function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

const clip = (name: string): THREE.AnimationClip => {
  const clips = GLTF!.animations;
  return (
    THREE.AnimationClip.findByName(clips, name) ||
    clips.find((c) => c.name.toLowerCase().includes(name)) ||
    clips[0]
  );
};

export class ModelPlayer {
  group = new THREE.Group();
  marker: THREE.Mesh;
  private mixer: THREE.AnimationMixer;
  private idle: THREE.AnimationAction;
  private run: THREE.AnimationAction;

  constructor(kit: Kit) {
    const model = cloneSkinned(GLTF!.scene) as THREE.Group;

    // scale so the player is ~1.6 units tall; widen x/z a touch for a stockier,
    // more athletic (less slim) build
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    const s = 1.6 / h;
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
    this.idle = this.mixer.clipAction(clip("idle"));
    this.run = this.mixer.clipAction(clip("run"));
    this.idle.play();
    this.run.play();
    this.idle.setEffectiveWeight(1);
    this.run.setEffectiveWeight(0);
    this.mixer.update(Math.random()); // desync animation phases

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.95, 28),
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.03;
    this.marker.visible = false;
    this.group.add(this.marker);
  }

  // kept for interface compatibility (skeletal model has no separate kick clip)
  kick() {}

  update(x: number, z: number, faceX: number, faceZ: number, speed: number, active: boolean, dt: number) {
    this.group.position.set(x, 0, z);
    // smoothly turn to face the movement direction (Mixamo rig faces +z)
    const targetYaw = Math.atan2(faceX, faceZ);
    this.group.rotation.y = dampAngle(this.group.rotation.y, targetYaw, 12, dt);

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
