"""Game rules, checked tick by tick against the timings taken from the browser game."""

import numpy as np

from conftest import make_game, run
from eldertide_rl.config import DEFAULT_MAP
from eldertide_rl.game import ATTACK_MOVE, BUILD, GUARD, HARVEST, IDLE, Command, Game, Resource
from eldertide_rl.mapdata import crop_to_land, load_map, mirror_west_half


def start_wood(g, p=0):
    return g.resources[p]["wood"]


# ---------------------------------------------------------------- setup


def test_duel_start_is_mirrored(cfg):
    m = mirror_west_half(load_map(DEFAULT_MAP))
    g = Game.duel(m, cfg, seed=4)
    w = g.width
    c0, c1 = g.castle(0), g.castle(1)
    assert c0.built and c1.built and (c1.x, c1.y) == (w - c0.x - c0.w, c0.y)
    kinds0 = sorted((u.kind, w - 1 - u.x, u.y) for u in g.units(0))
    kinds1 = sorted((u.kind, u.x, u.y) for u in g.units(1))
    assert kinds0 == kinds1 and len(kinds0) == 7
    assert sorted(u.kind for u in g.units(0)) == ["archer", "archer", "lancer", "lancer", "warrior", "worker", "worker"]
    trees = {r.cell for r in g.resource_nodes("tree")}
    assert trees and trees == {(w - 1 - x, y) for x, y in trees}
    assert g.population(0) == (7, 0, cfg.pop_base + cfg.pop_castle)
    assert g.resources[0] == g.resources[1] == cfg.start_resources
    assert len(g.resource_nodes("sheep")) == 2 * cfg.sheep_per_side
    assert g._path_between_starts(ignore_trees=False) is not None


def test_cropping_does_not_change_the_start(cfg):
    full = mirror_west_half(load_map(DEFAULT_MAP))
    small = crop_to_land(full)
    ox, oy = small.origin

    def layout(g, dx, dy):  # castles, units and mines (trees and sheep are random)
        return sorted((type(e).__name__, e.kind, getattr(e, "owner", -1), e.x + dx, e.y + dy)
                      for e in g.entities.values() if not (isinstance(e, Resource) and e.kind in ("tree", "sheep")))

    assert layout(Game.duel(full, cfg, seed=0), 0, 0) == layout(Game.duel(small, cfg, seed=0), ox, oy)


# ---------------------------------------------------------------- gathering


def test_chopping_a_tree_then_moving_on(cfg):
    g = make_game(cfg)
    u = g.spawn_unit(0, "worker", 5, 5)
    tree = g.place_resource("tree", 6, 5)
    second = g.place_resource("tree", 10, 5)
    wood = start_wood(g)
    assert g.issue(0, Command("harvest", u.id, target=tree.id))
    run(g, 54)  # swings land on ticks 1, 7, 13, ...: nine so far
    assert start_wood(g) == wood + 9 * cfg.wood_per_swing and tree.id in g.entities
    run(g, 1)  # the tenth swing fells it
    assert start_wood(g) == wood + 20 and tree.id not in g.entities
    assert u.order == HARVEST
    run(g, 60)
    assert u.target == second.id and start_wood(g) > wood + 20  # walked to the next tree on its own


def test_sheep_and_gold(cfg):
    g = make_game(cfg)
    a = g.spawn_unit(0, "worker", 5, 5)
    sheep = g.place_resource("sheep", 6, 5)
    b = g.spawn_unit(0, "worker", 5, 9)
    mine = g.place_resource("mine", 6, 9)
    meat, gold = g.resources[0]["meat"], g.resources[0]["gold"]
    g.issue(0, Command("harvest", a.id, target=sheep.id))
    g.issue(0, Command("harvest", b.id, target=mine.id))
    run(g, 1)
    assert g.resources[0]["meat"] == meat and sheep.butchered  # the first swing only butchers
    assert g.resources[0]["gold"] == gold + 3
    run(g, 6 * 12)  # 12 more swings: 48 meat
    assert g.resources[0]["meat"] == meat + 48 and sheep.id in g.entities
    run(g, 6)
    assert g.resources[0]["meat"] == meat + 50 and sheep.id not in g.entities
    assert mine.amount == cfg.mine_gold - 3 * 14


def test_first_swing_waits_after_walking(cfg):
    g = make_game(cfg)
    u = g.spawn_unit(0, "worker", 3, 5)
    tree = g.place_resource("tree", 6, 5)
    g.issue(0, Command("harvest", u.id, target=tree.id))
    run(g, 12)  # steps start on ticks 1 and 7 and take 6 ticks each
    assert u.cell == (4, 5)
    run(g, 1)
    assert u.cell == (5, 5) and start_wood(g) == 10000  # arrived on tick 13
    run(g, 3)
    assert start_wood(g) == 10000
    run(g, 1)  # the swing lands 0.4 s after arriving
    assert start_wood(g) == 10000 + cfg.wood_per_swing


# ---------------------------------------------------------------- building, training, population


def test_building_a_house(cfg):
    g = make_game(cfg)
    w1 = g.spawn_unit(0, "worker", 5, 5)
    w2 = g.spawn_unit(0, "worker", 8, 5)
    wood = start_wood(g)
    assert not g.issue(0, Command("build", w1.id, x=4, y=5, what="house"))  # covers the worker itself
    assert g.issue(0, Command("build", w1.id, x=6, y=5, what="house"))
    site = g.entity_at(6, 5)
    assert start_wood(g) == wood - 50 and not site.built and w1.order == BUILD
    assert g.population(0)[2] == cfg.pop_base  # no room until it is finished
    assert g.issue(0, Command("help_build", w2.id, target=site.id))
    run(g, 39)
    assert not site.built and site.progress == 78  # two workers: 2 points a tick
    run(g, 1)
    assert site.built and g.population(0)[2] == cfg.pop_base + cfg.pop_per_house
    run(g, 1)
    assert w1.order == IDLE and w2.order == IDLE


def test_training_and_population_limit(cfg):
    g = make_game(cfg, width=30, height=20)
    castle = g.place_building(0, "castle", 2, 2)
    assert g.population(0) == (0, 0, cfg.pop_base + cfg.pop_castle)
    meat = g.resources[0]["meat"]
    assert g.issue(0, Command("train", castle.id, what="worker"))
    assert g.resources[0]["meat"] == meat - 30 and g.population(0) == (0, 1, 15)
    assert not g.issue(0, Command("train", castle.id, what="warrior"))  # castles train workers only
    run(g, 49)
    assert not g.units(0)
    run(g, 1)
    assert len(g.units(0)) == 1 and g.population(0) == (1, 0, 15)

    for i in range(13):
        g.spawn_unit(0, "worker", 10 + i, 15)
    assert g.issue(0, Command("train", castle.id, what="worker"))  # 14 + 1 = 15: fits
    assert not g.issue(0, Command("train", castle.id, what="worker"))  # 16 would not
    assert g.issue(0, Command("cancel", castle.id))
    assert g.resources[0]["meat"] == meat - 30 and g.population(0) == (14, 0, 15)


def test_housed_when_a_house_is_lost(cfg):
    g = make_game(cfg, width=30, height=20)
    barracks = g.place_building(0, "barracks", 2, 2)
    house = g.place_building(0, "house", 8, 2)
    workers = [g.spawn_unit(0, "worker", 2 + i, 12) for i in range(12)]
    assert g.population(0) == (12, 0, 15)
    assert g.issue(0, Command("train", barracks.id, what="warrior"))
    g._remove(house)  # room drops to 10 while 12 units are alive
    run(g, cfg.units["warrior"].train_ticks + 5)
    assert barracks.housed and barracks.queue == ["warrior"] and len(g.units(0)) == 12
    for u in workers[:3]:
        g._remove(u)
    run(g, 1)
    assert not barracks.housed and not barracks.queue
    assert sorted(u.kind for u in g.units(0)).count("warrior") == 1


# ---------------------------------------------------------------- combat


def test_equal_warriors_kill_each_other_on_the_same_tick(cfg):
    g = make_game(cfg)
    a = g.spawn_unit(0, "warrior", 5, 5)
    b = g.spawn_unit(1, "warrior", 6, 5)
    run(g, 54)  # hits on ticks 1, 7, ..., 49: nine each
    assert a.hp == b.hp == 120 - 9 * 12
    run(g, 1)
    assert a.id not in g.entities and b.id not in g.entities


def test_reach(cfg):
    g = make_game(cfg)
    warrior = g.spawn_unit(0, "warrior", 5, 5)
    lancer = g.spawn_unit(0, "lancer", 5, 9)
    w_target = g.spawn_unit(1, "worker", 6, 6)  # diagonal from the warrior
    l_target = g.spawn_unit(1, "worker", 6, 10)  # diagonal from the lancer
    run(g, 1)
    assert w_target.hp == 30  # a warrior can't hit diagonally; it steps closer first
    assert l_target.hp == 30 - 28  # a lancer can

    g = make_game(cfg)
    archer = g.spawn_unit(0, "archer", 2, 13)
    near = g.spawn_unit(1, "worker", 7, 13)  # 5 cells: in range
    far = g.spawn_unit(1, "worker", 2, 7)  # 6 cells: out of range and out of sight
    run(g, 1)
    assert near.hp == 30 - 13 and far.hp == 30 and archer.cell == (2, 13)


def test_idle_units_engage_only_within_sight(cfg):
    g = make_game(cfg)
    hunter = g.spawn_unit(0, "warrior", 5, 5)
    prey = g.spawn_unit(1, "worker", 9, 5)  # 4 cells: within sight (4.2)
    other = g.spawn_unit(0, "warrior", 5, 12)
    stranger = g.spawn_unit(1, "worker", 10, 12)  # 5 cells: too far
    run(g, 60)
    assert prey.id not in g.entities
    assert other.cell == (5, 12) and stranger.hp == 30


def test_move_ignores_enemies_but_attack_move_fights(cfg):
    g = make_game(cfg, width=30)
    mover = g.spawn_unit(0, "warrior", 2, 4)
    bystander = g.spawn_unit(1, "worker", 10, 5)
    assert g.issue(0, Command("move", mover.id, x=20, y=4))
    run(g, 120)
    assert mover.cell == (20, 4) and bystander.hp == 30

    fighter = g.spawn_unit(0, "warrior", 2, 10)
    victim = g.spawn_unit(1, "worker", 10, 11)
    assert g.issue(0, Command("attack_move", fighter.id, x=20, y=10))
    run(g, 60)
    assert victim.id not in g.entities and fighter.order == ATTACK_MOVE
    run(g, 120)
    assert fighter.cell == (20, 10) and fighter.order == IDLE


def test_attack_order_chases_anywhere(cfg):
    g = make_game(cfg, width=30)
    a = g.spawn_unit(0, "lancer", 2, 5)
    b = g.spawn_unit(1, "worker", 25, 12)
    assert not g.issue(0, Command("attack", a.id, target=a.id))
    assert g.issue(0, Command("attack", a.id, target=b.id))
    run(g, 250)
    assert b.id not in g.entities and a.order == IDLE


def test_guard_follows_engages_and_is_leashed(cfg):
    g = make_game(cfg, width=40, height=24)
    ward = g.spawn_unit(0, "worker", 5, 10)
    guard = g.spawn_unit(0, "warrior", 5, 13)
    assert not g.issue(0, Command("guard", guard.id, target=guard.id))
    assert g.issue(0, Command("guard", guard.id, target=ward.id))
    assert g.issue(0, Command("move", ward.id, x=25, y=10))
    run(g, 160)
    assert ward.cell == (25, 10)
    assert max(abs(guard.x - ward.x), abs(guard.y - ward.y)) <= 2 and guard.order == GUARD

    far = g.spawn_unit(1, "worker", 25, 22)  # 12 cells away: not a threat to the ward
    near = g.spawn_unit(1, "worker", 28, 12)  # within the guard radius
    run(g, 80)
    assert near.id not in g.entities and far.hp == 30
    assert max(abs(guard.x - ward.x), abs(guard.y - ward.y)) <= 2  # back at its post

    g._remove(ward)
    run(g, 1)
    assert guard.order == IDLE


def test_tower(cfg):
    g = make_game(cfg)
    tower = g.place_building(0, "tower", 5, 5)
    near = g.spawn_unit(1, "worker", 12, 5)  # 6 cells from the nearest footprint cell
    far = g.spawn_unit(1, "worker", 14, 6)  # 8 cells
    run(g, 1)
    assert near.hp == 30 - cfg.tower_damage and far.hp == 30
    run(g, cfg.tower_ticks)
    assert near.id not in g.entities
    site = g.place_building(0, "tower", 5, 10, built=False)
    target = g.spawn_unit(1, "worker", 9, 10)
    run(g, 30)
    assert target.hp <= 30 - cfg.tower_damage  # only the finished tower fires


def test_castle_falls_and_queue_is_refunded(cfg):
    g = make_game(cfg, width=30, height=20)
    g.castle_rule = True
    mine = g.place_building(0, "castle", 2, 2)
    theirs = g.place_building(1, "castle", 20, 2)
    meat = g.resources[1]["meat"]
    assert g.issue(1, Command("train", theirs.id, what="worker"))
    theirs.hp = 10
    g.spawn_unit(0, "warrior", 19, 3)
    run(g, 1)
    assert g.done and g.winner == 0
    assert g.resources[1]["meat"] == meat  # the paid-for worker was refunded
    assert mine.id in g.entities


def test_detours_around_a_blocking_unit(cfg):
    g = make_game(cfg)
    walker = g.spawn_unit(0, "warrior", 2, 5)
    g.spawn_unit(0, "worker", 5, 5)  # standing on the straight line
    assert g.issue(0, Command("move", walker.id, x=8, y=5))
    run(g, 80)
    assert walker.cell == (8, 5)


def test_a_sealed_off_destination_ends_the_move(cfg):
    water = [(6, y) for y in range(16)]
    g = make_game(cfg, water=water)
    u = g.spawn_unit(0, "warrior", 2, 5)
    assert g.issue(0, Command("move", u.id, x=10, y=5))
    run(g, 60)
    assert u.cell == (5, 5) and u.order == IDLE  # as close as it can get


def test_commands_for_the_other_player_are_rejected(cfg):
    g = make_game(cfg)
    u = g.spawn_unit(0, "warrior", 5, 5)
    assert not g.issue(1, Command("move", u.id, x=1, y=1))
    assert g.stats[1]["invalid_commands"] == 1


def test_same_seed_same_game(cfg):
    m = mirror_west_half(load_map(DEFAULT_MAP))

    def play(seed):
        g = Game.duel(m, cfg, seed=seed)
        rng = np.random.default_rng(0)
        for t in range(300):
            if t % 10 == 0:
                for p in (0, 1):
                    for u in g.units(p):
                        g.issue(p, Command("attack_move", u.id, x=int(rng.integers(64)), y=int(rng.integers(64))))
            g.tick()
        return sorted((e.id, getattr(e, "x", 0), getattr(e, "y", 0), round(getattr(e, "hp", 0), 3)) for e in g.entities.values())

    assert play(1) == play(1)
    assert play(1) != play(2)
