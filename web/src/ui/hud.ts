/** Thin DOM HUD: score, clock, center prompt, GOAL flash, pause overlay. */
import type { State } from "../sim/state";

export class HUD {
  private scoreA = document.getElementById("score-a")!;
  private scoreB = document.getElementById("score-b")!;
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
}
