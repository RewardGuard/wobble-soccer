/** App orchestrator: World Cup flow ↔ 3D match ↔ penalty shootout. */
import { C } from "./sim/config";
import { SoccerSim } from "./sim/sim";
import { State } from "./sim/state";
import { type Action } from "./sim/action";
import { keeperIndex } from "./sim/ai";
import { GameScene } from "./render/scene";
import { loadPlayerModel, type Kit } from "./render/playerModel";
import { HUD } from "./ui/hud";
import { Minimap } from "./ui/minimap";
import { Screens } from "./ui/screens";
import { Input } from "./input";
import { Shootout } from "./shootout";
import { Tournament, nation, type Fixture, type Tie } from "./tournament/tournament";
import { awayColor } from "./data/teams";

const TEAM_SIZE = C.TEAM_SIZE;
const MATCH_SECS = 120;
const ZERO: Action = [0, 0, 0, 0, -1, -1];
const SKIN = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac"];
const HAIR = ["#2b1d0e", "#171717", "#5a3a1a", "#b88a3a", "#3a2a1a", "#d8c07a"];

function makeKits(c0: string, c1: string): Kit[] {
  const kits: Kit[] = [];
  let seed = 20260611;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const keeperColor = ["#19e0a6", "#ff5ec7"];
  for (let i = 0; i < TEAM_SIZE * 2; i++) {
    const team = i < TEAM_SIZE ? 0 : 1;
    const isKeeper = i === keeperIndex(team, TEAM_SIZE);
    const base = team === 0 ? c0 : c1;
    kits.push({
      jersey: isKeeper ? keeperColor[team] : base,
      shorts: isKeeper ? "#1c1c1c" : "#f4f4f4",
      socks: isKeeper ? keeperColor[team] : base,
      skin: SKIN[(rand() * SKIN.length) | 0],
      hair: HAIR[(rand() * HAIR.length) | 0],
      number: isKeeper ? 1 : (team === 0 ? i : i - TEAM_SIZE) + 1,
    });
  }
  return kits;
}

// ---- shared singletons ----
const scene = new GameScene(document.getElementById("app")!);
const hud = new HUD();
const minimap = new Minimap();
const input = new Input();
const screens = new Screens();

// ---- app state ----
type Mode = "screen" | "match" | "shootout";
let mode: Mode = "screen";
let T: Tournament | null = null;
let curHome = "", curAway = "";
let curKnockout = false;
let curFixture: Fixture | null = null;
let curTie: Tie | null = null;

// ---- match runtime ----
let sim: SoccerSim | null = null;
let prev = new State();
let cur = new State();
let acc = 0;
let matchMode: "playing" | "goal" | "paused" | "over" = "playing";
let autoPlay = false;
let goalTimer = 0;
let last = performance.now();

addEventListener("resize", () => scene.resize());

// show a loading panel, fetch the player model, then open the menu
const screenEl = document.getElementById("screen")!;
screenEl.className = "show";
screenEl.innerHTML = `<div class="panel"><h1>Loading…</h1></div>`;
loadPlayerModel().then(() => resetToMenu());

function resetToMenu() {
  T = null;
  mode = "screen";
  scene.clearPlayers();
  hud.message(null);
  screens.teamSelect((code) => {
    T = new Tournament(code);
    goToFixture();
  });
}

function goToFixture() {
  if (!T) return;
  mode = "screen";
  if (T.stage === "done") return showFinal();

  if (T.stage === "group") {
    const f = T.nextHumanGroupFixture();
    if (f) {
      setupFixture(f.a, f.b, false, f, null);
      screens.fixture(`${nation(f.a).code} vs ${nation(f.b).code}`, `Group ${T.humanGroup().name} · World Cup 2026`, f.a, f.b, onPlay);
    } else {
      T.finishGroupStage();
      const qualified = T.humanQualified();
      screens.groupResult(T.human, T.humanGroup(), T.standings(T.humanGroup()), qualified, () => {
        if (qualified) { T!.startKnockouts(); goToFixture(); }
        else autoFinish();
      });
    }
  } else {
    const t = T.humanTie();
    if (t) {
      setupFixture(t.a, t.b, true, null, t);
      screens.fixture(`${nation(t.a).code} vs ${nation(t.b).code}`, `${T.roundName()} · World Cup 2026`, t.a, t.b, onPlay);
    } else {
      T.finishRound();
      if (!T.humanAlive) return autoFinish();
      T.advance();
      goToFixture();
    }
  }
}

function setupFixture(home: string, away: string, knockout: boolean, f: Fixture | null, t: Tie | null) {
  curHome = home; curAway = away; curKnockout = knockout; curFixture = f; curTie = t;
}

function onPlay() {
  screens.hide();
  startMatch();
}

function startMatch() {
  const human = T!.human;
  const opp = curHome === human ? curAway : curHome;
  const c0 = nation(human).color;
  const c1 = awayColor(c0, nation(opp).color);
  scene.setTeams(makeKits(c0, c1));
  hud.setTeams(nation(human).code, c0, nation(opp).code, c1);
  sim = new SoccerSim(TEAM_SIZE, MATCH_SECS, (Math.random() * 1e9) | 0);
  prev = sim.state.clone();
  cur = sim.state.clone();
  acc = 0; goalTimer = 0; autoPlay = false; matchMode = "playing";
  hud.message(null); hud.setPaused(false);
  mode = "match";
}

function endMatch() {
  const human = T!.human;
  const hG = cur.score[0], oG = cur.score[1];
  const aG = curHome === human ? hG : oG; // goals for fixture's "a"
  const bG = curHome === human ? oG : hG;

  if (!curKnockout) {
    T!.recordGroupResult(curFixture!, aG, bG);
    goToFixture();
    return;
  }
  if (aG === bG) {
    mode = "shootout";
    const so = new Shootout(curHome, curAway, curHome === human, (pkH, pkA) => {
      T!.recordTie(curTie!, aG, bG, pkH, pkA);
      afterKnockout();
    });
    so.start();
  } else {
    T!.recordTie(curTie!, aG, bG);
    afterKnockout();
  }
}

function afterKnockout() {
  T!.finishRound();
  if (!T!.humanAlive) return autoFinish();
  mode = "screen";
  screens.bracket(T!, () => {
    const done = T!.advance();
    if (done) showFinal();
    else goToFixture();
  });
}

function autoFinish() {
  if (T!.stage === "group") T!.startKnockouts();
  while (T!.stage !== "done") { T!.finishRound(); T!.advance(); }
  showFinal();
}

function showFinal() {
  mode = "screen";
  screens.finalResult(T!.champion, T!.human, resetToMenu);
}

// ---- main loop ----
function stepMatch(dt: number) {
  if (matchMode === "goal") {
    goalTimer -= dt;
    if (goalTimer <= 0) { matchMode = "playing"; hud.message(null); }
    return;
  }
  if (matchMode !== "playing" || !sim) return;
  acc += dt;
  let guard = 0;
  while (acc >= C.DT && guard < 5) {
    const action: Action = autoPlay ? ZERO : input.buildAction(cur, scene.camera);
    prev = cur;
    sim.step(action, autoPlay);
    input.consumeKicks();
    cur = sim.state.clone();
    if (cur.lastKicker >= 0) scene.kickAnim(cur.lastKicker);
    acc -= C.DT;
    guard++;
    if (cur.lastGoalTeam >= 0) { hud.goal(cur.lastGoalTeam); prev = cur.clone(); matchMode = "goal"; goalTimer = 1.6; acc = 0; break; }
    if (cur.timeLeft <= 0) { matchMode = "over"; break; }
  }
  if (matchMode === "over") endMatch();
}

function loop(now: number) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (mode === "match") {
    if (input.justPressed("Escape") || input.justPressed("KeyP")) {
      if (matchMode === "playing") { matchMode = "paused"; hud.setPaused(true); }
      else if (matchMode === "paused") { matchMode = "playing"; hud.setPaused(false); }
    }
    if (input.justPressed("KeyT")) autoPlay = !autoPlay;
    stepMatch(dt);
  }

  hud.setVisible(mode === "match");
  if (mode === "match") {
    const alpha = matchMode === "playing" ? acc / C.DT : 0;
    scene.sync(prev, cur, alpha, dt);
    const bx = prev.ballPos[0] + (cur.ballPos[0] - prev.ballPos[0]) * alpha;
    const bz = prev.ballPos[2] + (cur.ballPos[2] - prev.ballPos[2]) * alpha;
    scene.updateCamera(bx, bz, dt);
    if (matchMode === "playing" && !autoPlay) {
      input.buildAction(cur, scene.camera);
      scene.setReticle(input.aim.x, input.aim.z, input.aim.active);
    } else scene.setReticle(0, 0, false);
    hud.update(cur, dt);
    minimap.draw(cur);
  } else {
    scene.updateCamera(0, 0, dt); // gentle idle view behind menus/shootout
    scene.setReticle(0, 0, false);
  }

  scene.render();
  input.endFrame();
}
requestAnimationFrame(loop);

if (import.meta.env.DEV) {
  (window as any).__bench = (secs = 180, seeds = 6) => {
    const results: number[][] = [];
    let tot = 0;
    for (let k = 0; k < seeds; k++) {
      const s = new SoccerSim(TEAM_SIZE, secs, 1000 + k);
      const steps = Math.round(secs / C.DT);
      for (let i = 0; i < steps; i++) s.step(ZERO, true);
      results.push([...s.state.score]);
      tot += s.state.score[0] + s.state.score[1];
    }
    return { perMatch: results, avgGoals: tot / seeds };
  };
  (window as any).__simTournament = (code: string) => {
    const t = new Tournament(code);
    t.finishGroupStage();
    const q = t.qualifiers();
    const through = q.includes(code);
    t.startKnockouts();
    let guard = 0;
    while (t.stage !== "done" && guard < 12) { t.finishRound(); t.advance(); guard++; }
    return { qualifiers: q.length, through, champion: t.champion, stage: t.stage };
  };
  (window as any).__testGroup = (code: string) => {
    const t = new Tournament(code); t.finishGroupStage();
    screens.groupResult(t.human, t.humanGroup(), t.standings(t.humanGroup()), t.humanQualified(), () => {});
  };
  (window as any).__testBracket = (code: string) => {
    const t = new Tournament(code); t.finishGroupStage(); t.startKnockouts(); t.finishRound();
    screens.bracket(t, () => {});
  };
  (window as any).__testShootout = () => {
    screens.hide();
    hud.setVisible(false);
    mode = "shootout";
    new Shootout("BRA", "KOR", true, (h, a) => {
      mode = "screen";
      (window as any).__soResult = `${h}-${a}`;
      resetToMenu();
    }).start();
  };
}
