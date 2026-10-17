"""Watch two bots play a duel in the terminal.

    python play.py                      # RushBot vs RandomBot
    python play.py rush rush --seed 3   # a mirror match
    python play.py rush noop --show 100 # print the map every 100 decisions
"""

import argparse
import time

from eldertide_rl import DuelEnv, NoopBot, RandomBot, RushBot, render
from eldertide_rl.config import TICK_MS

BOTS = {"rush": RushBot, "random": RandomBot, "noop": NoopBot}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("blue", nargs="?", default="rush", choices=BOTS)
    parser.add_argument("red", nargs="?", default="random", choices=BOTS)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--show", type=int, default=0, help="print the map every N decisions (0: only at the end)")
    args = parser.parse_args()

    env = DuelEnv()
    obs, info = env.reset(seed=args.seed)
    bots = [BOTS[args.blue](), BOTS[args.red]()]
    returns, steps, done = [0.0, 0.0], 0, False
    start = time.perf_counter()
    while not done:
        obs, rewards, done, info = env.step([bots[p].act(env, p, obs[p]) for p in (0, 1)])
        returns = [r + x for r, x in zip(returns, rewards)]
        steps += 1
        if args.show and steps % args.show == 0:
            print(render(env.game), "\n")
    elapsed = time.perf_counter() - start

    print(render(env.game))
    winner = {0: f"blue ({args.blue})", 1: f"red ({args.red})", -1: "nobody (draw)"}[info["winner"]]
    minutes = info["tick"] * TICK_MS / 60000
    print(f"\nWinner: {winner} after {minutes:.1f} game minutes ({steps} decisions, {elapsed:.1f} s, "
          f"{steps / elapsed:.0f} decisions/s)")
    print(f"Returns: blue {returns[0]:+.2f}, red {returns[1]:+.2f}")
    for name, stats in zip(("blue", "red"), info["stats"]):
        print(f"{name:>5}: " + ", ".join(f"{k} {v:g}" for k, v in stats.items()))


if __name__ == "__main__":
    main()
