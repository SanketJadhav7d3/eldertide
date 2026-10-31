"""Every number the simulator uses, taken from the browser game.

Unit stats, economy and population come straight from the game's balance.js (parsed at import time),
so tuning the game also tunes the simulator. Building costs, health and build times live in the
game's structureEntity.js instead of balance.js; they are copied here, and tests/test_config.py checks
the copies against that file so they can't drift apart.

Space and time are discretised:
  * one cell = one 64 px map tile (the map is 64 x 64 cells),
  * one tick = 100 ms of game time.
Durations given in ms are rounded to whole ticks; ranges given in px become distances in cells.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BALANCE_JS = REPO_ROOT / "balance.js"
DEFAULT_MAP = REPO_ROOT / "maps" / "island_64.tmj"

CELL_PX = 64
TICK_MS = 100

# Units walk at 99.5 px/s in the game (100 px/s tweens, measured over 14 walks in the browser, see
# rl/fidelity): a 64 px cell takes 643 ms straight and 910 ms diagonally.
WALK_PX_PER_S = 99.5

# Measured in the browser game (rl/fidelity):
# - Melee attack boxes are squares, so a warrior or lancer hits an enemy on any of the 8 neighbouring
#   cells (diagonals too) and none two cells away: a reach of 1.5 cells covers exactly those.
# - Units notice enemies whose centre is within half their sight box of their own centre.
# - An archer shoots at whatever it has noticed, within half its 680 px box (340 px).
# - An archer's shots come 1.6 s apart: cooldownMs plus a 0.3 s draw.
MELEE_REACH = 1.5
ARCHER_DRAW_MS = 300
# - A unit that starts attacking lands its first hit after a wind-up (its attack animation reaching
#   the hit frame): warrior 0.3 s, lancer 0.1 s, archer 0.3 s (the draw).
# - Arrows (archers and towers) fly at 350 px/s (projectile.js) to where the target is expected to be
#   and hurt it only if it is within 30 px of that spot when they land. Every walking unit is led
#   (aimed ahead of along its current step), whatever its order. Measured: a unit walking a long line
#   is hit about 4 times in 5, one turning back every 128 px about half the time, still ones always.
WINDUP_MS = {"warrior": 300, "lancer": 100, "archer": ARCHER_DRAW_MS}
ARROW_PX_PER_S = 350
ARROW_HIT_PX = 30
# The game leads a stepping unit only while more than 50 ms of its current 32 px step remain.
ARROW_NO_LEAD_MS = 50

UNIT_KINDS = ("worker", "warrior", "lancer", "archer")
COMBAT_KINDS = ("warrior", "lancer", "archer")
BUILDING_KINDS = ("castle", "house", "tower", "barracks", "archery")
# Buildings a worker may place. The castle is the base: each side starts with one and loses when it
# falls, so it is not buildable (the game's Monastery has no function yet and is left out).
PLACEABLE_KINDS = ("house", "tower", "barracks", "archery")
RESOURCE_KINDS = ("tree", "mine", "sheep")


def ms_to_ticks(ms: float) -> int:
    return max(1, round(ms / TICK_MS))


def load_balance(path: Path = BALANCE_JS) -> dict:
    """Parses the `BALANCE` object literal in the game's balance.js into a dict."""
    text = Path(path).read_text(encoding="utf-8")
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//[^\n]*", "", text)
    start = text.index("{", text.index("BALANCE"))
    depth = 0
    for end in range(start, len(text)):
        depth += {"{": 1, "}": -1}.get(text[end], 0)
        if depth == 0:
            break
    literal = text[start:end + 1]
    literal = re.sub(r"([{,]\s*)([A-Za-z_$][\w$]*)\s*:", r'\1"\2":', literal)  # quote keys
    literal = re.sub(r",(\s*[}\]])", r"\1", literal)  # trailing commas
    return json.loads(literal)


@dataclass(frozen=True)
class UnitSpec:
    kind: str
    hp: int
    cost: dict
    train_ticks: int
    damage: int = 0
    attack_ticks: int = 0  # ticks between hits
    attack_range: float = 0.0  # cells, centre to centre (to the nearest footprint cell for buildings)
    sight: float = 0.0  # cells; enemies this close are engaged automatically
    windup_ticks: int = 0  # ticks from starting to attack to the first hit
    arrow: bool = False  # damage lands when an arrow arrives (see GameConfig.arrow_cells_per_tick)

    @property
    def can_fight(self) -> bool:
        return self.damage > 0


@dataclass(frozen=True)
class BuildingSpec:
    kind: str
    hp: int
    cost: dict
    size: tuple  # (width, height) in cells
    build_points: int  # construction work needed; each worker adds 1 point per tick
    trains: tuple = ()


def _half_box_cells(box_px: float) -> float:
    return box_px / 2 / CELL_PX




@dataclass(frozen=True)
class GameConfig:
    units: dict
    buildings: dict
    start_resources: dict
    # Economy (from balance.js and the worker/resource classes).
    swing_ticks: int
    wood_per_swing: int
    gold_per_swing: int
    meat_per_swing: int
    tree_hp: int = 100  # Tree: 100 health, a swing deals 10 -> 10 swings per tree
    tree_damage_per_swing: int = 10
    mine_gold: int = 1000  # GoldMine: health 1000 = gold available
    sheep_meat: int = 50  # Sheep: health 50 = meat available; the first swing only butchers it
    sheep_per_side: int = 6
    # Each player's starting units (see START_LAYOUTS in game.py): "game" is the browser game's own
    # army (2 workers, a warrior, 2 lancers, 2 archers); "workers" is 4 workers and no soldiers, so
    # every army has to be built.
    start: str = "game"
    sheep_respawn_ticks: int = 300
    tree_density: float = 0.10  # VillageScene spawns a tree on 10% of grass tiles
    # Population (balance.js).
    pop_base: int = 10
    pop_castle: int = 5
    pop_per_house: int = 5
    pop_max: int = 60
    max_queue: int = 5  # training queue length per building (the game has none; keeps masks finite)
    # Movement: ms per step into a neighbouring cell. Steps take whole ticks; the leftover milliseconds
    # carry over to the next step, so the average speed is exactly the game's.
    move_ms_straight: float = CELL_PX / WALK_PX_PER_S * 1000
    move_ms_diagonal: float = CELL_PX * 2 ** 0.5 / WALK_PX_PER_S * 1000
    # Combat behaviour (combatUnit.js).
    scan_ticks: int = 10  # idle units look for enemies once a second
    leash_scale: float = 1.5  # chase an auto-acquired enemy while it is within sight * 1.5
    retarget_threshold: float = 0.7  # swap targets only for one scoring this much better
    building_target_weight: float = 3.0  # automatic targeting prefers units over buildings
    unreachable_ignore_ticks: int = 40
    give_up_blocked_ticks: int = 30  # a move blocked this long ends
    # Guard order (combatUnit.js; px converted to cells).
    guard_radius: float = 5.0
    guard_leash: float = 7.0
    guard_scan_ticks: int = 3
    guard_catch_up_cells: float = 72 / CELL_PX
    guard_catch_up_speed: float = 1.35
    attacking_ward_weight: float = 0.3
    # Tower (balance.js: range 450 px, measured from the tower's centre).
    tower_range: float = 450 / CELL_PX
    tower_damage: int = 20
    tower_ticks: int = 12
    arrow_cells_per_tick: float = ARROW_PX_PER_S / CELL_PX * TICK_MS / 1000
    arrow_hit_cells: float = ARROW_HIT_PX / CELL_PX
    arrow_no_lead_ms: float = ARROW_NO_LEAD_MS
    # Episode.
    max_ticks: int = 9000  # 15 minutes of game time

    @staticmethod
    def from_balance(balance: dict | None = None) -> "GameConfig":
        b = balance if balance is not None else load_balance()
        u, econ, pop = b["units"], b["economy"], b.get("population", {})
        units = {
            "worker": UnitSpec("worker", u["worker"]["health"], u["worker"]["cost"],
                               ms_to_ticks(u["worker"]["trainMs"])),
            "warrior": UnitSpec("warrior", u["warrior"]["health"], u["warrior"]["cost"],
                                ms_to_ticks(u["warrior"]["trainMs"]), u["warrior"]["damage"],
                                ms_to_ticks(u["warrior"]["attackIntervalMs"]),
                                MELEE_REACH, _half_box_cells(500),  # warriorEntity: sight box 500
                                ms_to_ticks(WINDUP_MS["warrior"])),
            "lancer": UnitSpec("lancer", u["lancer"]["health"], u["lancer"]["cost"],
                               ms_to_ticks(u["lancer"]["trainMs"]), u["lancer"]["damage"],
                               ms_to_ticks(u["lancer"]["attackIntervalMs"]),
                               MELEE_REACH, _half_box_cells(500),  # lancerEntity: sight box 500
                               ms_to_ticks(WINDUP_MS["lancer"])),
            # Archer: shoots at what it notices, so its reach is its sight.
            "archer": UnitSpec("archer", u["archer"]["health"], u["archer"]["cost"],
                               ms_to_ticks(u["archer"]["trainMs"]), u["archer"]["damage"],
                               ms_to_ticks(u["archer"]["cooldownMs"] + ARCHER_DRAW_MS),
                               _half_box_cells(u["archer"]["sightBoxPx"]), _half_box_cells(u["archer"]["sightBoxPx"]),
                               ms_to_ticks(WINDUP_MS["archer"]), arrow=True),
        }
        bh = b["buildings"]
        # structureEntity.js: COST, health and maxBuildProgress of each class (checked by tests).
        # Footprints are the buildings' ground bodies rounded to whole 64 px cells.
        buildings = {
            "castle": BuildingSpec("castle", bh["castleHealth"], {"wood": 300, "gold": 150}, (4, 3), 200, ("worker",)),
            "house": BuildingSpec("house", 500, {"wood": 50}, (2, 2), 80),
            "tower": BuildingSpec("tower", 800, {"wood": 300, "gold": 100}, (2, 2), 100),
            "barracks": BuildingSpec("barracks", 1000, {"wood": 300, "gold": 150}, (3, 3), 120, ("warrior", "lancer")),
            "archery": BuildingSpec("archery", 1000, {"wood": 300, "gold": 100}, (3, 3), 120, ("archer",)),
        }
        tower = bh.get("tower", {})
        return GameConfig(
            units=units,
            buildings=buildings,
            start_resources=dict(b["start"]),
            swing_ticks=ms_to_ticks(600),  # worker swing cycle 0.6 s (balance.js notes)
            wood_per_swing=econ["woodPerSwing"],
            gold_per_swing=econ["goldPerSwing"],
            meat_per_swing=econ["meatPerSwing"],
            sheep_per_side=econ["sheepMax"] // 2,
            sheep_respawn_ticks=ms_to_ticks(econ["sheepRespawnMs"]),
            pop_base=pop.get("base", 10),
            pop_castle=pop.get("castle", 5),
            pop_per_house=pop.get("perHouse", 5),
            pop_max=pop.get("max", 60),
            tower_range=tower.get("range", 450) / CELL_PX,
            tower_damage=tower.get("damage", 20),
            tower_ticks=ms_to_ticks(tower.get("cooldownMs", 1200)),
        )

    @property
    def path_costs(self) -> tuple:
        """Integer (straight, diagonal) step costs for pathfinding, in ms."""
        return round(self.move_ms_straight), round(self.move_ms_diagonal)

    def unit_value(self, kind: str) -> int:
        """Resources spent on a unit (wood + meat + gold)."""
        return sum(self.units[kind].cost.values())

    def building_value(self, kind: str) -> int:
        return sum(self.buildings[kind].cost.values())


@dataclass(frozen=True)
class RewardConfig:
    """Weights of the zero-sum, potential-based reward (see reward.py)."""
    win: float = 10.0
    shaping: float = 1.0  # set to 0 for the pure win/loss signal
    castle: float = 2.0  # extra potential for the castle's health (the win condition)
    banked: float = 0.5  # value of unspent resources relative to spent ones
    gamma: float = 0.99  # must match the learner's discount for the shaping guarantee to hold


@dataclass
class EnvConfig:
    map_path: Path = DEFAULT_MAP
    decision_ticks: int = 5  # the agents act every 5 ticks (0.5 s)
    mirror_map: bool = True  # copy the west half onto the east half so both sides are identical
    crop_to_land: bool = True  # cut away the open sea (64 x 64 island -> 48 x 48); see mapdata.crop_to_land
    # "dense": masks as whole-grid arrays (gridnet.GridNetInterface.masks); "actors": only the rows for
    # cells with one of the player's units or buildings (actor_masks), much smaller and faster.
    mask_format: str = "dense"
    ego_view: bool = True  # player 1 sees the map flipped so its base is on the west, like player 0
    game: GameConfig = field(default_factory=GameConfig.from_balance)
    reward: RewardConfig = field(default_factory=RewardConfig)
