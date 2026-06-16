#!/usr/bin/env python3
"""Play Wobble Soccer in a 3D window.

    python play.py                 # 5-a-side, 60s match
    python play.py --team-size 7   # 7-a-side
    python play.py --seconds 120 --seed 1

Controls:  WASD move  |  mouse aim  |  Q pass  |  E shoot
You control the team-0 (red) player nearest the ball; it auto-switches for you.
"""

import argparse

from wobblesoccer.core import config as C
from wobblesoccer.render import play


def main():
    p = argparse.ArgumentParser(description="Play Wobble Soccer (3D).")
    p.add_argument("--team-size", type=int, default=C.TEAM_SIZE,
                   help="players per side (5 or 7)")
    p.add_argument("--seconds", type=float, default=C.MATCH_SECONDS,
                   help="match length in seconds")
    p.add_argument("--seed", type=int, default=None, help="random seed")
    args = p.parse_args()
    play(team_size=args.team_size, match_seconds=args.seconds, seed=args.seed)


if __name__ == "__main__":
    main()
