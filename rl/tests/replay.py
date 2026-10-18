"""Fingerprints of whole games, to check that changes made for speed don't change what happens.

    python tests/replay.py record   # writes tests/golden_traces.json from the current simulator
    python tests/replay.py check    # replays and compares (also run by test_replay.py)

Each game is fingerprinted after every decision: every entity's id, position, health and order,
both players' resources, and the observations and masks the agents see.
"""

import hashlib
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from eldertide_rl import DuelEnv, RandomBot, RushBot  # noqa: E402

GOLDEN = Path(__file__).with_name("golden_traces.json")
GAMES = [
    ("rush-rush", 0, lambda: [RushBot(), RushBot()]),
    ("rush-rush", 3, lambda: [RushBot(), RushBot()]),
    ("rush-random", 1, lambda: [RushBot(), RandomBot(seed=5, act_prob=0.5)]),
    ("random-random", 2, lambda: [RandomBot(seed=1, act_prob=0.5), RandomBot(seed=2, act_prob=0.5)]),
]
MAX_STEPS = 400


def fingerprint(env, obs) -> str:
    g = env.game
    h = hashlib.sha256()
    for e in sorted(g.entities.values(), key=lambda e: e.id):
        h.update(repr((e.id, type(e).__name__, e.kind, e.x, e.y, getattr(e, "hp", None), getattr(e, "amount", None),
                       getattr(e, "order", None), getattr(e, "target", None), getattr(e, "engaged", None),
                       getattr(e, "step_to", None), getattr(e, "progress", None), getattr(e, "queue", None))).encode())
    h.update(repr((g.resources, g.tick_count, g.winner)).encode())
    for o in obs:
        h.update(np.ascontiguousarray(o["planes"]).tobytes())
        h.update(np.ascontiguousarray(o["globals"]).tobytes())
        for key in sorted(o["masks"]):
            h.update(np.ascontiguousarray(o["masks"][key]).tobytes())
    return h.hexdigest()[:16]


def play(seed, make_bots):
    env = DuelEnv()
    obs, _ = env.reset(seed=seed)
    bots = make_bots()
    prints, rewards = [fingerprint(env, obs)], []
    for _ in range(MAX_STEPS):
        obs, r, done, info = env.step([bots[p].act(env, p, obs[p]) for p in (0, 1)])
        prints.append(fingerprint(env, obs))
        rewards.append(round(float(r[0]), 12))
        if done:
            break
    return {"prints": prints, "rewards": rewards}


def record():
    traces = {f"{name}/{seed}": play(seed, make) for name, seed, make in GAMES}
    GOLDEN.write_text(json.dumps(traces, indent=0))
    print(f"recorded {sum(len(t['prints']) for t in traces.values())} fingerprints in {GOLDEN.name}")


def check():
    golden = json.loads(GOLDEN.read_text())
    for name, seed, make in GAMES:
        key = f"{name}/{seed}"
        got, want = play(seed, make), golden[key]
        for step, (a, b) in enumerate(zip(got["prints"], want["prints"])):
            assert a == b, f"{key}: the game differs from the recorded one at decision {step}"
        assert len(got["prints"]) == len(want["prints"]), key
        assert got["rewards"] == want["rewards"], key
    return True


if __name__ == "__main__":
    {"record": record, "check": lambda: print("identical" if check() else "")}[sys.argv[1]]()
