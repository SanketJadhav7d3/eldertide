"""The simulator's numbers must match the browser game's source."""

import re

from eldertide_rl.config import REPO_ROOT, load_balance

STRUCTURES_JS = (REPO_ROOT / "entities" / "structureEntity.js").read_text(encoding="utf-8")
CLASS_OF = {"castle": "Castle", "house": "House", "tower": "Tower", "barracks": "Barracks", "archery": "Archery"}


def class_body(name):
    match = re.search(rf"export class {name} extends.*?(?=\nexport class |\Z)", STRUCTURES_JS, flags=re.S)
    assert match, name
    return match.group(0)


def test_balance_is_parsed():
    b = load_balance()
    assert b["units"]["warrior"]["damage"] == 12
    assert b["start"] == {"wood": 150, "meat": 100, "gold": 50}
    assert len(b["waves"]["list"]) == 5
    assert b["population"]["perHouse"] == 5


def test_buildings_match_structure_entity_js(cfg):
    balance = load_balance()
    for kind, cls in CLASS_OF.items():
        body = class_body(cls)
        spec = cfg.buildings[kind]
        cost = dict((k, int(v)) for k, v in re.findall(r"(\w+):\s*(\d+)", re.search(r"static COST = \{(.*?)\}", body, re.S).group(1)))
        assert spec.cost == cost, kind
        health = re.search(r"this\.health = ([\w.]+);", body).group(1)
        expected_hp = balance["buildings"]["castleHealth"] if health == "BALANCE.buildings.castleHealth" else int(health)
        assert spec.hp == expected_hp, kind
        assert spec.build_points == int(re.search(r"this\.maxBuildProgress = (\d+);", body).group(1)), kind
        trained = tuple(dict.fromkeys(re.findall(r"BALANCE\.units\.(\w+)\.cost", body)))
        assert spec.trains == trained, kind


def test_resources_match_the_game(cfg):
    assert "this.health = 100; // Health for chopping." in class_body("Tree")
    assert "this.health = 1000; // Represents total gold available." in class_body("GoldMine")
    worker_js = (REPO_ROOT / "entities" / "workerEntity.js").read_text(encoding="utf-8")
    assert "this.targetObject.sustainDamage(10)" in worker_js
    sheep_js = (REPO_ROOT / "entities" / "sheepEntity.js").read_text(encoding="utf-8")
    assert "this.health = 50;" in sheep_js
    assert (cfg.tree_hp, cfg.tree_damage_per_swing, cfg.mine_gold, cfg.sheep_meat) == (100, 10, 1000, 50)


def test_derived_timings(cfg):
    # 100 px/s over 64 px cells; 100 ms ticks.
    assert (cfg.move_ticks_straight, cfg.move_ticks_diagonal) == (6, 9)
    assert cfg.swing_ticks == 6
    w, s, l, a = (cfg.units[k] for k in ("worker", "warrior", "lancer", "archer"))
    assert (w.train_ticks, s.train_ticks, l.train_ticks, a.train_ticks) == (50, 50, 80, 60)
    assert (s.attack_ticks, l.attack_ticks, a.attack_ticks) == (6, 12, 17)
    # Reach = half the attack box + half a body, in cells.
    assert s.attack_range == (60 + 20) / 64 and 1 < s.attack_range < 2 ** 0.5  # no diagonal hits
    assert 2 ** 0.5 < l.attack_range < 2  # the lancer reaches diagonally
    assert a.attack_range == (340 + 20) / 64
    assert not w.can_fight
    assert cfg.sheep_per_side * 2 == load_balance()["economy"]["sheepMax"]
    assert cfg.sheep_respawn_ticks == 300
