/** A little radar in the corner: pitch outline + dots for players and the ball. */
import { C } from "../sim/config";
import type { State } from "../sim/state";

export class Minimap {
  private cv = document.getElementById("minimap") as HTMLCanvasElement;
  private ctx = this.cv.getContext("2d")!;

  draw(s: State) {
    const { ctx } = this;
    const W = this.cv.width;
    const H = this.cv.height;
    const pad = 8;
    ctx.clearRect(0, 0, W, H);

    // pitch
    ctx.fillStyle = "rgba(20,60,30,0.65)";
    roundRect(ctx, 0, 0, W, H, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pad, pad, W - 2 * pad, H - 2 * pad);
    ctx.beginPath();
    ctx.moveTo(W / 2, pad);
    ctx.lineTo(W / 2, H - pad);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, (H - 2 * pad) * 0.16, 0, Math.PI * 2);
    ctx.stroke();

    const toPx = (x: number, z: number): [number, number] => [
      pad + ((x + C.HALF_LENGTH) / (2 * C.HALF_LENGTH)) * (W - 2 * pad),
      pad + ((z + C.HALF_WIDTH) / (2 * C.HALF_WIDTH)) * (H - 2 * pad),
    ];

    for (let i = 0; i < s.players.length; i++) {
      const p = s.players[i];
      const [px, py] = toPx(p.pos[0], p.pos[2]);
      ctx.fillStyle = p.team === 0 ? "#e23b3b" : "#3b7be2";
      ctx.beginPath();
      ctx.arc(px, py, i === s.activePlayer ? 4 : 2.6, 0, Math.PI * 2);
      ctx.fill();
      if (i === s.activePlayer) {
        ctx.strokeStyle = "#ffe14d";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    const [bx, by] = toPx(s.ballPos[0], s.ballPos[2]);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(bx, by, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
