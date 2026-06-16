/** The full game state — plain data, cheap to clone (used for render interpolation). */
export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export interface Player {
  pos: Vec3;
  vel: Vec3;
  face: Vec2; // unit facing in x/z
  team: 0 | 1;
  kickCooldown: number;
}

export class State {
  ballPos: Vec3 = [0, 0, 0];
  ballVel: Vec3 = [0, 0, 0];
  players: Player[] = [];
  possession = -1; // player index or -1
  activePlayer = 0; // team-0 index the human is driving
  score: [number, number] = [0, 0];
  timeLeft = 0;
  teamSize = 5;
  lastGoalTeam = -1; // team that scored this step, else -1

  clone(): State {
    const s = new State();
    s.ballPos = [...this.ballPos];
    s.ballVel = [...this.ballVel];
    s.players = this.players.map((p) => ({
      pos: [...p.pos] as Vec3,
      vel: [...p.vel] as Vec3,
      face: [...p.face] as Vec2,
      team: p.team,
      kickCooldown: p.kickCooldown,
    }));
    s.possession = this.possession;
    s.activePlayer = this.activePlayer;
    s.score = [...this.score];
    s.timeLeft = this.timeLeft;
    s.teamSize = this.teamSize;
    s.lastGoalTeam = this.lastGoalTeam;
    return s;
  }

  teamIndices(t: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.players.length; i++) if (this.players[i].team === t) out.push(i);
    return out;
  }
}
