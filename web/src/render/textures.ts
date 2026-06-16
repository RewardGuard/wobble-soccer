/** Procedurally drawn textures: the pitch, the ball, and a soft blob shadow. */
import * as THREE from "three";
import { C } from "../sim/config";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext("2d")!];
}

/** A mown-stripe pitch with crisp white markings. */
export function makePitchTexture(): THREE.Texture {
  const W = 2048;
  const H = Math.round((W * C.HALF_WIDTH) / C.HALF_LENGTH); // keep aspect = 40:26
  const [cv, ctx] = canvas(W, H);

  // field x runs along canvas width; field z along canvas height.
  const stripes = 14;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#3aa64a" : "#349d44";
    ctx.fillRect((i * W) / stripes, 0, W / stripes + 1, H);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.round(W * 0.0045);
  ctx.lineCap = "round";
  const m = Math.round(W * 0.02); // inside-the-boards margin
  const fx = m;
  const fy = m;
  const fw = W - 2 * m;
  const fh = H - 2 * m;

  ctx.strokeRect(fx, fy, fw, fh); // touchlines
  // halfway line
  ctx.beginPath();
  ctx.moveTo(W / 2, fy);
  ctx.lineTo(W / 2, fy + fh);
  ctx.stroke();
  // center circle + spot
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, fh * 0.18, 0, Math.PI * 2);
  ctx.stroke();
  dot(ctx, W / 2, H / 2, W * 0.004);

  // penalty + goal boxes both ends
  const pbW = fw * 0.13;
  const pbH = fh * 0.6;
  const gbW = fw * 0.05;
  const gbH = fh * 0.32;
  for (const end of [0, 1]) {
    const x0 = end === 0 ? fx : fx + fw - pbW;
    ctx.strokeRect(x0, fy + (fh - pbH) / 2, pbW, pbH);
    const gx0 = end === 0 ? fx : fx + fw - gbW;
    ctx.strokeRect(gx0, fy + (fh - gbH) / 2, gbW, gbH);
    const spotX = end === 0 ? fx + pbW * 0.68 : fx + fw - pbW * 0.68;
    dot(ctx, spotX, H / 2, W * 0.0035);
    // penalty arc
    ctx.beginPath();
    const a = end === 0 ? -Math.PI / 2.7 : Math.PI - Math.PI / 2.7;
    const b = end === 0 ? Math.PI / 2.7 : Math.PI + Math.PI / 2.7;
    ctx.arc(spotX, H / 2, fh * 0.18, a, b);
    ctx.stroke();
  }
  // corner arcs
  const cr = W * 0.012;
  corner(ctx, fx, fy, cr, 0);
  corner(ctx, fx + fw, fy, cr, 1);
  corner(ctx, fx + fw, fy + fh, cr, 2);
  corner(ctx, fx, fy + fh, cr, 3);

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function corner(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, q: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, (q * Math.PI) / 2, (q * Math.PI) / 2 + Math.PI / 2);
  ctx.stroke();
}

/** Classic white ball with a few dark pentagons. */
export function makeBallTexture(): THREE.Texture {
  const [cv, ctx] = canvas(256, 256);
  ctx.fillStyle = "#f7f7f7";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#222";
  const cx = 128;
  const cy = 128;
  pentagon(ctx, cx, cy, 30);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    pentagon(ctx, cx + Math.cos(a) * 70, cy + Math.sin(a) * 70, 20, a);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function pentagon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = rot + (i / 5) * Math.PI * 2 - Math.PI / 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** Soft round shadow (radial gradient) for the blob shadows under entities. */
export function makeShadowTexture(): THREE.Texture {
  const [cv, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(0,0,0,0.45)");
  g.addColorStop(0.7, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}
