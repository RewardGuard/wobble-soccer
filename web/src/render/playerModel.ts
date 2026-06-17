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

    // scale so the player is ~2.5 units tall, feet on the ground
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    const s = 2.5 / h;
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;

    const color = new THREE.Color(kit.jersey);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.material = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0 });
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
    this.group.rotation.y = Math.atan2(faceX, faceZ) + Math.PI; // model faces -z by default

    const running = speed > 0.6;
    const rw = THREE.MathUtils.damp(this.run.getEffectiveWeight(), running ? 1 : 0, 10, dt);
    this.run.setEffectiveWeight(rw);
    this.idle.setEffectiveWeight(1 - rw);
    this.run.timeScale = Math.max(0.7, speed / 4.5);
    this.mixer.update(dt);

    this.marker.visible = active;
    if (active) {
      const sc = 1 + Math.sin(performance.now() / 250) * 0.07;
      this.marker.scale.set(sc, sc, sc);
      this.marker.rotation.z += dt * 1.5;
    }
  }
}
