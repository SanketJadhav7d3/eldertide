"""The simulator: a two-player duel following the browser game's rules on a grid of 64 px cells.

State lives in plain objects (Unit, Building, Resource) keyed by id, plus an occupancy grid. The
game advances in ticks of 100 ms; players change what their units do by issuing Commands between
ticks. Units carry their orders out over many ticks (walking, swinging, training), like the game's
right-click orders.

Fairness: within a tick, units act in a random order (seeded), and all damage is applied at the end
of the tick, so neither side gains from being processed first.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from .config import COMBAT_KINDS, PLACEABLE_KINDS, TICK_MS, GameConfig
from .mapdata import MapData, mirror_x
from .pathfinding import path_to_rect, rect_goal

# Unit orders.
IDLE, MOVE, ATTACK, ATTACK_MOVE, GUARD, HARVEST, BUILD = (
    "idle", "move", "attack", "attack_move", "guard", "harvest", "build")
ORDERS = (IDLE, MOVE, ATTACK, ATTACK_MOVE, GUARD, HARVEST, BUILD)

# Where guards stand around their ward (same slots as combatUnit.js).
GUARD_SLOTS = ((0, 1), (1, 0), (-1, 0), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1))
# Ticks after reaching a resource before the first hit lands (impact frame 4 of the swing).
FIRST_SWING_DELAY = 4


@dataclass(eq=False)
class Unit:
    id: int
    owner: int
    kind: str
    x: int
    y: int
    hp: float
    max_hp: int
    order: str = IDLE
    dest: tuple | None = None  # move / attack-move destination
    target: int | None = None  # attack target, ward, resource or construction site
    engaged: int | None = None  # enemy being fought without an explicit attack order
    harvest_kind: str | None = None
    guard_slot: int = 0
    cooldown: int = 0  # ticks until the next hit or swing
    step_to: tuple | None = None  # cell being walked into
    step_left: int = 0
    path: list = field(default_factory=list)
    path_key: object = None
    blocked: int = 0
    next_scan: int = 0
    ignore_until: dict = field(default_factory=dict)
    rank: int = 0  # n-th unit its owner has had; mirror-image units of the two players share a rank
    attacking: bool = False  # attacked (or was winding up) last time it acted
    step_carry: float = 0.0  # ms of walking left over from the last step (see _step_towards)
    step_total: int = 0  # ticks the current step takes (for the unit's position part-way through it)
    step_ms: float = 0.0  # how long the current step takes, before rounding to ticks

    @property
    def cell(self) -> tuple:
        return (self.x, self.y)

    @property
    def is_building(self) -> bool:
        return False

    @property
    def occupied(self) -> tuple:
        """The cell the unit holds: the one it is walking into, or the one it stands on. Every unit's
        is different, so it is where an agent sees the unit and gives it orders."""
        return self.step_to if self.step_to is not None else (self.x, self.y)

    @property
    def fighting(self) -> int | None:
        """The enemy this unit is currently going for, if any."""
        return self.target if self.order == ATTACK else self.engaged


@dataclass(eq=False)
class Building:
    id: int
    owner: int
    kind: str
    x: int  # top-left cell of the footprint
    y: int
    w: int
    h: int
    hp: float
    max_hp: int
    built: bool
    build_points: int
    progress: float = 0.0
    queue: list = field(default_factory=list)
    train_progress: int = 0
    housed: bool = False
    cooldown: int = 0

    @property
    def is_building(self) -> bool:
        return True

    @property
    def center(self) -> tuple:
        return (self.x + (self.w - 1) / 2, self.y + (self.h - 1) / 2)

    @property
    def extent(self) -> float:
        return max(self.w, self.h) / 2

    def cells(self):
        for yy in range(self.y, self.y + self.h):
            for xx in range(self.x, self.x + self.w):
                yield xx, yy

    def nearest_cell(self, x: float, y: float) -> tuple:
        return (min(max(x, self.x), self.x + self.w - 1), min(max(y, self.y), self.y + self.h - 1))


@dataclass(eq=False)
class Resource:
    id: int
    kind: str  # tree, mine, sheep
    x: int
    y: int
    amount: int
    max_amount: int
    side: int = 0  # half of the map it belongs to (sheep respawn per side)
    butchered: bool = False

    @property
    def is_building(self) -> bool:
        return False

    @property
    def cell(self) -> tuple:
        return (self.x, self.y)


@dataclass(frozen=True)
class Command:
    """One order. `actor` is a unit id (or a building id for train/cancel)."""
    kind: str  # stop, move, attack, attack_move, guard, harvest, build, help_build, train, cancel
    actor: int
    x: int = -1  # destination, or the top-left cell of a building to place
    y: int = -1
    target: int = -1  # entity id
    what: str = ""  # building kind (build) or unit kind (train)


COMMAND_KINDS = ("stop", "move", "attack", "attack_move", "guard", "harvest", "build", "help_build",
                 "train", "cancel")


def distance(ax: float, ay: float, bx: float, by: float) -> float:
    return math.hypot(ax - bx, ay - by)


class Game:
    def __init__(self, mapdata: MapData, config: GameConfig, seed: int = 0):
        self.map = mapdata
        self.cfg = config
        self.rng = np.random.default_rng(seed)
        self.width, self.height = mapdata.width, mapdata.height
        self.entities: dict = {}  # every entity by id
        # Indexes kept in step with `entities` (all in id order, like `entities`), so lookups don't
        # scan everything: units / buildings / resource nodes by id, and per-player counts.
        self._units: dict = {}
        self._buildings: dict = {}
        self._resources: dict = {}
        self._unit_count = [0, 0]
        self._sheep_count = [0, 0]
        self.occ = np.full((self.height, self.width), -1, dtype=np.int32)
        self.solid = np.zeros((self.height, self.width), dtype=bool)  # buildings and resources
        self.tick_count = 0
        self.resources = [dict(config.start_resources), dict(config.start_resources)]
        self.winner: int | None = None  # 0, 1, or -1 for a draw
        self.done = False
        self.start_cells: list = []
        self.sheep_timer = [0, 0]
        self.stats = [self._empty_stats(), self._empty_stats()]
        self.castle_rule = True  # a player whose castle falls loses (off for small test scenarios)
        self._next_id = 0
        self._units_made = [0, 0]
        self._damage: list = []
        self._arrows: list = []  # (lands, target id, damage, owner, aim, shooter id, from, loosed)
        # Hits and arrows, for replays (see replay.py); only kept while record_events is on.
        self.record_events = False
        self.events: list = []

    @staticmethod
    def _empty_stats() -> dict:
        return {"wood": 0, "gold": 0, "meat": 0, "units_trained": 0, "units_lost": 0, "buildings_built": 0,
                "buildings_lost": 0, "damage_dealt": 0.0, "arrows_missed": 0, "invalid_commands": 0}

    # ---------------------------------------------------------------- setup

    @classmethod
    def duel(cls, mapdata: MapData, config: GameConfig, seed: int = 0) -> "Game":
        """Both players start with a castle and the game's starting units, mirrored left-right."""
        if mapdata.player_start is None:
            raise ValueError("The map has no player start point (player-start-layer)")
        game = cls(mapdata, config, seed)
        w = game.width
        s0 = mapdata.player_start
        s1 = (mirror_x(s0[0], w), s0[1])
        game.start_cells = [s0, s1]

        for mx, my in mapdata.gold_mines:
            if game.occ[my, mx] == -1:
                game._add_resource("mine", mx, my, config.mine_gold, side=0 if mx < w / 2 else 1)

        # Castle north of the start point; player 1 gets the mirrored footprint.
        cw, ch = config.buildings["castle"].size
        anchor0 = game.nearest_valid_anchor("castle", s0[0] - cw // 2, s0[1] - ch - 1)
        if anchor0 is None:
            raise ValueError("No room for a castle near the player start")
        anchor1 = (w - anchor0[0] - cw, anchor0[1])
        if not game.placement_valid("castle", *anchor1):
            anchor1 = game.nearest_valid_anchor("castle", *anchor1, owner=1)
        game._add_building(0, "castle", *anchor0, built=True)
        game._add_building(1, "castle", *anchor1, built=True)

        # The game's starting units (playerArmy.spawnStartingUnits), around the start point.
        layout = [("worker", -1, 0), ("worker", 1, 0), ("warrior", 0, 2), ("lancer", -2, 2), ("lancer", 2, 2),
                  ("archer", -1, 3), ("archer", 1, 3)]
        for kind, dx, dy in layout:
            c0 = game._free_cell_near(s0[0] + dx, s0[1] + dy)
            mirrored = (mirror_x(c0[0], w), c0[1])
            c1 = mirrored if game._cell_free(*mirrored) else game._free_cell_near(*mirrored, owner=1)
            game._add_unit(0, kind, *c0)
            game._add_unit(1, kind, *c1)

        game._plant_trees()
        # The starting flocks mirror each other.
        for _ in range(config.sheep_per_side):
            game._spawn_sheep_pair()
        return game

    def _plant_trees(self):
        """Trees on a random 10% of the grass, the same on both halves, never sealing a base in."""
        w, h = self.width, self.height
        keep_clear = np.zeros((h, w), dtype=bool)
        for e in list(self.entities.values()):
            if isinstance(e, Building):
                keep_clear[max(0, e.y - 2):e.y + e.h + 2, max(0, e.x - 2):e.x + e.w + 2] = True
            else:
                keep_clear[max(0, e.y - 1):e.y + 2, max(0, e.x - 1):e.x + 2] = True
        for sx, sy in self.start_cells:
            keep_clear[max(0, sy - 3):sy + 4, max(0, sx - 3):sx + 4] = True

        roll = self.rng.random((h, w))
        for y in range(h):
            for x in range(w // 2):
                if roll[y, x] >= self.cfg.tree_density:
                    continue
                for tx in (x, mirror_x(x, w)):
                    if self.map.grass[y, tx] and not keep_clear[y, tx] and self._cell_free(tx, y):
                        self._add_resource("tree", tx, y, self.cfg.tree_hp, side=0 if tx < w / 2 else 1)

        # If trees cut the two bases apart, clear the trees along the shortest way through.
        if self._path_between_starts(ignore_trees=False) is None:
            path = self._path_between_starts(ignore_trees=True) or []
            for x, y in path:
                e = self.entities.get(int(self.occ[y, x]))
                if isinstance(e, Resource) and e.kind == "tree":
                    self._remove(e)

    def _path_between_starts(self, ignore_trees: bool):
        passable = self.map.walkable & ~self.solid
        if ignore_trees:
            for e in self.entities.values():
                if isinstance(e, Resource) and e.kind == "tree":
                    passable[e.y, e.x] = True
        (x0, y0), (x1, y1) = self.start_cells
        straight, diagonal = self.cfg.path_costs
        return path_to_rect(passable, (x0, y0), (x1, y1, x1, y1), 0.0, straight, diagonal)

    def _spawn_sheep(self, side: int):
        w = self.width
        cols = np.arange(w)
        half = (cols < w // 2) if side == 0 else (cols >= w - w // 2)
        area = self.map.player_grass & half[None, :]
        if not area.any():
            area = self.map.grass & half[None, :]
        candidates = np.argwhere(area & (self.occ == -1))
        if len(candidates) == 0:
            return None
        y, x = candidates[self.rng.integers(len(candidates))]
        return self._add_resource("sheep", int(x), int(y), self.cfg.sheep_meat, side=side)

    # ---------------------------------------------------------------- custom scenarios (and tests)

    def spawn_unit(self, owner: int, kind: str, x: int, y: int) -> Unit:
        if not self._cell_free(x, y):
            raise ValueError(f"cell {(x, y)} is not free")
        return self._add_unit(owner, kind, x, y)

    def place_building(self, owner: int, kind: str, x: int, y: int, built: bool = True) -> Building:
        if not self.placement_valid(kind, x, y):
            raise ValueError(f"cannot place a {kind} at {(x, y)}")
        return self._add_building(owner, kind, x, y, built)

    def place_resource(self, kind: str, x: int, y: int, amount: int | None = None) -> Resource:
        if not self._cell_free(x, y):
            raise ValueError(f"cell {(x, y)} is not free")
        default = {"tree": self.cfg.tree_hp, "mine": self.cfg.mine_gold, "sheep": self.cfg.sheep_meat}[kind]
        return self._add_resource(kind, x, y, amount if amount is not None else default,
                                  side=0 if x < self.width / 2 else 1)

    # ---------------------------------------------------------------- entity bookkeeping

    def _new_id(self) -> int:
        self._next_id += 1
        return self._next_id

    def _add_unit(self, owner: int, kind: str, x: int, y: int) -> Unit:
        spec = self.cfg.units[kind]
        u = Unit(self._new_id(), owner, kind, x, y, float(spec.hp), spec.hp, rank=self._units_made[owner])
        self._units_made[owner] += 1
        u.next_scan = self.tick_count
        self.entities[u.id] = u
        self._units[u.id] = u
        self._unit_count[owner] += 1
        self.occ[y, x] = u.id
        return u

    def _add_building(self, owner: int, kind: str, x: int, y: int, built: bool) -> Building:
        spec = self.cfg.buildings[kind]
        w, h = spec.size
        b = Building(self._new_id(), owner, kind, x, y, w, h, float(spec.hp), spec.hp, built, spec.build_points,
                     progress=float(spec.build_points) if built else 0.0)
        self.entities[b.id] = b
        self._buildings[b.id] = b
        self.occ[y:y + h, x:x + w] = b.id
        self.solid[y:y + h, x:x + w] = True
        return b

    def _add_resource(self, kind: str, x: int, y: int, amount: int, side: int) -> Resource:
        r = Resource(self._new_id(), kind, x, y, amount, amount, side)
        self.entities[r.id] = r
        self._resources[r.id] = r
        if kind == "sheep":
            self._sheep_count[side] += 1
        self.occ[y, x] = r.id
        self.solid[y, x] = True
        return r

    def _remove(self, e):
        del self.entities[e.id]
        if isinstance(e, Building):
            del self._buildings[e.id]
            self.occ[e.y:e.y + e.h, e.x:e.x + e.w] = -1
            self.solid[e.y:e.y + e.h, e.x:e.x + e.w] = False
        elif isinstance(e, Resource):
            del self._resources[e.id]
            if e.kind == "sheep":
                self._sheep_count[e.side] -= 1
            self.occ[e.y, e.x] = -1
            self.solid[e.y, e.x] = False
        else:
            del self._units[e.id]
            self._unit_count[e.owner] -= 1
            if self.occ[e.y, e.x] == e.id:
                self.occ[e.y, e.x] = -1
            if e.step_to is not None and self.occ[e.step_to[1], e.step_to[0]] == e.id:
                self.occ[e.step_to[1], e.step_to[0]] = -1

    def get(self, entity_id) -> object:
        return self.entities.get(entity_id) if entity_id is not None else None

    def units(self, owner: int | None = None):
        if owner is None:
            return list(self._units.values())
        return [e for e in self._units.values() if e.owner == owner]

    def buildings(self, owner: int | None = None):
        if owner is None:
            return list(self._buildings.values())
        return [e for e in self._buildings.values() if e.owner == owner]

    def resource_nodes(self, kind: str | None = None):
        if kind is None:
            return list(self._resources.values())
        return [e for e in self._resources.values() if e.kind == kind]

    def castle(self, owner: int) -> Building | None:
        for b in self._buildings.values():
            if b.owner == owner and b.kind == "castle":
                return b
        return None

    def entity_at(self, x: int, y: int):
        if not (0 <= x < self.width and 0 <= y < self.height):
            return None
        return self.entities.get(int(self.occ[y, x]))

    # ---------------------------------------------------------------- queries

    def ego_x(self, owner: int, x: float) -> float:
        """x as `owner` sees it: player 1's view is mirrored, so ties are broken the same way on both
        sides (west-first for player 0 is east-first for player 1)."""
        return x if owner == 0 else self.width - 1 - x

    def _ring(self, r: int, owner: int):
        """Offsets at Chebyshev distance r, in a fixed order that is mirrored for player 1."""
        sign = 1 if owner == 0 else -1
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if max(abs(dx), abs(dy)) == r:
                    yield dx * sign, dy

    def _cell_free(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height and self.map.walkable[y, x] and self.occ[y, x] == -1

    def _free_cell_near(self, x: int, y: int, max_radius: int = 10, owner: int = 0) -> tuple:
        for r in range(max_radius + 1):
            for dx, dy in self._ring(r, owner):
                if self._cell_free(x + dx, y + dy):
                    return (x + dx, y + dy)
        raise ValueError(f"No free cell near {(x, y)}")

    def nearest_valid_anchor(self, kind: str, x: int, y: int, max_radius: int = 8, owner: int = 0):
        """The valid top-left cell for a `kind` building nearest (x, y). For player 1 the search runs
        mirrored, so mirrored requests from the two players get mirrored answers."""
        for r in range(max_radius + 1):
            for dx, dy in self._ring(r, owner):
                if self.placement_valid(kind, x + dx, y + dy):
                    return (x + dx, y + dy)
        return None

    def placement_valid(self, kind: str, x: int, y: int) -> bool:
        w, h = self.cfg.buildings[kind].size
        if x < 0 or y < 0 or x + w > self.width or y + h > self.height:
            return False
        return bool(self.map.buildable[y:y + h, x:x + w].all() and (self.occ[y:y + h, x:x + w] == -1).all())

    def population(self, owner: int) -> tuple:
        """(units, queued, capacity) for a player."""
        units = self._unit_count[owner]
        queued = 0
        houses = 0
        castle_room = 0
        for b in self._buildings.values():
            if b.owner != owner:
                continue
            queued += len(b.queue)
            if b.built and b.kind == "house":
                houses += 1
            if b.built and b.kind == "castle":
                castle_room = self.cfg.pop_castle
        capacity = min(self.cfg.pop_max, self.cfg.pop_base + castle_room + houses * self.cfg.pop_per_house)
        return units, queued, capacity

    def can_afford(self, owner: int, cost: dict) -> bool:
        return all(self.resources[owner].get(k, 0) >= v for k, v in cost.items())

    def _spend(self, owner: int, cost: dict):
        for k, v in cost.items():
            self.resources[owner][k] -= v

    def _refund(self, owner: int, cost: dict):
        for k, v in cost.items():
            self.resources[owner][k] += v

    def dist_to(self, x: float, y: float, e) -> float:
        """Distance from a cell to an entity (to the nearest footprint cell of a building)."""
        if isinstance(e, Building):
            nx, ny = e.nearest_cell(x, y)
            return distance(x, y, nx, ny)
        return distance(x, y, e.x, e.y)

    def _center_of(self, e) -> tuple:
        return e.center if isinstance(e, Building) else (e.x, e.y)

    def _extent_of(self, e) -> float:
        return e.extent if isinstance(e, Building) else 0.0

    # ---------------------------------------------------------------- legality (shared with action masks)

    def can_attack(self, u: Unit, e) -> bool:
        return (u.kind in COMBAT_KINDS and isinstance(e, (Unit, Building)) and e.owner != u.owner
                and e.id in self.entities)

    def can_guard(self, u: Unit, e) -> bool:
        return (u.kind in COMBAT_KINDS and isinstance(e, (Unit, Building)) and e.owner == u.owner
                and e is not u and e.id in self.entities)

    def can_harvest(self, u: Unit, e) -> bool:
        return u.kind == "worker" and isinstance(e, Resource) and e.id in self.entities

    def can_help_build(self, u: Unit, e) -> bool:
        return u.kind == "worker" and isinstance(e, Building) and e.owner == u.owner and not e.built

    def can_place(self, u: Unit, kind: str, x: int, y: int) -> bool:
        return (u.kind == "worker" and kind in PLACEABLE_KINDS
                and self.can_afford(u.owner, self.cfg.buildings[kind].cost) and self.placement_valid(kind, x, y))

    def can_train(self, b: Building, kind: str) -> bool:
        if not (b.built and kind in self.cfg.buildings[b.kind].trains and len(b.queue) < self.cfg.max_queue):
            return False
        units, queued, capacity = self.population(b.owner)
        return units + queued + 1 <= capacity and self.can_afford(b.owner, self.cfg.units[kind].cost)

    def can_cancel(self, b: Building) -> bool:
        return b.built and len(b.queue) > 0

    # ---------------------------------------------------------------- commands

    def issue(self, player: int, cmd: Command) -> bool:
        """Applies a command for `player`. Returns False (changing nothing) if it isn't legal."""
        ok = self._issue(player, cmd)
        if not ok:
            self.stats[player]["invalid_commands"] += 1
        return ok

    def _issue(self, player: int, cmd: Command) -> bool:
        if self.done:
            return False
        actor = self.entities.get(cmd.actor)
        if actor is None or isinstance(actor, Resource) or actor.owner != player:
            return False

        if isinstance(actor, Building):
            if cmd.kind == "train" and cmd.what in self.cfg.units and self.can_train(actor, cmd.what):
                self._spend(player, self.cfg.units[cmd.what].cost)
                actor.queue.append(cmd.what)
                return True
            if cmd.kind == "cancel" and self.can_cancel(actor):
                kind = actor.queue.pop()  # the most recently queued unit, like the game
                if not actor.queue:  # it was the one in training
                    actor.train_progress = 0
                    actor.housed = False
                self._refund(player, self.cfg.units[kind].cost)
                return True
            return False

        u: Unit = actor
        target = self.entities.get(cmd.target)
        if cmd.kind == "stop":
            self._set_order(u, IDLE)
            return True
        if cmd.kind in ("move", "attack_move"):
            if not (0 <= cmd.x < self.width and 0 <= cmd.y < self.height):
                return False
            if cmd.kind == "attack_move" and u.kind not in COMBAT_KINDS:
                return False
            self._set_order(u, MOVE if cmd.kind == "move" else ATTACK_MOVE, dest=(cmd.x, cmd.y))
            return True
        if cmd.kind == "attack" and self.can_attack(u, target):
            self._set_order(u, ATTACK, target=target.id)
            u.ignore_until.pop(target.id, None)
            return True
        if cmd.kind == "guard" and self.can_guard(u, target):
            slot = sum(1 for o in self.units(player) if o.order == GUARD and o.target == target.id)
            self._set_order(u, GUARD, target=target.id)
            u.guard_slot = slot % len(GUARD_SLOTS)
            return True
        if cmd.kind == "harvest" and self.can_harvest(u, target):
            self._set_order(u, HARVEST, target=target.id)
            u.harvest_kind = target.kind
            return True
        if cmd.kind == "help_build" and self.can_help_build(u, target):
            self._set_order(u, BUILD, target=target.id)
            return True
        if cmd.kind == "build" and self.can_place(u, cmd.what, cmd.x, cmd.y):
            self._spend(player, self.cfg.buildings[cmd.what].cost)
            site = self._add_building(player, cmd.what, cmd.x, cmd.y, built=False)
            self._set_order(u, BUILD, target=site.id)
            return True
        return False

    def _set_order(self, u: Unit, order: str, dest=None, target=None):
        u.order = order
        u.dest = dest
        u.target = target
        u.engaged = None
        u.attacking = False  # a new order restarts any attack (and its wind-up)
        u.harvest_kind = None
        u.path = []
        u.path_key = None
        u.blocked = 0
        u.next_scan = self.tick_count  # look around straight away

    # ---------------------------------------------------------------- movement

    def _passable(self) -> np.ndarray:
        return self.map.walkable & ~self.solid

    def _step_towards(self, u: Unit, key, goal, speed: float = 1.0) -> str:
        """
        Takes one step along a path to a goal: `goal` is (rectangle, reach), see _goal_cell and
        _goal_near. Returns 'arrived' (standing on a goal cell), 'moving' (a step started), 'waiting'
        (blocked by a unit; will retry) or 'failed' (no way closer).
        """
        rect, reach = goal
        if rect_goal(u.x, u.y, rect, reach):
            return "arrived"
        cfg = self.cfg
        if u.path_key != key or not u.path or self.solid[u.path[0][1], u.path[0][0]]:
            u.path = path_to_rect(self._passable(), u.cell, rect, reach, *cfg.path_costs,
                                  partial=True, mirror=u.owner == 1) or []
            u.path_key = key
            if not u.path:
                return "failed"
        nx, ny = u.path[0]
        if abs(nx - u.x) > 1 or abs(ny - u.y) > 1:  # the path no longer starts next to us
            u.path_key = None
            return "waiting"
        if self.occ[ny, nx] != -1:
            u.blocked += 1
            if u.blocked >= cfg.give_up_blocked_ticks:
                return "failed"
            if u.blocked % 3 == 0:  # walk around the units in the way
                passable = self._passable() & (self.occ == -1)
                detour = path_to_rect(passable, u.cell, rect, reach, *cfg.path_costs,
                                      partial=True, max_expansions=4000, mirror=u.owner == 1)
                if detour:
                    u.path = detour
            return "waiting"
        u.blocked = 0
        u.path.pop(0)
        diagonal = nx != u.x and ny != u.y
        u.step_ms = (cfg.move_ms_diagonal if diagonal else cfg.move_ms_straight) / speed
        ms = u.step_ms + u.step_carry
        u.step_left = max(1, int(ms // TICK_MS))
        u.step_total = u.step_left
        u.step_carry = max(0.0, ms - u.step_left * TICK_MS)
        u.step_to = (nx, ny)
        # The unit takes the cell it walks into and leaves its own, so a unit behind it can follow
        # straight away (in the game units walk through each other).
        if self.occ[u.y, u.x] == u.id:
            self.occ[u.y, u.x] = -1
        self.occ[ny, nx] = u.id
        return "moving"

    def _advance_step(self, u: Unit):
        u.step_left -= 1
        if u.step_left > 0:
            return
        if self.occ[u.y, u.x] == u.id:
            self.occ[u.y, u.x] = -1
        u.x, u.y = u.step_to
        u.step_to = None
        if u.kind == "worker":
            u.cooldown = FIRST_SWING_DELAY  # a worker that just arrived swings 0.4 s later

    @staticmethod
    def _goal_cell(x: int, y: int):
        """The goal 'stand on (x, y)'."""
        return (x, y, x, y), 0.0

    @staticmethod
    def _goal_near(e, reach: float):
        """The goal 'be within `reach` of an entity' (of any footprint cell of a building)."""
        if isinstance(e, Building):
            return (e.x, e.y, e.x + e.w - 1, e.y + e.h - 1), reach
        return (e.x, e.y, e.x, e.y), reach

    # ---------------------------------------------------------------- tick

    def tick(self):
        """Advances the game by one tick (100 ms)."""
        if self.done:
            return
        self._damage = []
        for u in self._acting_order():
            if u.id not in self.entities:
                continue
            if u.cooldown > 0:
                u.cooldown -= 1
            if u.step_left > 0:
                self._advance_step(u)
                if u.step_left > 0:
                    continue
            if u.kind == "worker":
                self._think_worker(u)
            else:
                self._think_fighter(u)

        for b in self.buildings():
            if b.built:
                self._update_production(b)
                if b.kind == "tower":
                    self._update_tower(b)

        self._apply_damage()
        self._respawn_sheep()
        self.tick_count += 1
        self._check_end()

    def _acting_order(self) -> list:
        """
        The order units act in this tick: ranks are shuffled, and the two units sharing a rank act one
        after the other, the first chosen by a coin. Random, so neither side is favoured, and
        mirrored: a player's units act in the same relative order as the opponent's mirror images,
        so identical play on both sides stays exactly mirrored.
        """
        units = self.units()
        if not units:
            return units
        n = max(u.rank for u in units) + 1
        shuffled = self.rng.permutation(n)
        coin = self.rng.integers(2, size=n)
        return sorted(units, key=lambda u: (shuffled[u.rank], u.owner ^ coin[u.rank]))

    def _check_end(self):
        if self.castle_rule:
            alive = [self.castle(0) is not None, self.castle(1) is not None]
        else:
            alive = [True, True]
        if all(alive):
            if self.tick_count >= self.cfg.max_ticks:
                self.done, self.winner = True, -1
            return
        self.done = True
        self.winner = -1 if not any(alive) else (0 if alive[0] else 1)

    # ---------------------------------------------------------------- fighters

    def _retarget(self, u: Unit):
        cfg = self.cfg
        ward = self.get(u.target) if u.order == GUARD else None
        if ward is not None:
            ox, oy = self._center_of(ward)
            radius = cfg.guard_radius + self._extent_of(ward)
        else:
            ox, oy = u.x, u.y
            radius = cfg.units[u.kind].sight
        best, best_key, current_score = None, (math.inf,), math.inf
        # Enemy units and buildings. Each has a different position, so the order they are looked at in
        # can't change the choice.
        for e in (*self._units.values(), *self._buildings.values()):
            if e.owner == u.owner:
                continue
            if u.ignore_until.get(e.id, -1) > self.tick_count:
                continue
            dist = self.dist_to(ox, oy, e)
            if dist > radius:
                continue
            score = dist * (cfg.building_target_weight if isinstance(e, Building) else 1.0)
            if ward is not None and isinstance(e, Unit) and e.fighting == ward.id:
                score *= cfg.attacking_ward_weight
            if e.id == u.engaged:
                current_score = score
            ex, ey = self._center_of(e)
            key = (score, self.ego_x(u.owner, ex), ey)  # ties: the same choice on both sides
            if key < best_key:
                best, best_key = e, key
        if best is None or best.id == u.engaged:
            return
        if u.engaged is None or self.get(u.engaged) is None or best_key[0] < current_score * cfg.retarget_threshold:
            u.engaged = best.id

    def _think_fighter(self, u: Unit):
        cfg = self.cfg
        spec = cfg.units[u.kind]

        if u.order == ATTACK and not self.can_attack(u, self.get(u.target)):
            self._set_order(u, IDLE)
        if u.order == GUARD:
            ward = self.get(u.target)
            if ward is None or ward.owner != u.owner:
                self._set_order(u, IDLE)  # the ward is gone: stand ground
        if u.engaged is not None and self.get(u.engaged) is None:
            u.engaged = None
        if u.order == GUARD and u.engaged is not None:
            ward = self.get(u.target)
            wx, wy = self._center_of(ward)
            if self.dist_to(wx, wy, self.get(u.engaged)) > cfg.guard_leash + self._extent_of(ward):
                u.engaged = None
        if u.order in (IDLE, ATTACK_MOVE, GUARD) and self.tick_count >= u.next_scan:
            u.next_scan = self.tick_count + (cfg.guard_scan_ticks if u.order == GUARD else cfg.scan_ticks)
            self._retarget(u)

        if u.order == MOVE:
            goal = self._goal_cell(*u.dest)
            if self._step_towards(u, ("move", u.dest), goal) in ("arrived", "failed"):
                self._set_order(u, IDLE)
            return

        was_attacking, u.attacking = u.attacking, False
        target = self.get(u.fighting)
        if target is not None:
            dist = self.dist_to(u.x, u.y, target)
            if dist <= spec.attack_range + 1e-9:
                u.attacking = True
                if not was_attacking:  # starting to attack: the first hit comes after a wind-up
                    u.cooldown = max(u.cooldown, spec.windup_ticks)
                if u.cooldown == 0:
                    self._hit(target, spec.damage, u.owner, (u.x, u.y) if spec.arrow else None, attacker_id=u.id)
                    u.cooldown = spec.attack_ticks
                return
            if u.order in (ATTACK, GUARD):
                may_chase = True  # guards are kept near their ward by the leash check above
            else:
                may_chase = self.dist_to(u.x, u.y, target) <= spec.sight * cfg.leash_scale
            if may_chase:
                goal = self._goal_near(target, spec.attack_range)
                key = ("chase", target.id, target.x, target.y)
                if self._step_towards(u, key, goal) == "failed":
                    u.ignore_until[target.id] = self.tick_count + cfg.unreachable_ignore_ticks
                    if u.order == ATTACK:
                        self._set_order(u, IDLE)
                    else:
                        u.engaged = None
                return
            u.engaged = None

        if u.order == GUARD:
            self._return_to_ward(u)
        elif u.order == ATTACK_MOVE:
            goal = self._goal_cell(*u.dest)
            if self._step_towards(u, ("move", u.dest), goal) in ("arrived", "failed"):
                self._set_order(u, IDLE)

    def _return_to_ward(self, u: Unit):
        ward = self.get(u.target)
        # A walking ward: aim for where it is going, so the guard keeps up as it does in the game.
        cx, cy = ward.step_to if isinstance(ward, Unit) and ward.step_to else self._center_of(ward)
        reach = math.ceil(self._extent_of(ward)) + 1
        dx, dy = GUARD_SLOTS[u.guard_slot]
        if u.owner == 1:
            dx = -dx  # slots as the player sees them
        want = (int(round(cx + dx * reach)), int(round(cy + dy * reach)))
        post = self._post_near(u, *want)
        if post is None or post == u.cell:
            return
        behind = distance(u.x, u.y, *post) > self.cfg.guard_catch_up_cells
        goal = self._goal_cell(*post)
        self._step_towards(u, ("guard", post), goal,
                           speed=self.cfg.guard_catch_up_speed if behind else 1.0)

    def _post_near(self, u: Unit, x: int, y: int, max_radius: int = 4):
        for r in range(max_radius + 1):
            for dx, dy in self._ring(r, u.owner):
                cx, cy = x + dx, y + dy
                if (0 <= cx < self.width and 0 <= cy < self.height and self.map.walkable[cy, cx]
                        and self.occ[cy, cx] in (-1, u.id)):
                    return (cx, cy)
        return None

    # ---------------------------------------------------------------- workers

    def _think_worker(self, u: Unit):
        cfg = self.cfg
        if u.order == MOVE:
            goal = self._goal_cell(*u.dest)
            if self._step_towards(u, ("move", u.dest), goal) in ("arrived", "failed"):
                self._set_order(u, IDLE)
            return

        if u.order == BUILD:
            site = self.get(u.target)
            if not isinstance(site, Building) or site.built or site.owner != u.owner:
                self._set_order(u, IDLE)
                return
            if self.dist_to(u.x, u.y, site) < 1.5:  # next to the footprint, diagonals included
                site.progress += 1
                if site.progress >= site.build_points:
                    site.progress = float(site.build_points)
                    site.built = True
                    self.stats[u.owner]["buildings_built"] += 1
                return
            goal = self._goal_near(site, 1.5)
            if self._step_towards(u, ("build", site.id), goal) == "failed":
                self._set_order(u, IDLE)
            return

        if u.order == HARVEST:
            node = self.get(u.target)
            if not isinstance(node, Resource):
                node = self._nearest_resource(u, u.harvest_kind)
                if node is None:
                    self._set_order(u, IDLE)
                    return
                u.target = node.id
                u.path_key = None
            if max(abs(node.x - u.x), abs(node.y - u.y)) <= 1:
                if u.cooldown == 0:
                    self._swing(u, node)
                    u.cooldown = cfg.swing_ticks
                return
            goal = self._goal_near(node, 1.5)
            if self._step_towards(u, ("harvest", node.id), goal) == "failed":
                # Unreachable: skip it for a while and take the next nearest of the same kind.
                u.ignore_until[node.id] = self.tick_count + cfg.unreachable_ignore_ticks
                kind = u.harvest_kind
                nxt = self._nearest_resource(u, kind)
                if nxt is None:
                    self._set_order(u, IDLE)
                else:
                    u.target, u.path_key, u.blocked = nxt.id, None, 0

    def _nearest_resource(self, u: Unit, kind: str):
        best, best_key = None, (math.inf,)
        for r in self._resources.values():
            if r.kind == kind and u.ignore_until.get(r.id, -1) <= self.tick_count:
                key = (distance(u.x, u.y, r.x, r.y), self.ego_x(u.owner, r.x), r.y)
                if key < best_key:
                    best, best_key = r, key
        return best

    def _swing(self, u: Unit, node: Resource):
        cfg = self.cfg
        owner = u.owner
        if node.kind == "tree":
            self.resources[owner]["wood"] += cfg.wood_per_swing
            self.stats[owner]["wood"] += cfg.wood_per_swing
            node.amount -= cfg.tree_damage_per_swing
        elif node.kind == "mine":
            got = min(node.amount, cfg.gold_per_swing)
            self.resources[owner]["gold"] += got
            self.stats[owner]["gold"] += got
            node.amount -= got
        else:  # sheep: the first swing butchers it
            if not node.butchered:
                node.butchered = True
                return
            got = min(node.amount, cfg.meat_per_swing)
            self.resources[owner]["meat"] += got
            self.stats[owner]["meat"] += got
            node.amount -= got
        if node.amount <= 0:
            self._remove(node)

    # ---------------------------------------------------------------- buildings

    def _update_production(self, b: Building):
        if not b.queue:
            return
        kind = b.queue[0]
        train_ticks = self.cfg.units[kind].train_ticks
        b.train_progress = min(b.train_progress + 1, train_ticks)
        if b.train_progress < train_ticks:
            return
        units, _, capacity = self.population(b.owner)
        b.housed = units >= capacity
        if b.housed:
            return
        cell = self._exit_cell(b)
        if cell is None:
            return  # every cell around the building is taken; try again next tick
        b.queue.pop(0)
        b.train_progress = 0
        self._add_unit(b.owner, kind, *cell)
        self.stats[b.owner]["units_trained"] += 1

    def _exit_cell(self, b: Building):
        """A free cell next to the building, nearest the bottom-middle first (deterministic)."""
        cx, cy = b.x + (b.w - 1) / 2, b.y + b.h
        best, best_key = None, (math.inf,)
        for r in range(1, 4):
            for y in range(b.y - r, b.y + b.h + r):
                for x in range(b.x - r, b.x + b.w + r):
                    if self._cell_free(x, y):
                        key = (distance(x, y, cx, cy), self.ego_x(b.owner, x), y)
                        if key < best_key:
                            best, best_key = (x, y), key
            if best is not None:
                return best
        return None

    def _update_tower(self, b: Building):
        if b.cooldown > 0:
            b.cooldown -= 1
        if b.cooldown > 0:
            return  # fires every tower_ticks ticks, like units (their cooldown counts down first)
        best, best_key = None, (math.inf,)
        cx, cy = b.center  # the game measures the tower's range from its centre
        for e in self._units.values():
            if e.owner != b.owner:
                d = distance(cx, cy, e.x, e.y)
                key = (d, self.ego_x(b.owner, e.x), e.y)
                if d <= self.cfg.tower_range and key < best_key:
                    best, best_key = e, key
        if best is not None:
            self._hit(best, self.cfg.tower_damage, b.owner, b.center, attacker_id=b.id)
            b.cooldown = self.cfg.tower_ticks

    def position(self, e) -> tuple:
        """Where an entity is, in cells: part-way between two cells while a unit walks."""
        if isinstance(e, Building):
            return e.center
        if isinstance(e, Unit) and e.step_to is not None and e.step_total:
            f = 1 - e.step_left / e.step_total
            return (e.x + (e.step_to[0] - e.x) * f, e.y + (e.step_to[1] - e.y) * f)
        return (e.x, e.y)

    def _lead_velocity(self, e) -> tuple:
        """
        The velocity (cells per tick) an arrow aimed at `e` allows for: that of the step it is walking.
        The game stops leading in the last 50 ms of each of its 32 px steps (half of one of our cells); ticks
        can't tell where in a step a shot falls, so that happens with the same probability.
        """
        if isinstance(e, Unit) and e.step_to is not None and e.step_total:
            if self.rng.random() < self.cfg.arrow_no_lead_ms / (e.step_ms / 2):
                return (0.0, 0.0)
            return ((e.step_to[0] - e.x) / e.step_total, (e.step_to[1] - e.y) / e.step_total)
        return (0.0, 0.0)

    def _hit(self, target, damage: float, owner: int, arrow_from: tuple | None = None, attacker_id: int = -1):
        """
        Damage now (melee), or loose an arrow from `arrow_from` (cells) the way the game does: aimed at
        where the target will be after the flight (projectile.js), it lands there after flying at
        350 px/s and hurts the target only if it is within 30 px of that spot by then.
        """
        if arrow_from is None:
            self._damage.append((target.id, damage, owner))
            if self.record_events:
                self.events.append(("hit", self.tick_count, attacker_id, target.id))
            return
        speed = self.cfg.arrow_cells_per_tick
        sx, sy = arrow_from
        px, py = self.position(target)
        vx, vy = self._lead_velocity(target)
        lead = distance(sx, sy, px, py) / speed
        aim = (px + vx * lead, py + vy * lead)
        flight = max(1, round(distance(sx, sy, *aim) / speed))
        self._arrows.append((self.tick_count + flight, target.id, damage, owner, aim, attacker_id, arrow_from,
                             self.tick_count))

    def _apply_damage(self):
        # Arrows landing now join this tick's blows if the target is still there: alive and within
        # 30 px of where the arrow comes down (buildings don't move).
        landing = [a for a in self._arrows if a[0] <= self.tick_count]
        if landing:
            self._arrows = [a for a in self._arrows if a[0] > self.tick_count]
            for lands, target_id, amount, owner, aim, shooter_id, origin, loosed in landing:
                target = self.entities.get(target_id)
                hit = target is not None and (isinstance(target, Building) or
                                              distance(*self.position(target), *aim) < self.cfg.arrow_hit_cells)
                if hit:
                    self._damage.append((target_id, amount, owner))
                elif target is not None:
                    self.stats[owner]["arrows_missed"] += 1
                if self.record_events:
                    self.events.append(("arrow", loosed, lands, shooter_id, target_id, origin, aim, hit))
        for target_id, amount, attacker_owner in self._damage:
            e = self.entities.get(target_id)
            if e is None:
                continue
            dealt = max(0.0, min(amount, e.hp))
            e.hp -= amount
            self.stats[attacker_owner]["damage_dealt"] += dealt
        for target_id, _, _ in self._damage:
            e = self.entities.get(target_id)
            if e is None or e.hp > 0:
                continue
            if isinstance(e, Building):
                for kind in e.queue:  # a destroyed building gives back its queue
                    self._refund(e.owner, self.cfg.units[kind].cost)
                self.stats[e.owner]["buildings_lost"] += 1
            else:
                self.stats[e.owner]["units_lost"] += 1
            self._remove(e)

    def _respawn_sheep(self):
        """Each half regrows a sheep every sheep_respawn_ticks while it has fewer than sheep_per_side."""
        due = []
        for side in (0, 1):
            if self._sheep_count[side] >= self.cfg.sheep_per_side:
                self.sheep_timer[side] = 0
                continue
            self.sheep_timer[side] += 1
            if self.sheep_timer[side] >= self.cfg.sheep_respawn_ticks:
                self.sheep_timer[side] = 0
                due.append(side)
        if due == [0, 1]:
            self._spawn_sheep_pair()
        else:
            for side in due:
                self._spawn_sheep(side)

    def _spawn_sheep_pair(self):
        """One sheep on each half, mirroring each other when possible (keeps mirrored play mirrored)."""
        w = self.width
        sheep = self._spawn_sheep(0)
        if sheep is not None:
            mx = mirror_x(sheep.x, w)
            if self._cell_free(mx, sheep.y) and mx >= w - w // 2:
                self._add_resource("sheep", mx, sheep.y, self.cfg.sheep_meat, side=1)
                return
        self._spawn_sheep(1)
