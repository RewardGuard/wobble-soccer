/**
 * 2026-style World Cup engine: 12 groups of 4 -> top 2 + 8 best thirds (32) ->
 * single-elimination to the final. You play your nation's matches; everything
 * else is quick-simmed from team strength. Pure logic, no rendering.
 */
import { NATIONS, type Nation } from "../data/teams";
import { RNG } from "../sim/rng";

export interface Fixture {
  a: string; b: string;
  ga: number; gb: number;
  played: boolean;
}
export interface Group { name: string; teams: string[]; fixtures: Fixture[]; }
export interface Tie {
  a: string; b: string;
  ga: number; gb: number;
  pka: number; pkb: number; // penalties (knockouts)
  winner: string; played: boolean;
}
export interface Row { code: string; P: number; W: number; D: number; L: number; GF: number; GA: number; Pts: number; }

export type Stage = "group" | "r32" | "r16" | "qf" | "sf" | "final" | "done";
const ROUND_NAMES: Record<string, string> = {
  r32: "Round of 32", r16: "Round of 16", qf: "Quarter-final", sf: "Semi-final", final: "Final",
};

const byCode = new Map(NATIONS.map((n) => [n.code, n]));
export const nation = (code: string): Nation => byCode.get(code)!;

export class Tournament {
  rng: RNG;
  groups: Group[] = [];
  human: string;
  stage: Stage = "group";
  rounds: Record<string, Tie[]> = {}; // r32..final
  humanAlive = true;
  champion = "";

  constructor(human: string, seed = (Math.random() * 1e9) | 0) {
    this.human = human;
    this.rng = new RNG(seed);
    this.draw();
  }

  // ---------------------------------------------------------------- group draw
  private draw() {
    const sorted = [...NATIONS].sort((a, b) => b.strength - a.strength);
    const pots = [sorted.slice(0, 12), sorted.slice(12, 24), sorted.slice(24, 36), sorted.slice(36, 48)];
    pots.forEach((p) => this.shuffle(p));
    const names = "ABCDEFGHIJKL".split("");
    this.groups = names.map((nm) => ({ name: nm, teams: [], fixtures: [] }));
    for (let g = 0; g < 12; g++) for (let pot = 0; pot < 4; pot++) this.groups[g].teams.push(pots[pot][g].code);
    // make sure the human's group is index-findable; fixtures: round robin
    for (const grp of this.groups) {
      const [t0, t1, t2, t3] = grp.teams;
      const fx = (a: string, b: string): Fixture => ({ a, b, ga: 0, gb: 0, played: false });
      grp.fixtures = [fx(t0, t1), fx(t2, t3), fx(t0, t2), fx(t1, t3), fx(t0, t3), fx(t1, t2)];
    }
  }

  humanGroup(): Group {
    return this.groups.find((g) => g.teams.includes(this.human))!;
  }

  /** The human's next unplayed group fixture, or null when their 3 are done. */
  nextHumanGroupFixture(): Fixture | null {
    const g = this.humanGroup();
    return g.fixtures.find((f) => !f.played && (f.a === this.human || f.b === this.human)) || null;
  }

  recordGroupResult(f: Fixture, ga: number, gb: number) {
    f.ga = ga; f.gb = gb; f.played = true;
  }

  /** Auto-sim every remaining group fixture. */
  finishGroupStage() {
    for (const g of this.groups) for (const f of g.fixtures) {
      if (!f.played) {
        const [ga, gb] = this.simScore(f.a, f.b);
        f.ga = ga; f.gb = gb; f.played = true;
      }
    }
  }

  standings(group: Group): Row[] {
    const rows = new Map<string, Row>();
    for (const c of group.teams) rows.set(c, { code: c, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0 });
    for (const f of group.fixtures) {
      if (!f.played) continue;
      const ra = rows.get(f.a)!, rb = rows.get(f.b)!;
      ra.P++; rb.P++; ra.GF += f.ga; ra.GA += f.gb; rb.GF += f.gb; rb.GA += f.ga;
      if (f.ga > f.gb) { ra.W++; rb.L++; ra.Pts += 3; }
      else if (f.ga < f.gb) { rb.W++; ra.L++; rb.Pts += 3; }
      else { ra.D++; rb.D++; ra.Pts++; rb.Pts++; }
    }
    return [...rows.values()].sort(this.cmpRow);
  }

  private cmpRow = (a: Row, b: Row) =>
    b.Pts - a.Pts || (b.GF - b.GA) - (a.GF - a.GA) || b.GF - a.GF || nation(b.code).strength - nation(a.code).strength;

  humanQualified(): boolean {
    return this.qualifiers().includes(this.human);
  }

  /** 32 qualifiers, seeded: winners, runners-up, then 8 best third-placed. */
  qualifiers(): string[] {
    const winners: Row[] = [], runners: Row[] = [], thirds: Row[] = [];
    for (const g of this.groups) {
      const s = this.standings(g);
      winners.push(s[0]); runners.push(s[1]); thirds.push(s[2]);
    }
    winners.sort(this.cmpRow); runners.sort(this.cmpRow); thirds.sort(this.cmpRow);
    return [...winners, ...runners, ...thirds.slice(0, 8)].map((r) => r.code);
  }

  // ---------------------------------------------------------------- knockouts
  startKnockouts() {
    const q = this.qualifiers();
    const ties: Tie[] = [];
    for (let k = 0; k < 16; k++) ties.push(this.tie(q[k], q[31 - k]));
    this.rounds.r32 = ties;
    this.stage = "r32";
  }

  private tie(a: string, b: string): Tie {
    return { a, b, ga: 0, gb: 0, pka: 0, pkb: 0, winner: "", played: false };
  }

  currentRound(): Tie[] {
    return this.rounds[this.stage] || [];
  }

  roundName(): string {
    return ROUND_NAMES[this.stage] || "";
  }

  humanTie(): Tie | null {
    return this.currentRound().find((t) => !t.played && (t.a === this.human || t.b === this.human)) || null;
  }

  recordTie(t: Tie, ga: number, gb: number, pka = 0, pkb = 0) {
    t.ga = ga; t.gb = gb; t.pka = pka; t.pkb = pkb; t.played = true;
    t.winner = ga > gb ? t.a : gb > ga ? t.b : pka >= pkb ? t.a : t.b;
    if ((t.a === this.human || t.b === this.human) && t.winner !== this.human) this.humanAlive = false;
  }

  /** Auto-sim the remaining ties in the current round. */
  finishRound() {
    for (const t of this.currentRound()) if (!t.played) this.simTie(t);
  }

  /** Build the next round from winners; returns true if the cup is decided. */
  advance(): boolean {
    const order: Stage[] = ["r32", "r16", "qf", "sf", "final"];
    const i = order.indexOf(this.stage as Stage);
    const winners = this.currentRound().map((t) => t.winner);
    if (this.stage === "final") {
      this.champion = winners[0];
      this.stage = "done";
      return true;
    }
    const next = order[i + 1];
    const ties: Tie[] = [];
    for (let k = 0; k < winners.length; k += 2) ties.push(this.tie(winners[k], winners[k + 1]));
    this.rounds[next] = ties;
    this.stage = next;
    return false;
  }

  // ---------------------------------------------------------------- quick-sim
  simScore(a: string, b: string): [number, number] {
    const sa = nation(a).strength, sb = nation(b).strength;
    const la = Math.max(0.18, 1.35 + (sa - sb) * 0.03);
    const lb = Math.max(0.18, 1.35 + (sb - sa) * 0.03);
    return [this.poisson(la), this.poisson(lb)];
  }

  private simTie(t: Tie) {
    const [ga, gb] = this.simScore(t.a, t.b);
    if (ga !== gb) { this.recordTie(t, ga, gb); return; }
    // shootout: stronger team slightly favoured
    const sa = nation(t.a).strength, sb = nation(t.b).strength;
    let pa = 0, pb = 0;
    const pA = 0.72 + (sa - sb) * 0.003, pB = 0.72 + (sb - sa) * 0.003;
    for (let i = 0; i < 5; i++) { if (this.rng.next() < pA) pa++; if (this.rng.next() < pB) pb++; }
    while (pa === pb) { pa += this.rng.next() < pA ? 1 : 0; pb += this.rng.next() < pB ? 1 : 0; }
    this.recordTie(t, ga, gb, pa, pb);
  }

  private poisson(lam: number): number {
    const L = Math.exp(-lam);
    let k = 0, p = 1;
    do { k++; p *= this.rng.next(); } while (p > L);
    return k - 1;
  }

  private shuffle<T>(arr: T[]) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}
