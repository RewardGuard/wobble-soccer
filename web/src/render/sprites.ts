/**
 * Procedural 2.5D footballer sprites.  Each player gets an animated run-cycle
 * sprite sheet drawn to a canvas (no external art assets), in front and back
 * views, tinted to the team kit.  The billboard renderer picks a frame/view and
 * flips horizontally for left/right.
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

export interface Sheet {
  tex: THREE.Texture;
  frames: number;
  aspect: number; // cell width / height, for sizing the plane
}

const CELL_W = 128;
const CELL_H = 160;
const FRAMES = 8;

export function makeSheet(kit: Kit, view: "front" | "back"): Sheet {
  const cv = document.createElement("canvas");
  cv.width = CELL_W * FRAMES;
  cv.height = CELL_H;
  const ctx = cv.getContext("2d")!;
  for (let f = 0; f < FRAMES; f++) {
    drawFootballer(ctx, f * CELL_W, 0, CELL_W, CELL_H, f, kit, view);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return { tex, frames: FRAMES, aspect: CELL_W / CELL_H };
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r * (1 + amt))));
  g = Math.max(0, Math.min(255, Math.round(g * (1 + amt))));
  b = Math.max(0, Math.min(255, Math.round(b * (1 + amt))));
  return `rgb(${r},${g},${b})`;
}

function drawFootballer(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  w: number,
  h: number,
  frame: number,
  kit: Kit,
  view: "front" | "back",
) {
  const cx = ox + w / 2;
  const baseline = oy + h * 0.95;
  const phase = (frame / FRAMES) * Math.PI * 2;
  const swing = Math.sin(phase);
  const bob = -Math.abs(Math.sin(phase)) * h * 0.02;

  const legLen = h * 0.32;
  const legW = w * 0.11;
  const hipY = baseline - legLen + bob;
  const footDX = swing * w * 0.11;
  const liftL = Math.max(0, swing) * h * 0.05;
  const liftR = Math.max(0, -swing) * h * 0.05;

  const drawLeg = (dx: number, lift: number) => {
    // sock (team) + boot (dark)
    ctx.fillStyle = kit.socks;
    rr(ctx, cx + dx - legW / 2, hipY, legW, legLen - lift, legW * 0.5);
    ctx.fillStyle = "#2a2a2a";
    rr(ctx, cx + dx - legW / 2 + 1, baseline - lift - h * 0.04, legW + w * 0.03, h * 0.05, legW * 0.5);
  };

  // far leg first, then near leg (subtle depth)
  drawLeg(-footDX, liftR);
  drawLeg(footDX, liftL);

  // shorts
  ctx.fillStyle = kit.shorts;
  rr(ctx, cx - w * 0.21, hipY - h * 0.02, w * 0.42, h * 0.14, w * 0.08);
  ctx.fillStyle = shade(kit.shorts, -0.12);
  rr(ctx, cx - w * 0.21, hipY + h * 0.07, w * 0.42, h * 0.05, w * 0.08);

  // arms (swing opposite the legs)
  const armSwing = -swing;
  const armW = w * 0.08;
  const armY = baseline - legLen - h * 0.18 + bob;
  ctx.fillStyle = kit.skin;
  rr(ctx, cx - w * 0.24 + armSwing * w * 0.02, armY, armW, h * 0.2, armW * 0.5);
  rr(ctx, cx + w * 0.24 - armW - armSwing * w * 0.02, armY, armW, h * 0.2, armW * 0.5);
  // short jersey sleeves over the shoulders
  ctx.fillStyle = kit.jersey;
  rr(ctx, cx - w * 0.25 + armSwing * w * 0.02, armY - h * 0.005, armW + w * 0.02, h * 0.07, armW * 0.5);
  rr(ctx, cx + w * 0.23 - armW - armSwing * w * 0.02, armY - h * 0.005, armW + w * 0.02, h * 0.07, armW * 0.5);

  // torso (jersey)
  const torsoTop = baseline - legLen - h * 0.2 + bob;
  const torsoH = h * 0.24;
  const torsoW = w * 0.44;
  ctx.fillStyle = kit.jersey;
  rr(ctx, cx - torsoW / 2, torsoTop, torsoW, torsoH, w * 0.08);
  ctx.fillStyle = shade(kit.jersey, -0.14);
  rr(ctx, cx - torsoW / 2, torsoTop + torsoH * 0.6, torsoW, torsoH * 0.4, w * 0.08);

  if (view === "back") {
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `bold ${Math.round(h * 0.13)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(kit.number), cx, torsoTop + torsoH * 0.45);
  } else {
    // collar
    ctx.fillStyle = shade(kit.jersey, 0.25);
    rr(ctx, cx - w * 0.07, torsoTop - h * 0.005, w * 0.14, h * 0.03, w * 0.02);
  }

  // head
  const headR = h * 0.1;
  const headCy = torsoTop - headR * 0.7;
  ctx.fillStyle = kit.skin;
  ctx.beginPath();
  ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
  ctx.fill();

  // hair
  ctx.fillStyle = kit.hair;
  ctx.beginPath();
  if (view === "back") {
    ctx.arc(cx, headCy, headR * 1.02, Math.PI * 0.85, Math.PI * 2.15);
    ctx.fill();
  } else {
    ctx.arc(cx, headCy - headR * 0.15, headR, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    // eyes
    ctx.fillStyle = "#33271f";
    ctx.beginPath();
    ctx.arc(cx - headR * 0.35, headCy + headR * 0.15, headR * 0.13, 0, Math.PI * 2);
    ctx.arc(cx + headR * 0.35, headCy + headR * 0.15, headR * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
}
