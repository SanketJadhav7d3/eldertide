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


@pytest.mark.parametrize("name, target", [("straight", (12, 2)), ("diagonal", (7, 7))])
def test_walking_speed(cfg, name, target):
    """The game walked 640 px straight and 453 px diagonally, 7 times each (the median is used)."""
    g = make_game(cfg)
    u = g.spawn_unit(0, "worker", 2, 2)
    g.issue(0, Command("move", u.id, x=target[0], y=target[1]))
    ticks = ticks_until(g, lambda: u.cell == target and u.step_to is None)
    real = float(np.median([w["ms"] for w in BROWSER["walks"] if w["name"] == name]))
    assert close(ticks * TICK_MS, real, 0.03), (ticks * TICK_MS, real)


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


# ---------------------------------------------------------------- first hits, arrows, towers


@pytest.mark.parametrize("kind, cells", [("warrior", 1), ("lancer", 1), ("archer", 4)])
def test_first_hit_after_noticing(cfg, kind, cells):
    """From noticing an enemy to the first damage: the attack's wind-up, plus the arrow's flight for
    archers (the game's archer target was 256 px = 4 cells away)."""
    g = make_game(cfg)
    u = g.spawn_unit(0, kind, 5, 5)
    run(g, 3)
    target = g.spawn_unit(1, "worker", 5 + cells, 5)
    target.hp = 1000.0
    noticed = hit = None
    for t in range(1, 100):
        g.tick()
        if noticed is None and u.engaged == target.id:
            noticed = t
        if target.hp < 1000:
            hit = t
            break
    real = np.median([trial["hit"] - trial["noticed"] for trial in BROWSER[f"first_hit_{kind}"]])
    assert abs((hit - noticed) * TICK_MS - real) <= 60, ((hit - noticed) * TICK_MS, real)


def test_noticing_takes_up_to_a_second(cfg):
    """Units look around once a second, so noticing a new enemy takes 0-1 s (the game: 0.07-0.92 s)."""
    observed = [trial["noticed"] for kind in ("warrior", "lancer") for trial in BROWSER[f"first_hit_{kind}"]]
    assert 0 <= min(observed) and max(observed) <= 1000
    assert cfg.scan_ticks * TICK_MS == 1000


def test_tower_shots(cfg):
    g = make_game(cfg)
    g.place_building(0, "tower", 5, 5)
    target = g.spawn_unit(1, "worker", 10, 5)  # 290 px from the tower's centre (the game: 300 px)
    target.hp = 1e6
    hits, last = [], target.hp
    for t in range(1, 100):
        g.tick()
        if target.hp != last:
            hits.append(t * TICK_MS)
            last = target.hp
    real = BROWSER["tower_rate"]
    assert close(np.mean(np.diff(hits)), np.mean(np.diff([h for h, _ in real["hits"]]))), hits
    assert all(d == cfg.tower_damage for _, d in real["hits"])
    # The arrow's flight: from the shot to the damage (the game: shot at 300 px, landing ~0.9 s later).
    flight = np.median([h - s for (h, _), s in zip(real["hits"], real["shots"])])
    assert abs((hits[0] - TICK_MS) - flight * 290 / 300) <= 100


# ---------------------------------------------------------------- orders and groups


def test_guard(cfg):
    real = BROWSER["guard"]
    g = make_game(cfg, width=40, height=24)
    ward = g.spawn_unit(0, "worker", 5, 10)
    guard = g.spawn_unit(0, "warrior", 5, 12)
    g.issue(0, Command("guard", guard.id, target=ward.id))
    run(g, 20)
    g.issue(0, Command("move", ward.id, x=15, y=10))  # 640 px east, as in the game
    gaps = []
    for _ in range(110):
        g.tick()
        gaps.append(np.hypot(guard.x - ward.x, guard.y - ward.y) * CELL_PX)
    # The game's guard stayed within 69 px while walking; the simulator's moves in whole 64 px
    # cells, so it is at most one (diagonal) cell from its spot.
    assert max(gaps) <= real_max_gap(real) + CELL_PX * (2 ** 0.5 - 1) + 1
    near = g.spawn_unit(1, "worker", 18, 10)  # 3 cells from the ward
    far = g.spawn_unit(1, "worker", 15, 19)  # 9 cells from the ward
    near.hp = far.hp = 60.0
    ticks = ticks_until(g, lambda: near.id not in g.entities)
    assert close(ticks * TICK_MS, real["near_killed_ms"], 0.10), (ticks * TICK_MS, real["near_killed_ms"])
    run(g, 15)
    assert far.hp == real["far_health"] == 60
    assert np.hypot(guard.x - ward.x, guard.y - ward.y) * CELL_PX <= real["distance_after"] + 1


def real_max_gap(real):
    return max(gap for t, gap in real["gaps"] if t <= real["ward_walk_ms"])


def test_attack_move(cfg):
    real = BROWSER["attack_move"]
    g = make_game(cfg, width=30)
    u = g.spawn_unit(0, "warrior", 2, 10)
    run(g, 12)
    target = g.spawn_unit(1, "worker", 8, 11)  # beside the route (the game: 2 small cells off it)
    target.hp = 60.0
    g.issue(0, Command("attack_move", u.id, x=14, y=10))  # 768 px east, as in the game
    killed = ticks_until(g, lambda: target.id not in g.entities)
    arrived = killed + ticks_until(g, lambda: u.cell == (14, 10) and u.step_to is None and u.order == "idle")
    assert close(killed * TICK_MS, real["killed_ms"], 0.10), (killed * TICK_MS, real["killed_ms"])
    assert close(arrived * TICK_MS, real["arrived_ms"], 0.06), (arrived * TICK_MS, real["arrived_ms"])


def test_squad_walks_together(cfg):
    """Nine warriors in a 3 x 3 block walk 10 cells east together. The game's squad walked 608 px in
    6.1 s, all arriving together (units walk through each other there); compare time per px."""
    real = BROWSER["squad_move"]["arrivals"]
    g = make_game(cfg, width=40, height=20)
    units = [g.spawn_unit(0, "warrior", 3 + c, 5 + r) for r in range(3) for c in range(3)]
    for i, u in enumerate(units):
        g.issue(0, Command("move", u.id, x=13 + i % 3, y=5 + i // 3))
    ticks = ticks_until(g, lambda: all(u.cell == (13 + i % 3, 5 + i // 3) and u.step_to is None
                                       for i, u in enumerate(units)))
    assert close(ticks * TICK_MS / 640, max(real) / 608, 0.08), (ticks * TICK_MS / 640, max(real) / 608)


def test_four_warriors_clear_four_targets(cfg):
    g = make_game(cfg)
    for i in range(4):
        g.spawn_unit(0, "warrior", 5, 2 + 2 * i)
    run(g, 11)
    targets = [g.spawn_unit(1, "worker", 6, 2 + 2 * i) for i in range(4)]
    for t in targets:
        t.hp = 120.0
    ticks = ticks_until(g, lambda: all(t.id not in g.entities for t in targets))
    real = BROWSER["group_fight"]["cleared_ms"]
    assert close(ticks * TICK_MS, real, 0.08), (ticks * TICK_MS, real)


# ---------------------------------------------------------------- arrows at moving targets


def arrow_hit_rate(cfg, start, end, led, shots_wanted=200, seed=0):
    """An archer shoots at a target walking back and forth between columns `start` and `end`, 4 cells
    (256 px) away, as in the game's scenario. `led`: it moves the way the game leads (an attack-moving
    soldier, stepping like a chaser); otherwise it walks move orders (a worker)."""
    g = make_game(cfg, width=24, height=16, seed=seed)
    g.spawn_unit(0, "archer", 10, 12)
    target = g.spawn_unit(1, "warrior" if led else "worker", start, 8)
    target.hp = 1e9
    order = "attack_move" if led else "move"
    if start != end:
        g.issue(1, Command(order, target.id, x=end, y=8))
    leg, shots, hits, last = 0, 0, 0, target.hp
    loose = g._hit

    def counting(t, damage, owner, arrow_from=None):
        nonlocal shots
        shots += arrow_from is not None
        return loose(t, damage, owner, arrow_from)

    g._hit = counting
    while shots < shots_wanted:
        g.tick()
        if target.hp != last:
            hits, last = hits + 1, target.hp
        if start != end and target.order == "idle":
            leg += 1
            g.issue(1, Command(order, target.id, x=end if leg % 2 == 0 else start, y=8))
    return hits / shots


@pytest.mark.parametrize("name, start, end, led", [
    ("still", 10, 10, False),
    ("long", 6, 14, False),  # the game: 512 px each way
    ("short", 9, 11, False),  # 128 px each way
    ("chase_long", 6, 14, True),
    ("chase_short", 9, 11, True),
])
def test_arrows_at_moving_targets(cfg, name, start, end, led):
    """Hit rates against the game's 25 shots each (so about +-9 points of sampling noise): arrows
    are aimed ahead only at units moving step by step, and must land within 30 px of the target."""
    real = BROWSER[f"arrows_{name}"]
    real_rate = real["hits"] / real["shots"]
    sim_rate = arrow_hit_rate(cfg, start, end, led)
    assert abs(sim_rate - real_rate) <= 0.15, (name, sim_rate, real_rate)
