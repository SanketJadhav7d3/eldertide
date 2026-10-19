"""What an agent sees and how it gives orders, in the GridNet style of MicroRTS: one action per cell.

Every array here is in the acting player's own view ("ego" frame). With `ego_view` on, player 1 sees
the map flipped left-right, so its base is in the west just like player 0's and one policy can play
either side. Actions are converted back to real map coordinates when they are decoded.

Observation
  planes  float32 [H, W, len(PLANES)]  what is on each cell (see PLANES)
  globals float32 [len(GLOBALS)]       the player's resources, population and the game clock

Action: int array [H, W, 5]; at each cell [type, local, region, build_kind, train_kind]
  type        ACTION_TYPES. Read at cells holding one of the player's units, or the top-left
              cell (in the ego frame) of one of its buildings; ignored everywhere else.
  local       a cell in the 15x15 square around the acting cell, index (dy + 7) * 15 + (dx + 7):
              the target of attack / guard / harvest / help_build, or the top-left cell of the
              building to place for build.
  region      one of the map's 8x8-cell regions (row-major); the destination of move / attack_move
              (the walkable cell nearest the region's centre).
  build_kind  PLACEABLE_KINDS, for build.
  train_kind  UNIT_KINDS, for train.

Masks (what is legal now; sample `type` first, then the parameters it uses with their masks)
  type        bool [H, W, len(ACTION_TYPES)]  (noop is always legal)
  local       bool [H, W, len(LOCAL_HEADS), 225]; LOCAL_HEADS gives the head for each type,
              with one build head per building kind
  region      bool [n_regions] (the same for every cell)
  build_kind  bool [H, W, len(PLACEABLE_KINDS)]
  train_kind  bool [H, W, len(UNIT_KINDS)]
"""

from __future__ import annotations

import numpy as np

from .config import COMBAT_KINDS, PLACEABLE_KINDS, UNIT_KINDS
from .game import ORDERS, Building, Command, Game, Resource, Unit, GUARD

ACTION_TYPES = ("noop", "stop", "move", "attack", "attack_move", "guard", "harvest", "build", "help_build",
                "train", "cancel")
A = {name: i for i, name in enumerate(ACTION_TYPES)}

RADIUS = 7
WINDOW = 2 * RADIUS + 1
N_LOCAL = WINDOW * WINDOW
REGION = 8

LOCAL_HEADS = ("attack", "guard", "harvest", "help_build") + tuple(f"build_{k}" for k in PLACEABLE_KINDS)
HEAD = {name: i for i, name in enumerate(LOCAL_HEADS)}

PLANES = (
    "walkable", "buildable", "tree", "gold_mine", "sheep", "sheep_butchered", "resource_left",
    "own", "enemy",
    *(f"unit_{k}" for k in UNIT_KINDS),
    "building_castle", "building_house", "building_tower", "building_barracks", "building_archery",
    "under_construction", "build_progress", "hp",
    *(f"order_{o}" for o in ORDERS),
    "moving", "moving_from", "ready",
    "queue", "train_progress", "housed", "guarded",
)
P = {name: i for i, name in enumerate(PLANES)}
GLOBALS = ("wood", "meat", "gold", "pop_units", "pop_queued", "pop_capacity", "enemy_units", "time")


def local_index(dx: int, dy: int) -> int:
    return (dy + RADIUS) * WINDOW + (dx + RADIUS)


def local_offset(index: int) -> tuple:
    return index % WINDOW - RADIUS, index // WINDOW - RADIUS


class GridNetInterface:
    """Observations, masks and action decoding for one game; rebuild it after a reset."""

    def __init__(self, game: Game, ego_view: bool = True):
        self.game = game
        self.w, self.h = game.width, game.height
        self.ego_view = ego_view
        self.rw = -(-self.w // REGION)
        self.rh = -(-self.h // REGION)
        self.n_regions = self.rw * self.rh
        self._region_targets = [self._make_region_targets(p) for p in (0, 1)]
        self.action_nvec = np.array([len(ACTION_TYPES), N_LOCAL, self.n_regions, len(PLACEABLE_KINDS),
                                     len(UNIT_KINDS)])

    # ------------------------------------------------------------ frames

    def flips(self, player: int) -> bool:
        return self.ego_view and player == 1

    def to_ego(self, player: int, grid: np.ndarray) -> np.ndarray:
        """A real-frame [H, W, ...] array in the player's view."""
        return grid[:, ::-1] if self.flips(player) else grid

    def real_cell(self, player: int, ex: int, ey: int) -> tuple:
        return (self.w - 1 - ex, ey) if self.flips(player) else (ex, ey)

    def ego_cell(self, player: int, x: int, y: int) -> tuple:
        return self.real_cell(player, x, y)  # the flip is its own inverse

    def ego_anchor(self, player: int, b: Building) -> tuple:
        """The building's top-left cell as the player sees it."""
        return (self.w - b.x - b.w, b.y) if self.flips(player) else (b.x, b.y)

    def real_anchor(self, player: int, ax: int, ay: int, width: int) -> tuple:
        return (self.w - ax - width, ay) if self.flips(player) else (ax, ay)

    def _make_region_targets(self, player: int) -> list:
        """For each region (ego frame): the walkable cell nearest its centre (real frame), or None."""
        walkable = self.to_ego(player, self.game.map.walkable)
        targets = []
        for ry in range(self.rh):
            for rx in range(self.rw):
                ys, xs = np.nonzero(walkable[ry * REGION:(ry + 1) * REGION, rx * REGION:(rx + 1) * REGION])
                if len(xs) == 0:
                    targets.append(None)
                    continue
                cx, cy = (REGION - 1) / 2, (REGION - 1) / 2
                i = int(np.argmin((xs - cx) ** 2 + (ys - cy) ** 2 + 1e-6 * (ys * REGION + xs)))
                targets.append(self.real_cell(player, int(rx * REGION + xs[i]), int(ry * REGION + ys[i])))
        return targets

    def region_target(self, player: int, region: int):
        return self._region_targets[player][region]

    # ------------------------------------------------------------ observation

    def observe(self, player: int) -> dict:
        g = self.game
        planes = np.zeros((self.h, self.w, len(PLANES)), dtype=np.float32)
        planes[:, :, P["walkable"]] = g.map.walkable
        planes[:, :, P["buildable"]] = g.map.buildable
        guarded = {u.target for u in g.units(player) if u.order == GUARD}
        max_queue = g.cfg.max_queue
        for e in g.entities.values():
            if isinstance(e, Resource):
                planes[e.y, e.x, P[{"tree": "tree", "mine": "gold_mine", "sheep": "sheep"}[e.kind]]] = 1
                planes[e.y, e.x, P["sheep_butchered"]] = e.butchered
                planes[e.y, e.x, P["resource_left"]] = e.amount / e.max_amount
            elif isinstance(e, Unit):
                ox, oy = e.occupied  # a walking unit is shown on the cell it is walking into
                cell = planes[oy, ox]
                cell[P["own" if e.owner == player else "enemy"]] = 1
                cell[P[f"unit_{e.kind}"]] = 1
                cell[P["hp"]] = e.hp / e.max_hp
                cell[P[f"order_{e.order}"]] = 1
                cell[P["ready"]] = e.cooldown == 0
                cell[P["guarded"]] = e.id in guarded
                if e.step_to is not None:
                    cell[P["moving"]] = 1
                    planes[e.y, e.x, P["moving_from"]] = 1
            else:  # building: every footprint cell
                block = planes[e.y:e.y + e.h, e.x:e.x + e.w]
                block[:, :, P["own" if e.owner == player else "enemy"]] = 1
                block[:, :, P[f"building_{e.kind}"]] = 1
                block[:, :, P["under_construction"]] = not e.built
                block[:, :, P["build_progress"]] = e.progress / e.build_points
                block[:, :, P["hp"]] = e.hp / e.max_hp
                block[:, :, P["queue"]] = len(e.queue) / max_queue
                if e.queue:
                    block[:, :, P["train_progress"]] = e.train_progress / g.cfg.units[e.queue[0]].train_ticks
                block[:, :, P["housed"]] = e.housed
                block[:, :, P["guarded"]] = e.id in guarded
        units, queued, capacity = g.population(player)
        res = g.resources[player]
        pop_max = g.cfg.pop_max
        globals_ = np.array([
            res["wood"] / 1000, res["meat"] / 1000, res["gold"] / 1000,
            units / pop_max, queued / pop_max, capacity / pop_max,
            g.population(1 - player)[0] / pop_max,
            g.tick_count / g.cfg.max_ticks,
        ], dtype=np.float32)
        return {"planes": np.ascontiguousarray(self.to_ego(player, planes)), "globals": globals_}

    # ------------------------------------------------------------ masks

    def actor_masks(self, player: int) -> dict:
        """
        The masks for the player's actors only: what a trainer should store (the dense `masks` are
        mostly empty). K actors, units first (in id order) then buildings:
          cells       int  [K, 2]   each actor's (x, y) in the player's view
          type        bool [K, len(ACTION_TYPES)]
          local       bool [K, len(LOCAL_HEADS), 225]
          build_kind  bool [K, len(PLACEABLE_KINDS)]
          train_kind  bool [K, len(UNIT_KINDS)]
          region      bool [n_regions]  (the same for every actor)
        """
        g = self.game
        h, w = self.h, self.w
        units = g.units(player)
        buildings = g.buildings(player)
        k_units = len(units)
        k = k_units + len(buildings)
        type_mask = np.zeros((k, len(ACTION_TYPES)), dtype=bool)
        type_mask[:, A["noop"]] = True
        local = np.zeros((k, len(LOCAL_HEADS), N_LOCAL), dtype=bool)
        build_kind = np.zeros((k, len(PLACEABLE_KINDS)), dtype=bool)
        train_kind = np.zeros((k, len(UNIT_KINDS)), dtype=bool)
        cells = np.zeros((k, 2), dtype=np.int64)
        region = np.array([t is not None for t in self._region_targets[player]], dtype=bool)
        any_region = bool(region.any())

        # What is on each cell, from the occupancy grid: a unit walking into a cell has it reserved,
        # so it can be targeted on both cells.
        occ = g.occ
        n_ids = g._next_id + 1
        is_own = np.zeros(n_ids + 1, dtype=bool)  # index -1 (empty) lands on the extra last slot
        is_enemy = np.zeros(n_ids + 1, dtype=bool)
        is_resource = np.zeros(n_ids + 1, dtype=bool)
        is_site = np.zeros(n_ids + 1, dtype=bool)
        for e in g._units.values():
            (is_own if e.owner == player else is_enemy)[e.id] = True
        for b in g._buildings.values():
            (is_own if b.owner == player else is_enemy)[b.id] = True
            if b.owner == player and not b.built:
                is_site[b.id] = True
        for r in g._resources.values():
            is_resource[r.id] = True

        # One padded stack, in the player's view, so 15 x 15 windows never run off the map. Its
        # layers are in LOCAL_HEADS order: attack (enemy), guard (own), harvest (resource),
        # help_build (site), then one layer of valid top-left cells per building kind.
        ego_occ = self.to_ego(player, occ)
        stack = np.zeros((len(LOCAL_HEADS), h + 2 * RADIUS, w + 2 * RADIUS), dtype=bool)
        inner = (slice(RADIUS, RADIUS + h), slice(RADIUS, RADIUS + w))
        stack[(0,) + inner] = is_enemy[ego_occ]
        stack[(1,) + inner] = is_own[ego_occ]
        stack[(2,) + inner] = is_resource[ego_occ]
        stack[(3,) + inner] = is_site[ego_occ]
        occ_p = np.full((h + 2 * RADIUS, w + 2 * RADIUS), -1, dtype=occ.dtype)
        occ_p[inner] = ego_occ

        # Valid top-left cells per building kind (real frame, then flipped; see real_anchor).
        free = g.map.buildable & (occ == -1)
        sums = np.pad(free.astype(np.int32), ((1, 0), (1, 0))).cumsum(0).cumsum(1)
        affordable = np.array([g.can_afford(player, g.cfg.buildings[kind].cost) for kind in PLACEABLE_KINDS])
        for i, kind in enumerate(PLACEABLE_KINDS):
            bw, bh = g.cfg.buildings[kind].size
            if bw > w or bh > h:
                continue
            full = sums[bh:, bw:] - sums[:-bh, bw:] - sums[bh:, :-bw] + sums[:-bh, :-bw]
            valid = np.zeros((h, w), dtype=bool)
            valid[: h - bh + 1, : w - bw + 1] = full == bw * bh
            if self.flips(player):
                flipped, valid = valid[:, ::-1], np.zeros((h, w), dtype=bool)
                valid[:, : w - bw + 1] = flipped[:, bw - 1:]
            stack[(4 + i,) + inner] = valid

        head_attack, head_guard = HEAD["attack"], HEAD["guard"]
        head_harvest, head_help = HEAD["harvest"], HEAD["help_build"]
        build_heads = slice(HEAD[f"build_{PLACEABLE_KINDS[0]}"], HEAD[f"build_{PLACEABLE_KINDS[-1]}"] + 1)
        if k_units:
            # Every unit's 15 x 15 window of every layer at once: [units, layers, 225].
            ux = np.fromiter((u.occupied[0] for u in units), dtype=np.int64, count=k_units)
            uy = np.fromiter((u.occupied[1] for u in units), dtype=np.int64, count=k_units)
            ids = np.fromiter((u.id for u in units), dtype=np.int64, count=k_units)
            fighter = np.fromiter((u.kind in COMBAT_KINDS for u in units), dtype=bool, count=k_units)
            worker = ~fighter
            ex = self.w - 1 - ux if self.flips(player) else ux
            ey = uy
            cells[:k_units, 0] = ex
            cells[:k_units, 1] = ey
            offsets = np.arange(WINDOW)
            yy = ey[:, None, None] + offsets[None, :, None]
            xx = ex[:, None, None] + offsets[None, None, :]
            win = stack[:, yy, xx].reshape(len(LOCAL_HEADS), k_units, N_LOCAL).transpose(1, 0, 2)
            not_self = occ_p[yy, xx].reshape(k_units, N_LOCAL) != ids[:, None]
            lm = local[:k_units]
            lm[fighter, head_attack] = win[fighter, head_attack]
            lm[fighter, head_guard] = win[fighter, head_guard] & not_self[fighter]
            lm[worker, head_harvest] = win[worker, head_harvest]
            lm[worker, head_help] = win[worker, head_help]
            lm[worker, build_heads] = win[worker, build_heads] & affordable[None, :, None]
            some = lm.any(axis=2)  # [units, heads]: any legal target
            tm = type_mask[:k_units]
            tm[:, A["stop"]] = True
            tm[:, A["move"]] = any_region
            tm[fighter, A["attack"]] = some[fighter, head_attack]
            tm[fighter, A["guard"]] = some[fighter, head_guard]
            tm[fighter, A["attack_move"]] = any_region
            tm[worker, A["harvest"]] = some[worker, head_harvest]
            tm[worker, A["help_build"]] = some[worker, head_help]
            build_kind[:k_units] = some[:, build_heads] & worker[:, None]
            tm[worker, A["build"]] = build_kind[:k_units][worker].any(axis=1)

        for j, b in enumerate(buildings, start=k_units):
            cells[j] = self.ego_anchor(player, b)
            for i, kind in enumerate(UNIT_KINDS):
                train_kind[j, i] = g.can_train(b, kind)
            type_mask[j, A["train"]] = train_kind[j].any()
            type_mask[j, A["cancel"]] = g.can_cancel(b)

        return {"cells": cells, "type": type_mask, "local": local, "region": region,
                "build_kind": build_kind, "train_kind": train_kind}

    def masks(self, player: int, actors: dict | None = None) -> dict:
        """The masks as whole-grid arrays (see the module docstring), built from actor_masks."""
        a = actors if actors is not None else self.actor_masks(player)
        h, w = self.h, self.w
        type_mask = np.zeros((h, w, len(ACTION_TYPES)), dtype=bool)
        type_mask[:, :, A["noop"]] = True
        local = np.zeros((h, w, len(LOCAL_HEADS), N_LOCAL), dtype=bool)
        build_kind = np.zeros((h, w, len(PLACEABLE_KINDS)), dtype=bool)
        train_kind = np.zeros((h, w, len(UNIT_KINDS)), dtype=bool)
        xs, ys = a["cells"][:, 0], a["cells"][:, 1]
        type_mask[ys, xs] = a["type"]
        local[ys, xs] = a["local"]
        build_kind[ys, xs] = a["build_kind"]
        train_kind[ys, xs] = a["train_kind"]
        return {"type": type_mask, "local": local, "region": a["region"], "build_kind": build_kind,
                "train_kind": train_kind}

    # ------------------------------------------------------------ decoding

    def actors(self, player: int) -> dict:
        """Ego cell -> the unit or building that acts from it."""
        cells = {}
        for u in self.game.units(player):
            cells[self.ego_cell(player, *u.occupied)] = u
        for b in self.game.buildings(player):
            cells[self.ego_anchor(player, b)] = b
        return cells

    def decode(self, player: int, action: np.ndarray) -> list:
        """The commands an action array gives (cells without an actor, and noops, give none)."""
        action = np.asarray(action)
        if action.shape != (self.h, self.w, 5):
            raise ValueError(f"action must have shape {(self.h, self.w, 5)}, got {action.shape}")
        commands = []
        for (ex, ey), actor in self.actors(player).items():
            a_type, a_local, a_region, a_build, a_train = (int(v) for v in action[ey, ex])
            if not 0 <= a_type < len(ACTION_TYPES) or a_type == A["noop"]:
                continue
            name = ACTION_TYPES[a_type]
            if isinstance(actor, Building):
                if name == "train" and 0 <= a_train < len(UNIT_KINDS):
                    commands.append(Command("train", actor.id, what=UNIT_KINDS[a_train]))
                elif name == "cancel":
                    commands.append(Command("cancel", actor.id))
                else:
                    commands.append(Command(name, actor.id))  # illegal for a building: rejected by the game
                continue
            if name == "stop":
                commands.append(Command("stop", actor.id))
            elif name in ("move", "attack_move"):
                target = self.region_target(player, a_region) if 0 <= a_region < self.n_regions else None
                if target is None:
                    commands.append(Command(name, actor.id))  # off-map destination: rejected
                else:
                    commands.append(Command(name, actor.id, x=target[0], y=target[1]))
            elif name in ("attack", "guard", "harvest", "help_build", "build"):
                if not 0 <= a_local < N_LOCAL:
                    commands.append(Command(name, actor.id))
                    continue
                dx, dy = local_offset(a_local)
                tx, ty = ex + dx, ey + dy
                if name == "build":
                    if not 0 <= a_build < len(PLACEABLE_KINDS):
                        commands.append(Command("build", actor.id))
                        continue
                    kind = PLACEABLE_KINDS[a_build]
                    rx, ry = self.real_anchor(player, tx, ty, self.game.cfg.buildings[kind].size[0])
                    commands.append(Command("build", actor.id, x=rx, y=ry, what=kind))
                else:
                    rx, ry = self.real_cell(player, tx, ty)
                    target = self.game.entity_at(rx, ry)
                    commands.append(Command(name, actor.id, target=target.id if target is not None else -1))
            else:
                commands.append(Command(name, actor.id))  # train/cancel on a unit: rejected by the game
        return commands
