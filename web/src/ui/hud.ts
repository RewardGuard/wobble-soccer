/** Thin DOM HUD: score, clock, center prompt, GOAL flash, pause overlay. */
import type { State } from "../sim/state";

export class HUD {
  private root = document.getElementById("hud")!;
  private scoreA = document.getElementById("score-a")!;
  private scoreB = document.getElementById("score-b")!;
  private badgeA = document.querySelector(".badge.red") as HTMLElement;
  private badgeB = document.querySelector(".badge.blue") as HTMLElement;
  private clock = document.getElementById("clock")!;
  private center = document.getElementById("center-msg")!;
  private flash = document.getElementById("goal-flash")!;
  private pause = document.getElementById("pause")!;
  private flashT = 0;

  update(s: State, dt: number) {
    this.scoreA.textContent = String(s.score[0]);
    this.scoreB.textContent = String(s.score[1]);
    const t = Math.max(0, Math.ceil(s.timeLeft));
    const m = Math.floor(t / 60);
    const sec = t % 60;
    this.clock.textContent = `${m}:${sec.toString().padStart(2, "0")}`;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) (this.flash as HTMLElement).style.opacity = "0";
    }
  }

  message(text: string | null) {
    if (text) {
      this.center.innerHTML = text;
      (this.center as HTMLElement).style.opacity = "1";
    } else {
      (this.center as HTMLElement).style.opacity = "0";
    }
  }

  goal(team: number) {
    this.flash.textContent = team === 0 ? "GOAL!" : "GOAL!";
    (this.flash as HTMLElement).style.color = team === 0 ? "#ff6b6b" : "#6bb0ff";
    (this.flash as HTMLElement).style.opacity = "1";
    this.flashT = 1.6;
  }

  setPaused(p: boolean) {
    this.pause.classList.toggle("show", p);
  }

  setVisible(v: boolean) {
    this.root.style.display = v ? "block" : "none";
  }

  setTeams(codeA: string, colorA: string, codeB: string, colorB: string) {
    this.badgeA.textContent = codeA;
    this.badgeA.style.background = colorA;
    this.badgeA.style.color = ink(colorA);
    this.badgeB.textContent = codeB;
    this.badgeB.style.background = colorB;
    this.badgeB.style.color = ink(colorB);
  }
}

function ink(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#1a1a1a" : "#ffffff";
}
