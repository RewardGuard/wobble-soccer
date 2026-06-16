/** A procedural stadium: tiered stands, an instanced crowd, ad boards, floodlights. */
import * as THREE from "three";
import { C } from "../sim/config";

const ROWS = 11;
const STEP_H = 0.72;
const STEP_D = 0.95;
const BASE_Y = 1.0;

export function makeStadium(): THREE.Group {
  const g = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 1 });

  const crowdPos: THREE.Vector3[] = [];
  const innerX = C.HALF_LENGTH + 2.2;
  const innerZ = C.HALF_WIDTH + 2.2;
  const sideLen = 2 * C.HALF_LENGTH + 10;
  const endLen = 2 * C.HALF_WIDTH + 10;

  // four seating banks
  bank(g, concrete, crowdPos, true, 1, innerZ, sideLen);
  bank(g, concrete, crowdPos, true, -1, innerZ, sideLen);
  bank(g, concrete, crowdPos, false, 1, innerX, endLen);
  bank(g, concrete, crowdPos, false, -1, innerX, endLen);

  // one InstancedMesh for the whole crowd
  g.add(makeCrowd(crowdPos));

  // ad boards around the pitch edge
  g.add(makeAdBoards());

  // floodlight towers at the corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(makeFloodlight(sx, sz));

  return g;
}

function bank(
  g: THREE.Group,
  matc: THREE.Material,
  crowd: THREE.Vector3[],
  alongX: boolean,
  side: number,
  inner: number,
  length: number,
) {
  for (let r = 0; r < ROWS; r++) {
    const y = BASE_Y + r * STEP_H;
    const dist = side * (inner + r * STEP_D);
    const step = new THREE.Mesh(
      alongX ? new THREE.BoxGeometry(length, STEP_H + 0.3, STEP_D) : new THREE.BoxGeometry(STEP_D, STEP_H + 0.3, length),
      matc,
    );
    if (alongX) step.position.set(0, y - STEP_H / 2, dist);
    else step.position.set(dist, y - STEP_H / 2, 0);
    g.add(step);

    // seats of people on top of each step
    const n = Math.floor(length / 0.62);
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1) - 0.5) * length;
      const jx = (Math.random() - 0.5) * 0.18;
      const jz = (Math.random() - 0.5) * 0.18;
      if (alongX) crowd.push(new THREE.Vector3(t + jx, y + 0.25, dist + jz));
      else crowd.push(new THREE.Vector3(dist + jz, y + 0.25, t + jx));
    }
  }
}

function makeCrowd(positions: THREE.Vector3[]): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(0.34, 0.55, 0.34);
  const mat = new THREE.MeshStandardMaterial({ roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, positions.length);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < positions.length; i++) {
    dummy.position.copy(positions[i]);
    dummy.scale.setScalar(0.85 + Math.random() * 0.4);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    col.setHSL(Math.random(), 0.55, 0.45 + Math.random() * 0.2);
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function makeAdBoards(): THREE.Group {
  const g = new THREE.Group();
  const colors = [0x2ecc71, 0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0xe67e22];
  const board = (x: number, z: number, w: number, alongX: boolean, idx: number) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? w : 0.2, 0.9, alongX ? 0.2 : w),
      new THREE.MeshStandardMaterial({ color: colors[idx % colors.length], roughness: 0.6, emissive: new THREE.Color(colors[idx % colors.length]).multiplyScalar(0.15) }),
    );
    m.position.set(x, 0.45, z);
    g.add(m);
  };
  const seg = 3.0;
  const nx = Math.floor((2 * C.HALF_LENGTH) / seg);
  for (let i = 0; i < nx; i++) {
    const x = -C.HALF_LENGTH + seg / 2 + i * seg;
    board(x, C.HALF_WIDTH + 0.7, seg - 0.2, true, i);
    board(x, -(C.HALF_WIDTH + 0.7), seg - 0.2, true, i + 3);
  }
  const nz = Math.floor((2 * C.HALF_WIDTH) / seg);
  for (let i = 0; i < nz; i++) {
    const z = -C.HALF_WIDTH + seg / 2 + i * seg;
    board(C.HALF_LENGTH + 0.7, z, seg - 0.2, false, i + 1);
    board(-(C.HALF_LENGTH + 0.7), z, seg - 0.2, false, i + 4);
  }
  return g;
}

function makeFloodlight(sx: number, sz: number): THREE.Group {
  const g = new THREE.Group();
  const x = sx * (C.HALF_LENGTH + 6);
  const z = sz * (C.HALF_WIDTH + 6);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 14, 8),
    new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.7 }),
  );
  pole.position.set(x, 7, z);
  g.add(pole);
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.4, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff7e0, emissiveIntensity: 1.4 }),
  );
  panel.position.set(x, 14, z);
  panel.lookAt(0, 0, 0);
  g.add(panel);
  return g;
}
