"""Scripted opponents, for testing the environment and as baselines to measure agents against.

A bot has `act(env, player, obs)` returning that player's action: a list of game Commands or a
GridNet action array.
"""

from __future__ import annotations

import numpy as np

from .config import COMBAT_KINDS, PLACEABLE_KINDS
from .game import BUILD, HARVEST, IDLE, Command
from .gridnet import A, ACTION_TYPES, HEAD


class NoopBot:
    """Never gives an order (its units still defend themselves)."""

    def act(self, env, player, obs):
        return []


def local_head(type_index: int, build_kind: int) -> int | None:
    name = ACTION_TYPES[type_index]
    if name == "build":
        return HEAD[f"build_{PLACEABLE_KINDS[build_kind]}"]
    return HEAD.get(name)


def sample_masked_action(masks: dict, rng: np.random.Generator, act_prob: float = 0.3,
                         shape: tuple | None = None) -> np.ndarray:
    """A random legal GridNet action: each actor gives a random legal order with probability
    `act_prob` (type first, then the parameters that type uses). Takes either mask format; with
    "actors" masks pass the grid `shape` (height, width). Actors are visited in row-major cell order
    either way, so both formats give the same action for the same random generator."""
    if "cells" in masks:  # actor format: rows per actor
        order = np.lexsort((masks["cells"][:, 0], masks["cells"][:, 1]))
        rows = [(int(masks["cells"][j, 1]), int(masks["cells"][j, 0]), j) for j in order
                if masks["type"][j, 1:].any()]
        pick = lambda key, j: masks[key][j]  # noqa: E731
        h, w = shape
    else:
        type_mask = masks["type"]
        h, w, _ = type_mask.shape
        rows = [(int(ey), int(ex), (ey, ex)) for ey, ex in np.argwhere(type_mask[:, :, 1:].any(axis=2))]
        pick = lambda key, j: masks[key][j]  # noqa: E731
    action = np.zeros((h, w, 5), dtype=np.int64)
    regions = np.flatnonzero(masks["region"])
    for ey, ex, j in rows:
        if rng.random() >= act_prob:
            continue
        legal = np.flatnonzero(pick("type", j))
        legal = legal[legal != A["noop"]]
        t = int(rng.choice(legal))
        action[ey, ex, 0] = t
        if ACTION_TYPES[t] in ("move", "attack_move"):
            action[ey, ex, 2] = int(rng.choice(regions))
        if ACTION_TYPES[t] == "train":
            action[ey, ex, 4] = int(rng.choice(np.flatnonzero(pick("train_kind", j))))
        if ACTION_TYPES[t] == "build":
            action[ey, ex, 3] = int(rng.choice(np.flatnonzero(pick("build_kind", j))))
        head = local_head(t, action[ey, ex, 3])
        if head is not None:
            action[ey, ex, 1] = int(rng.choice(np.flatnonzero(pick("local", j)[head])))
    return action


class RandomBot:
    """Random legal orders (see sample_masked_action)."""

    def __init__(self, seed: int = 0, act_prob: float = 0.3):
        self.rng = np.random.default_rng(seed)
        self.act_prob = act_prob

    def act(self, env, player, obs):
        return sample_masked_action(obs["masks"], self.rng, self.act_prob, shape=(env.game.height, env.game.width))


class RushBot:
    """
    A simple full-game strategy: keep `workers` workers busy (gold, meat, wood), build a barracks and
    houses near the castle, train warriors and lancers, and attack-move every idle soldier to the
    enemy castle once `wave` of them are ready.
    """

    def __init__(self, workers: int = 6, wave: int = 6):
        self.target_workers = workers
        self.wave = wave

    def act(self, env, player, obs):
        g = env.game
        cmds = []
        me, enemy = player, 1 - player
        castle = g.castle(me)
        if castle is None:
            return cmds
        units = g.units(me)
        workers = [u for u in units if u.kind == "worker"]
        soldiers = [u for u in units if u.kind in COMBAT_KINDS]
        buildings = g.buildings(me)
        n_units, n_queued, capacity = g.population(me)

        # Economy: workers from the castle, kept busy on gold, meat and wood.
        queued_workers = castle.queue.count("worker")
        if len(workers) + queued_workers < self.target_workers and not castle.queue and g.can_train(castle, "worker"):
            cmds.append(Command("train", castle.id, what="worker"))
        jobs = {kind: sum(1 for u in workers if u.order == HARVEST and u.harvest_kind == kind)
                for kind in ("mine", "sheep", "tree")}

        # Buildings: a barracks, then houses whenever the village is nearly full.
        sites = [b for b in buildings if not b.built]
        builders = {u.target for u in workers if u.order == BUILD}
        free_workers = [u for u in workers if u.order == IDLE]
        want = None
        if not any(b.kind == "barracks" for b in buildings):
            want = "barracks"
        elif capacity - (n_units + n_queued) <= 2 and not any(b.kind == "house" for b in sites):
            want = "house"
        if want and g.can_afford(me, g.cfg.buildings[want].cost):
            # Choose the spot as this player sees its base (mirrored for player 1), so both sides
            # build alike: the barracks below the castle, houses below and behind it.
            width = g.cfg.buildings[want].size[0]
            ego_castle_x = castle.x if me == 0 else g.width - castle.x - castle.w
            ego_x = ego_castle_x - (castle.w + 1 if want == "house" else 0)
            x = ego_x if me == 0 else g.width - ego_x - width
            anchor = g.nearest_valid_anchor(want, x, castle.y + castle.h + 2, max_radius=10, owner=me)
            builder = self._pick_builder(free_workers, [u for u in workers if u.order == HARVEST], anchor)
            if builder and anchor:
                cmds.append(Command("build", builder[0].id, x=anchor[0], y=anchor[1], what=want))
                if builder[0] in free_workers:
                    free_workers.remove(builder[0])
        for site in sites:
            if site.id not in builders and free_workers:
                cmds.append(Command("help_build", free_workers.pop(0).id, target=site.id))

        for u in free_workers:
            kind = "mine" if jobs["mine"] < 2 else "sheep" if jobs["sheep"] < 1 else "tree"
            node = self._nearest(g, u, kind) or self._nearest(g, u, "tree")
            if node is not None:
                cmds.append(Command("harvest", u.id, target=node.id))
                jobs[node.kind] += 1

        # Army: warriors and lancers from every barracks.
        for b in buildings:
            if b.kind == "barracks" and b.built and len(b.queue) < 2:
                kind = "warrior" if len(soldiers) % 2 == 0 else "lancer"
                if g.can_train(b, kind):
                    cmds.append(Command("train", b.id, what=kind))

        idle = [u for u in soldiers if u.order == IDLE and u.engaged is None]
        target = g.castle(enemy)
        if target is not None and len(idle) >= self.wave:
            cx, cy = target.center
            # Round as this player sees the map, so both sides aim at mirror-image cells.
            x = int(cx) if me == 0 else g.width - 1 - int(g.width - 1 - cx)
            for u in idle:
                cmds.append(Command("attack_move", u.id, x=x, y=int(cy)))
        return cmds

    @staticmethod
    def _pick_builder(free_workers, harvesting, anchor) -> list:
        """The worker to build with ([] if none): the first idle one, else the first harvesting one."""
        return (free_workers or harvesting)[:1]

    @staticmethod
    def _nearest(g, u, kind):
        best, best_key = None, None
        for r in g.resource_nodes(kind):
            key = ((r.x - u.x) ** 2 + (r.y - u.y) ** 2, g.ego_x(u.owner, r.x), r.y)
            if best_key is None or key < best_key:
                best, best_key = r, key
        return best
