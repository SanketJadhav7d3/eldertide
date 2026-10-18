"""The simulator against measurements of the real browser game (rl/fidelity/browser_measurements.json,
recorded by rl/fidelity/probe.mjs). Each test plays the same scenario in the simulator.

Distances: the browser scenarios use 32 px pathfinding cells; the simulator's cells are 64 px, so
10 browser cells = 5 simulator cells. Times are compared within TOLERANCE.
"""

import json
from pathlib import Path

import numpy as np
import pytest

from conftest import make_game, run
from eldertide_rl.config import CELL_PX, TICK_MS
from eldertide_rl.game import Command

BROWSER = json.loads((Path(__file__).resolve().parents[1] / "fidelity" / "browser_measurements.json").read_text())
TOLERANCE = 0.06  # 6 %: the game times things by animation frames, the simulator by 100 ms ticks


def close(sim_ms, browser_ms, tolerance=TOLERANCE):
    return abs(sim_ms - browser_ms) <= tolerance * browser_ms


def intervals(gains):
    times = [t for t, _ in gains]
    return np.diff(times)


def ticks_until(g, done, limit=2000):
    for t in range(1, limit + 1):
        g.tick()
        if done():
            return t
    raise AssertionError("did not happen")


# ---------------------------------------------------------------- movement


@pytest.mark.parametrize("name, target", [("walk_straight_10cells", (7, 5)), ("walk_diagonal_10cells", (7, 10))])
def test_walking_speed(cfg, name, target):
    g = make_game(cfg)
    u = g.spawn_unit(0, "worker", 2, 5)
    g.issue(0, Command("move", u.id, x=target[0], y=target[1]))
    ticks = ticks_until(g, lambda: u.cell == target and u.step_to is None)
    assert close(ticks * TICK_MS, BROWSER[name]["ms"]), (ticks * TICK_MS, BROWSER[name]["ms"])


# ---------------------------------------------------------------- gathering


def gather(cfg, kind, resource_key):
    g = make_game(cfg)
    u = g.spawn_unit(0, "worker", 5, 5)
    node = g.place_resource(kind, 6, 5)
    g.issue(0, Command("harvest", u.id, target=node.id))
    gains, last = [], g.resources[0][resource_key]
    for t in range(1, 1000):
        g.tick()
        now = g.resources[0][resource_key]
        if now != last:
            gains.append((t * TICK_MS, now - last))
            last = now
        if node.id not in g.entities or len(gains) >= 12:
            break
    return gains


def test_chopping(cfg):
    sim, real = gather(cfg, "tree", "wood"), BROWSER["chop_tree"]["gains"]
    assert [a for _, a in sim] == [a for _, a in real]  # 10 swings of 2 wood
    assert close(np.mean(intervals(sim)), np.mean(intervals(real)))


def test_mining(cfg):
    sim, real = gather(cfg, "mine", "gold"), BROWSER["mine_gold"]["gains"]
    assert [a for _, a in sim] == [a for _, a in real][:len(sim)]
    assert close(np.mean(intervals(sim)), np.mean(intervals(real)))


def test_sheep(cfg):
    sim, real = gather_all(cfg), BROWSER["harvest_sheep"]["gains"]
    assert [a for _, a in sim] == [a for _, a in real]  # butchering gives nothing, then 4 a swing up to 50
    assert close(np.mean(intervals(sim)), np.mean(intervals(real)))


def gather_all(cfg):
    g = make_game(cfg)
    u = g.spawn_unit(0, "worker", 5, 5)
    node = g.place_resource("sheep", 6, 5)
    g.issue(0, Command("harvest", u.id, target=node.id))
    gains, last = [], g.resources[0]["meat"]
    for t in range(1, 1000):
        g.tick()
        if g.resources[0]["meat"] != last:
            gains.append((t * TICK_MS, g.resources[0]["meat"] - last))
            last = g.resources[0]["meat"]
        if node.id not in g.entities:
            return gains
    raise AssertionError("the sheep was not used up")


# ---------------------------------------------------------------- building and training


@pytest.mark.parametrize("workers", [1, 2])
def test_building_a_house(cfg, workers):
    g = make_game(cfg)
    builders = [g.spawn_unit(0, "worker", 5, 5 + i) for i in range(workers)]
    g.issue(0, Command("build", builders[0].id, x=6, y=5, what="house"))
    site = g.entity_at(6, 5)
    for w in builders[1:]:
        g.issue(0, Command("help_build", w.id, target=site.id))
    ticks = ticks_until(g, lambda: site.built)
    real = BROWSER[f"build_house_{workers}_workers"]["build_ms"]
    # With two workers the game's second worker starts a little later; the simulator's work rate
    # (1 point per worker per 100 ms) is the game's, so allow for that start.
    assert close(ticks * TICK_MS, real, 0.06 if workers == 1 else 0.10), (ticks * TICK_MS, real)


def test_training_a_worker(cfg):
    g = make_game(cfg, width=30, height=20)
    castle = g.place_building(0, "castle", 2, 2)
    g.issue(0, Command("train", castle.id, what="worker"))
    ticks = ticks_until(g, lambda: len(g.units(0)) == 1)
    assert close(ticks * TICK_MS, BROWSER["train_worker"]["ms"])


# ---------------------------------------------------------------- combat


@pytest.mark.parametrize("kind, cells", [("warrior", 1), ("lancer", 1), ("archer", 5)])
def test_hitting_speed(cfg, kind, cells):
    g = make_game(cfg)
    u = g.spawn_unit(0, kind, 5, 5)
    target = g.spawn_unit(1, "worker", 5 + cells, 5)  # workers never fight back
    target.hp = 60.0
    hits, last = [], 60.0
    for t in range(1, 500):
        g.tick()
        hp = target.hp  # like the game's, it goes below zero on the killing blow
        if hp != last:
            hits.append((t * TICK_MS, last - hp))
            last = hp
        if target.id not in g.entities:
            break
    real = BROWSER[f"kill_{kind}"]["hits"]
    assert [d for _, d in hits] == [d for _, d in real]  # the same damage per hit and number of hits
    assert close(np.mean(intervals(hits)), np.mean(intervals(real))), (intervals(hits), intervals(real))
    assert u.cell == (5, 5)  # it never had to move, in either


def test_reach(cfg):
    """Which neighbouring cells each unit hits without moving (the game measured with a defensive
    stance): an enemy is hit if it is noticed and within attack reach."""
    for row in BROWSER["reach"]:
        spec = cfg.units[row["kind"]]
        dist = float(np.hypot(row["dx"], row["dy"]))
        sim_hits = dist <= spec.attack_range + 1e-9 and dist <= spec.sight + 1e-9
        assert sim_hits == row["hit"], row


def test_sight(cfg):
    for row in BROWSER["sight"]:
        g = make_game(cfg)
        u = g.spawn_unit(0, "warrior", 5, 5)
        target = g.spawn_unit(1, "worker", 5 + row["cells"], 5)
        target.hp = 1000.0
        run(g, 40)
        assert (target.hp < 1000) == row["engaged"], row


def test_tower_range(cfg):
    measured = BROWSER["tower"]["range"]
    reach_px = cfg.tower_range * CELL_PX
    hit = max(r["dist"] for r in measured if r["hit"])
    miss = min(r["dist"] for r in measured if not r["hit"])
    assert hit <= reach_px < miss


def test_tower_measures_from_its_centre(cfg):
    """The game measures from the tower's centre: 417 px away is shot, 481 px is not (the game hit at
    440 and missed at 460). Measuring from the footprint's nearest cell would reach the second too."""
    g = make_game(cfg)
    g.place_building(0, "tower", 5, 5)  # 2 x 2: centre (5.5, 5.5)
    near = g.spawn_unit(1, "worker", 12, 5)  # 6.52 cells = 417 px from the centre
    far = g.spawn_unit(1, "worker", 13, 6)  # 7.52 cells = 481 px; 7 cells (448 px) from the nearest cell
    run(g, 30)
    assert near.hp < 30 and far.hp == 30
