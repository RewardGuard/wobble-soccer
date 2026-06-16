/**
 * An articulated low-poly 3D footballer, built from primitives (no assets).
 * Real geometry that casts/receives shadows, with a procedural run/idle/kick
 * animation. A big step up from flat sprites.
 */
import * as THREE from "three";

export interface Kit {
  jersey: string;
  shorts: string;
  socks: string;
  skin: string;
  hair: string;
  number: number;
}

const mat = (color: string, rough = 0.85) =>
  new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, metalness: 0 });

export class Player3D {
  group = new THREE.Group();
  marker: THREE.Mesh;
  private body = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private animT = 0;
  private kickT = 0;

  constructor(kit: Kit) {
    const skin = mat(kit.skin);
    const jersey = mat(kit.jersey);
    const shorts = mat(kit.shorts);
    const socks = mat(kit.socks);
    const boot = mat("#1c1c1c", 0.6);
    const hair = mat(kit.hair, 0.9);

    // torso (jersey) + shorts
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.42), jersey);
    torso.position.y = 1.42;
    const shortsMesh = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.34, 0.44), shorts);
    shortsMesh.position.y = 1.02;
    // a number patch on the back
    const num = this.numberPatch(kit);
    num.position.set(0, 1.5, -0.22);

    // head + hair
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 14), skin);
    head.position.y = 2.05;
    const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hair);
    hairMesh.position.y = 2.08;

    this.body.add(torso, shortsMesh, num, head, hairMesh);

    // arms (sleeve + skin), pivot at shoulder
    for (const [g, side] of [[this.armL, -1], [this.armR, 1]] as [THREE.Group, number][]) {
      g.position.set(side * 0.43, 1.8, 0);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.18, 4, 8), jersey);
      sleeve.position.y = -0.18;
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.42, 4, 8), skin);
      arm.position.y = -0.5;
      g.add(sleeve, arm);
      this.body.add(g);
    }

    // legs (skin thigh/shin + sock + boot), pivot at hip
    for (const [g, side] of [[this.legL, -1], [this.legR, 1]] as [THREE.Group, number][]) {
      g.position.set(side * 0.18, 1.0, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.6, 4, 8), skin);
      leg.position.y = -0.42;
      const sock = new THREE.Mesh(new THREE.CapsuleGeometry(0.145, 0.22, 4, 8), socks);
      sock.position.y = -0.66;
      const footMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.4), boot);
      footMesh.position.set(0, -0.86, 0.08);
      g.add(leg, sock, footMesh);
      this.group.add(g);
    }

    this.group.add(this.body);

    // controlled-player ring on the ground
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.95, 28),
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.03;
    this.marker.visible = false;
    this.group.add(this.marker);

    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== this.marker) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  private numberPatch(kit: Kit): THREE.Mesh {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "bold 44px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(kit.number), 32, 34);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    m.rotation.y = Math.PI;
    return m;
  }

  kick() {
    this.kickT = 0.22;
  }

  update(x: number, z: number, faceX: number, faceZ: number, speed: number, active: boolean, dt: number) {
    this.group.position.set(x, 0, z);
    const yaw = Math.atan2(faceX, faceZ);
    this.group.rotation.y = yaw;

    const moving = speed > 0.5;
    if (moving) this.animT += dt * (4 + speed * 1.3);
    const phase = this.animT;
    const swing = moving ? Math.sin(phase) * Math.min(0.3 + speed * 0.035, 0.62) : Math.sin(performance.now() / 600) * 0.05;

    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;

    // body bob + forward lean with speed
    this.body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.06 : 0;
    this.body.rotation.x = Math.min(speed * 0.02, 0.18);

    // kick snap on the right leg
    if (this.kickT > 0) {
      this.kickT -= dt;
      const k = Math.sin((1 - this.kickT / 0.22) * Math.PI);
      this.legR.rotation.x = -k * 1.3;
    }

    this.marker.visible = active;
    if (active) {
      const s = 1 + Math.sin(performance.now() / 250) * 0.07;
      this.marker.scale.set(s, s, s);
      this.marker.rotation.z += dt * 1.5;
    }
  }
}
