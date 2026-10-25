"""Plays a trained policy against the scripted bots and reports how often it wins.

    cd rl
    python -m eldertide_rl.train.evaluate --run-dir /content/drive/MyDrive/eldertide/run1 --games 20
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch

from .games import LEARNER, VecGames
from ..replay import ReplayRecorder
from .model import EldertideNet, load_weights, to_tensors
from .settings import OPPONENTS
from .storage import pad_observations


def load_policy(run_dir: Path, device):
    state = torch.load(Path(run_dir) / "checkpoint.pt", map_location=device, weights_only=False)
    s = state["settings"]
    h, w = state["grid"]
    model = EldertideNet(h, w, s["channels"], s["deep_channels"], s["high_blocks"], s["low_blocks"], s["key_dim"])
    load_weights(model, state["model"])
    return model.to(device).eval(), state


@torch.no_grad()
def play(model, opponent: str, games: int, device, greedy: bool, seed: int, replay_dir: str | None = None) -> dict:
    probs = [1.0 if name == opponent else 0.0 for name in OPPONENTS]
    vec = VecGames(workers=0, games_per_worker=games, seed=seed)
    reports = vec.reset(probs)
    names = {"rush": "RushBot", "random": "RandomBot"}[opponent]
    recorders = []
    for slot in vec.local:
        seat = slot.kinds.index(LEARNER)
        recorders.append(ReplayRecorder(slot.env, ("Agent", names) if seat == 0 else (names, "Agent"))
                         if replay_dir else None)
    scores, lengths, running = [], [], [True] * games
    while any(running):
        chosen = [dict() for _ in range(games)]
        keys = [(g, p) for g, rep in enumerate(reports) for p in (0, 1) if running[g] and rep.kinds[p] == LEARNER]
        if keys:
            obs = [reports[g].obs[p] for g, p in keys]
            actions = model(to_tensors(pad_observations(obs), device), greedy=greedy)[0].cpu().numpy()
            for i, (g, p) in enumerate(keys):
                chosen[g][p] = actions[i, :len(obs[i].cells)]
        stepped = []
        for g, slot in enumerate(vec.local):
            if not running[g]:
                stepped.append(reports[g])
                continue
            if recorders and recorders[g] is not None:
                slot.recorder = recorders[g]  # record this game (the slot saves nothing itself)
            rep = slot.step(chosen[g], probs)
            if rep.finished and recorders and recorders[g] is not None:
                path = Path(replay_dir) / f"eval_{opponent}_{g:02d}.json.gz"
                print(f"  replay: {recorders[g].save(path)}")
            if rep.finished:
                seat = rep.finished["kinds"].index(LEARNER)
                w = rep.finished["winner"]
                scores.append(1.0 if w == seat else 0.5 if w == -1 else 0.0)
                lengths.append(rep.finished["decisions"])
                running[g] = False
            stepped.append(rep)
        reports = stepped
    return {"opponent": opponent, "games": games, "score": float(np.mean(scores)),
            "wins": int(sum(s == 1.0 for s in scores)), "draws": int(sum(s == 0.5 for s in scores)),
            "mean_decisions": float(np.mean(lengths))}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--games", type=int, default=10)
    parser.add_argument("--opponents", nargs="+", default=["random", "rush"], choices=["random", "rush"])
    parser.add_argument("--greedy", action="store_true", help="always take the most likely action")
    parser.add_argument("--seed", type=int, default=12345)
    parser.add_argument("--replay-dir", help="save a replay of every game here, to watch in the browser game")
    args = parser.parse_args(argv)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, state = load_policy(Path(args.run_dir), device)
    print(f"Policy from update {state['update']} ({state['env_steps']:,} env steps)")
    for opponent in args.opponents:
        result = play(model, opponent, args.games, device, args.greedy, args.seed, args.replay_dir)
        print(json.dumps(result))


if __name__ == "__main__":
    main()
