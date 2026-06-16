/** Bootstrap: build the sim, scene, HUD and input, then run the game loop. */
import { C } from "./sim/config";
import { SoccerSim } from "./sim/sim";
import { State } from "./sim/state";
import { type Action } from "./sim/action";
import { keeperIndex } from "./sim/ai";
import { GameScene } from "./render/scene";
import type { Kit } from "./render/player3d";
import { HUD } from "./ui/hud";
import { Minimap } from "./ui/minimap";
import { Input } from "./input";

const SKIN = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac"];
const HAIR = ["#2b1d0e", "#171717", "#5a3a1a", "#b88a3a", "#3a2a1a", "#d8c07a"];

function makeKits(teamSize: number): Kit[] {
  const kits: Kit[] = [];
  let seed = 1337;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < teamSize * 2; i++) {
    const team = i < teamSize ? 0 : 1;
    const isKeeper = i === keeperIndex(team, teamSize);
    const jersey = isKeeper ? (team === 0 ? "#43d17a" : "#f4a13c") : team === 0 ? "#e23b3b" : "#3b7be2";
    kits.push({
      jersey,
      shorts: isKeeper ? "#1c1c1c" : "#f4f4f4",
      socks: jersey,
      skin: SKIN[Math.floor(rand() * SKIN.length)],
      hair: HAIR[Math.floor(rand() * HAIR.length)],
      number: isKeeper ? 1 : (team === 0 ? i : i - teamSize) + 1,
    });
  }
  return kits;
}

const TEAM_SIZE = C.TEAM_SIZE;
const sim = new SoccerSim(TEAM_SIZE, C.MATCH_SECONDS, (Math.random() * 1e9) | 0);
const scene = new GameScene(document.getElementById("app")!, makeKits(TEAM_SIZE));
const hud = new HUD();
const minimap = new Minimap();
const input = new Input();

type Mode = "ready" | "playing" | "paused" | "goal" | "over";
let mode: Mode = "ready";
let autoPlay = false; // "T" toggles AI-vs-AI demo (attract mode)
let prev: State = sim.state.clone();
let cur: State = sim.state.clone();
let acc = 0;
let goalTimer = 0;
let last = performance.now();

hud.message("Press <kbd>E</kbd> to kick off");
addEventListener("resize", () => scene.resize());

function startMatch() {
  sim.reset((Math.random() * 1e9) | 0);
  prev = sim.state.clone();
  cur = sim.state.clone();
  acc = 0;
  input.consumeKicks();
  mode = "playing";
  hud.message(null);
}

function loop(now: number) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  // ---- transitions ----
  if (input.justPressed("Escape") || input.justPressed("KeyP")) {
    if (mode === "playing") {
      mode = "paused";
      hud.setPaused(true);
    } else if (mode === "paused") {
      mode = "playing";
      hud.setPaused(false);
    }
  }
  if (input.justPressed("KeyR")) {
    hud.setPaused(false);
    startMatch();
  }
  if (input.justPressed("KeyT")) autoPlay = !autoPlay;
  if (input.justPressed("KeyE") && (mode === "ready" || mode === "over")) {
    startMatch();
  }

  // ---- simulate ----
  if (mode === "goal") {
    goalTimer -= dt;
    if (goalTimer <= 0) {
      mode = "playing";
      hud.message(null);
    }
  } else if (mode === "playing") {
    acc += dt;
    let guard = 0;
    while (acc >= C.DT && guard < 5) {
      const action: Action = autoPlay ? [0, 0, 0, 0, -1, -1] : input.buildAction(cur, scene.camera);
      prev = cur;
      sim.step(action, autoPlay);
      input.consumeKicks();
      cur = sim.state.clone();
      if (cur.lastKicker >= 0) scene.kickAnim(cur.lastKicker);
      acc -= C.DT;
      guard++;
      if (cur.lastGoalTeam >= 0) {
        hud.goal(cur.lastGoalTeam);
        prev = cur.clone(); // snap to kickoff so we don't interpolate across it
        mode = "goal";
        goalTimer = 1.6;
        acc = 0;
        break;
      }
      if (cur.timeLeft <= 0) {
        mode = "over";
        const r = cur.score;
        const who = r[0] === r[1] ? "Full time — Draw" : `Full time — ${r[0] > r[1] ? "CZ" : "EN"} win`;
        hud.message(`${who} ${r[0]}–${r[1]}<br><span style="font-size:18px;opacity:.8">Press <kbd>R</kbd> to play again</span>`);
        break;
      }
    }
  }

  // ---- render ----
  const alpha = mode === "playing" ? acc / C.DT : 0;
  scene.sync(prev, cur, alpha, dt);
  const bx = prev.ballPos[0] + (cur.ballPos[0] - prev.ballPos[0]) * alpha;
  const bz = prev.ballPos[2] + (cur.ballPos[2] - prev.ballPos[2]) * alpha;
  scene.updateCamera(bx, bz, dt);

  if (mode === "playing") {
    input.buildAction(cur, scene.camera); // refresh aim for reticle
    scene.setReticle(input.aim.x, input.aim.z, input.aim.active);
  } else {
    scene.setReticle(0, 0, false);
  }

  hud.update(cur, dt);
  minimap.draw(cur);
  scene.render();
  input.endFrame();
}

requestAnimationFrame(loop);

// Dev-only helpers (stripped from production builds): a fast headless
// AI-vs-AI benchmark for tuning the goal rate, and a state peek.
if (import.meta.env.DEV) {
  (window as any).__bench = (secs = 180, seeds = 6) => {
    const results: number[][] = [];
    let tot = 0;
    for (let k = 0; k < seeds; k++) {
      const s = new SoccerSim(TEAM_SIZE, secs, 1000 + k);
      const steps = Math.round(secs / C.DT);
      for (let i = 0; i < steps; i++) s.step([0, 0, 0, 0, -1, -1], true);
      results.push([...s.state.score]);
      tot += s.state.score[0] + s.state.score[1];
    }
    return { perMatch: results, avgGoals: tot / seeds, secs };
  };
  (window as any).__dbg = () => ({ mode, autoPlay, score: cur.score, timeLeft: Math.round(cur.timeLeft) });
}
