/**
 * Penalty shootout — a self-contained canvas mini-game over the 3D stadium.
 * You aim your team's kicks and dive for the opponent's. Best of 5, then sudden
 * death. Calls onDone(pkHome, pkAway) when decided.
 */
import { nation } from "./tournament/tournament";
import { commentary } from "./commentary";

type Phase = "shoot" | "dive" | "anim" | "result" | "done";

const ZONES = 6; // 3 columns x 2 rows
const SAVE_ON_MATCH = 0.82; // keeper saves if dive matches shot zone
const MISS_CHANCE = 0.08; // shot off target

export class Shootout {
  private cv = document.getElementById("shootout") as HTMLCanvasElement;
  private ui = document.getElementById("shootout-ui")!;
  private ctx = this.cv.getContext("2d")!;
  private phase: Phase = "shoot";
  private kick = 0; // index of current kick (0-based, alternating)
  private scoreH = 0;
  private scoreA = 0;
  private shotZone = -1;
  private diveZone = -1;
  private animT = 0;
  private resultText = "";
  private resultGood = false;
  private resultsH: (boolean | null)[] = [];
  private resultsA: (boolean | null)[] = [];
  private raf = 0;
  private last = 0;

  constructor(
    private home: string,
    private away: string,
    private humanIsHome: boolean,
    private onDone: (pkHome: number, pkAway: number) => void,
  ) {}

  start() {
    this.cv.style.display = "block";
    this.ui.style.display = "block";
    this.resize();
    window.addEventListener("resize", this.resize);
    this.cv.addEventListener("click", this.onClick);
    window.addEventListener("keydown", this.onKey);
    this.beginKick();
    this.last = performance.now();
    this.loop(this.last);
  }

  private stop() {
    cancelAnimationFrame(this.raf);
    this.cv.style.display = "none";
    this.ui.style.display = "none";
    window.removeEventListener("resize", this.resize);
    this.cv.removeEventListener("click", this.onClick);
    window.removeEventListener("keydown", this.onKey);
  }

  private homeShooting(): boolean {
    return this.kick % 2 === 0; // home takes even kicks
  }
  private humanActing(): boolean {
    // human shoots when their team is shooting; otherwise dives
    return this.homeShooting() === this.humanIsHome;
  }

  private beginKick() {
    this.shotZone = this.diveZone = -1;
    this.phase = this.humanActing() ? "shoot" : "dive";
    if (!this.humanActing()) this.phase = "dive"; // human defends
    this.prompt();
  }

  private prompt() {
    const shootingTeam = this.homeShooting() ? this.home : this.away;
    if (this.phase === "shoot") this.ui.textContent = `Your kick — click where to shoot`;
    else if (this.phase === "dive") this.ui.textContent = `${nation(shootingTeam).code} to shoot — click where to dive`;
    else this.ui.textContent = "";
  }

  private onKey = (e: KeyboardEvent) => {
    const map: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5 };
    if (e.code in map) this.choose(map[e.code]);
  };

  private onClick = (e: MouseEvent) => {
    const r = this.cv.getBoundingClientRect();
    const z = this.zoneAt(e.clientX - r.left, e.clientY - r.top);
    if (z >= 0) this.choose(z);
  };

  private choose(z: number) {
    if (this.phase === "shoot") {
      this.shotZone = z;
      this.diveZone = this.aiZone();
    } else if (this.phase === "dive") {
      this.diveZone = z;
      this.shotZone = this.aiZone();
    } else return;
    this.phase = "anim";
    this.animT = 0;
    this.ui.textContent = "";
  }

  private aiZone(): number {
    // favour corners a bit
    const corners = [0, 2, 3, 5];
    return Math.random() < 0.7 ? corners[(Math.random() * corners.length) | 0] : (Math.random() * ZONES) | 0;
  }

  private resolve() {
    const missed = Math.random() < MISS_CHANCE;
    const saved = !missed && this.diveZone === this.shotZone && Math.random() < SAVE_ON_MATCH;
    const scored = !missed && !saved;
    if (this.homeShooting()) { this.resultsH.push(scored); if (scored) this.scoreH++; }
    else { this.resultsA.push(scored); if (scored) this.scoreA++; }
    this.resultText = scored ? "GOAL!" : saved ? "SAVED!" : "MISS!";
    this.resultGood = scored;
    commentary.penalty(scored ? "goal" : saved ? "save" : "miss");
    this.phase = "result";
    this.animT = 0;
  }

  private decided(): boolean {
    const h = this.resultsH.length, a = this.resultsA.length;
    const hRemain = Math.max(0, 5 - h), aRemain = Math.max(0, 5 - a);
    if (h <= 5 || a <= 5) {
      if (this.scoreH > this.scoreA + aRemain) return true;
      if (this.scoreA > this.scoreH + hRemain) return true;
    }
    if (h >= 5 && a >= 5 && h === a && this.scoreH !== this.scoreA) return true;
    return false;
  }

  private next() {
    if (this.decided()) {
      this.stop();
      this.onDone(this.scoreH, this.scoreA);
      return;
    }
    this.kick++;
    this.beginKick();
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    if (this.phase === "anim") {
      this.animT += dt;
      if (this.animT >= 0.6) this.resolve();
    } else if (this.phase === "result") {
      this.animT += dt;
      if (this.animT >= 1.2) this.next();
    }
    this.draw();
  };

  // ---- geometry / drawing ----
  private goalRect() {
    const W = this.cv.width, H = this.cv.height;
    const gw = Math.min(W * 0.6, 760);
    const gh = gw * 0.42;
    return { x: (W - gw) / 2, y: H * 0.26, w: gw, h: gh };
  }
  private zoneRect(z: number) {
    const g = this.goalRect();
    const col = z % 3, rowi = Math.floor(z / 3);
    return { x: g.x + (col * g.w) / 3, y: g.y + (rowi * g.h) / 2, w: g.w / 3, h: g.h / 2 };
  }
  private zoneAt(px: number, py: number): number {
    for (let z = 0; z < ZONES; z++) {
      const r = this.zoneRect(z);
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return z;
    }
    return -1;
  }

  private draw() {
    const { ctx } = this;
    const W = this.cv.width, H = this.cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(6,12,8,0.55)";
    ctx.fillRect(0, 0, W, H);

    const g = this.goalRect();
    // posts
    ctx.fillStyle = "#fff";
    const t = 10;
    ctx.fillRect(g.x - t, g.y - t, g.w + 2 * t, t);
    ctx.fillRect(g.x - t, g.y - t, t, g.h + t);
    ctx.fillRect(g.x + g.w, g.y - t, t, g.h + t);
    // net
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 12; i++) { ctx.beginPath(); ctx.moveTo(g.x + (i * g.w) / 12, g.y); ctx.lineTo(g.x + (i * g.w) / 12, g.y + g.h); ctx.stroke(); }
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(g.x, g.y + (i * g.h) / 6); ctx.lineTo(g.x + g.w, g.y + (i * g.h) / 6); ctx.stroke(); }

    // clickable zones during shoot/dive
    if (this.phase === "shoot" || this.phase === "dive") {
      for (let z = 0; z < ZONES; z++) {
        const r = this.zoneRect(z);
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.font = "bold 22px Trebuchet MS";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(z + 1), r.x + r.w / 2, r.y + r.h / 2);
      }
    }

    // keeper + ball during anim/result
    const shooterCode = this.homeShooting() ? this.home : this.away;
    const keeperCode = this.homeShooting() ? this.away : this.home;
    if (this.phase === "anim" || this.phase === "result") {
      const p = Math.min(this.animT / 0.6, 1);
      // keeper dives toward dive zone
      const dz = this.zoneRect(this.diveZone);
      const kx = g.x + g.w / 2 + (dz.x + dz.w / 2 - (g.x + g.w / 2)) * p;
      const ky = g.y + g.h * 0.7 + (dz.y + dz.h / 2 - (g.y + g.h * 0.7)) * p * 0.6;
      ctx.fillStyle = nation(keeperCode).color;
      ctx.beginPath(); ctx.ellipse(kx, ky, 28, 40, 0, 0, Math.PI * 2); ctx.fill();
      // ball flies toward shot zone
      const sz = this.zoneRect(this.shotZone);
      const bx = W / 2 + (sz.x + sz.w / 2 - W / 2) * p;
      const by = H * 0.78 + (sz.y + sz.h / 2 - H * 0.78) * p;
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(bx, by, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#222"; ctx.lineWidth = 2; ctx.stroke();
    } else {
      // ball waiting on the spot
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(W / 2, H * 0.78, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#222"; ctx.lineWidth = 2; ctx.stroke();
    }

    // result banner
    if (this.phase === "result") {
      ctx.fillStyle = this.resultGood ? "#5ee06b" : "#ff7a7a";
      ctx.font = "900 64px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText(this.resultText, W / 2, H * 0.5);
    }

    // tallies
    this.drawTally(this.home, this.resultsH, H * 0.1);
    this.drawTally(this.away, this.resultsA, H * 0.1 + 40);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 30px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText(`${nation(this.home).code}  ${this.scoreH} - ${this.scoreA}  ${nation(this.away).code}`, W / 2, H * 0.06);
    void shooterCode;
  }

  private drawTally(code: string, results: (boolean | null)[], y: number) {
    const ctx = this.ctx;
    const W = this.cv.width;
    const x0 = W / 2 - 130;
    ctx.fillStyle = nation(code).color;
    ctx.font = "bold 16px Trebuchet MS";
    ctx.textAlign = "right";
    ctx.fillText(nation(code).code, x0 - 10, y + 6);
    for (let i = 0; i < Math.max(5, results.length); i++) {
      const r = results[i];
      ctx.beginPath();
      ctx.arc(x0 + 14 + i * 26, y, 8, 0, Math.PI * 2);
      if (r === undefined) { ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 2; ctx.stroke(); }
      else { ctx.fillStyle = r ? "#5ee06b" : "#ff7a7a"; ctx.fill(); }
    }
  }

  private resize = () => {
    this.cv.width = window.innerWidth;
    this.cv.height = window.innerHeight;
  };
}
