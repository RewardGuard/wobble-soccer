/** Full-screen DOM overlays for the World Cup flow (menu, fixtures, tables, bracket). */
import { NATIONS } from "../data/teams";
import { nation, type Group, type Row, type Tie, type Tournament } from "../tournament/tournament";

function chip(code: string, big = false): string {
  const n = nation(code);
  const sz = big ? "w:34px" : "w:22px";
  return `<span class="chip" style="background:${n.color};${sz}"></span><b>${code}</b>`;
}

export class Screens {
  private el = document.getElementById("screen")!;

  hide() {
    this.el.classList.remove("show");
    this.el.innerHTML = "";
  }
  private show(html: string) {
    this.el.innerHTML = html;
    this.el.classList.add("show");
  }

  teamSelect(onPick: (code: string) => void) {
    const cards = [...NATIONS]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (n) => `<button class="team" data-code="${n.code}">
          <span class="chip" style="background:${n.color}"></span>
          <span class="tc">${n.code}</span><span class="tn">${n.name}</span>
          <span class="ts">${n.strength}</span></button>`,
      )
      .join("");
    this.show(`<div class="panel wide">
      <h1>Wobble Soccer · World Cup 2026</h1>
      <p class="sub">Pick your nation. You play its matches in 3D; everything else is simulated.</p>
      <div class="grid">${cards}</div>
    </div>`);
    this.el.querySelectorAll<HTMLButtonElement>(".team").forEach((b) =>
      b.addEventListener("click", () => onPick(b.dataset.code!)),
    );
  }

  fixture(title: string, sub: string, home: string, away: string, onPlay: () => void) {
    this.show(`<div class="panel">
      <p class="stage">${sub}</p>
      <div class="vs">
        <div class="side">${chip(home, true)}<div class="nm">${nation(home).name}</div></div>
        <div class="x">vs</div>
        <div class="side">${chip(away, true)}<div class="nm">${nation(away).name}</div></div>
      </div>
      <h1>${title}</h1>
      <button class="go" id="go-btn">▶ Play match</button>
      <p class="hint2">or press <kbd>E</kbd></p>
    </div>`);
    document.getElementById("go-btn")!.addEventListener("click", onPlay);
  }

  groupResult(human: string, group: Group, rows: Row[], qualified: boolean, onContinue: () => void) {
    const body = rows
      .map(
        (r, i) => `<tr class="${r.code === human ? "me" : ""} ${i < 2 ? "qual" : i === 2 ? "third" : ""}">
        <td class="l">${chip(r.code)}</td><td>${r.P}</td><td>${r.W}</td><td>${r.D}</td>
        <td>${r.L}</td><td>${r.GF}-${r.GA}</td><td><b>${r.Pts}</b></td></tr>`,
      )
      .join("");
    this.show(`<div class="panel">
      <p class="stage">Group ${group.name} · final standings</p>
      <table class="tbl"><thead><tr><th class="l">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF-GA</th><th>Pts</th></tr></thead>
        <tbody>${body}</tbody></table>
      <h1 class="${qualified ? "good" : "bad"}">${qualified ? "Through to the knockouts! 🎉" : "Eliminated in the group stage"}</h1>
      <button class="go" id="go-btn">${qualified ? "Continue ▶" : "See how it ends ▶"}</button>
    </div>`);
    document.getElementById("go-btn")!.addEventListener("click", onContinue);
  }

  bracket(t: Tournament, onContinue: () => void) {
    const ties = t.currentRound();
    const row = (ti: Tie) => {
      const mine = ti.a === t.human || ti.b === t.human;
      const pk = ti.pka || ti.pkb ? ` <i>(${ti.pka}-${ti.pkb} pens)</i>` : "";
      const A = ti.winner === ti.a ? `<b>${ti.a}</b>` : ti.a;
      const B = ti.winner === ti.b ? `<b>${ti.b}</b>` : ti.b;
      return `<div class="tie ${mine ? "me" : ""}">${A} <span>${ti.ga}-${ti.gb}${pk}</span> ${B}</div>`;
    };
    this.show(`<div class="panel">
      <p class="stage">${t.roundName()} · results</p>
      <div class="ties">${ties.map(row).join("")}</div>
      <button class="go" id="go-btn">Continue ▶</button>
    </div>`);
    document.getElementById("go-btn")!.addEventListener("click", onContinue);
  }

  finalResult(champion: string, human: string, onRestart: () => void) {
    const won = champion === human;
    this.show(`<div class="panel">
      <div class="trophy">🏆</div>
      <h1 class="good">${nation(champion).name} are World Champions!</h1>
      <p class="sub">${won ? "You did it — you won the World Cup!" : "Your tournament is over."}</p>
      <button class="go" id="go-btn">Play again ▶</button>
    </div>`);
    document.getElementById("go-btn")!.addEventListener("click", onRestart);
  }
}
