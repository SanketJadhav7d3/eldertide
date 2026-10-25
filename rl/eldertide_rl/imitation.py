"""Imitation learning: turning a scripted bot's orders into the agent's own actions.

The bots give exact game Commands ("harvest tree 812", "attack-move to (40, 30)"); the network can only
express what the action space allows (see gridnet.py): a target within its 15 x 15 window, or one of
the 8 x 8-cell regions as a destination. `encode_commands` translates, as closely as the action space
allows:

  train, cancel           as they are
  attack, guard, harvest, help_build, build
                          the target (or the building's top-left cell) in the actor's window when it
                          is there and legal; otherwise a move to the region holding it (the bot gives
                          the order again once the unit has arrived and is idle, now within reach)
  move, attack_move       the region holding the destination
  stop                    as it is

`TranslatedBot` plays a bot through that translation, so how much a bot loses in translation can be
measured directly: TranslatedBot(RushBot()) against RushBot() is what a perfect copy of RushBot could
score. The translated actions are also the labels a network is trained to copy.
"""

from __future__ import annotations

from collections import Counter

import numpy as np

from .config import PLACEABLE_KINDS, UNIT_KINDS
from .bots import RushBot
from .game import Building, Unit
from .gridnet import A, HEAD, RADIUS, REGION, local_index

# How each command was translated (counted by encode_commands when given a Counter).
EXACT, BY_REGION, DROPPED = "exact", "by_region", "dropped"


def actor_masks_of(env, player: int, obs: dict | None = None) -> dict:
    """The actor-format masks for this state (taken from obs when it has them)."""
    masks = obs.get("masks") if obs else None
    if masks is not None and "cells" in masks:
        return masks
    return env.interface.actor_masks(player)


def actor_rows(env, player: int, masks: dict) -> dict:
    """Entity id -> its row in the actor masks (units first, in id order, then buildings)."""
    g = env.game
    ids = [u.id for u in g.units(player)] + [b.id for b in g.buildings(player)]
    if len(ids) != len(masks["cells"]):
        raise ValueError("the masks do not describe this state")
    return {entity_id: row for row, entity_id in enumerate(ids)}


def _region_of(interface, ex: int, ey: int) -> int:
    return (ey // REGION) * interface.rw + ex // REGION


def encode_commands(env, player: int, commands: list, masks: dict, counts: Counter | None = None) -> np.ndarray:
    """A bot's commands as the agent's action rows [K, 5] (K = actors, in actor_masks order).
    Actors without a command get noop; commands that cannot be expressed are dropped."""
    g = env.game
    interface = env.interface
    rows_of = actor_rows(env, player, masks)
    rows = np.zeros((len(masks["cells"]), 5), dtype=np.int64)
    regions = masks["region"]
    note = (lambda what: counts.update([what])) if counts is not None else (lambda what: None)

    def go_to_region(row: int, ex: int, ey: int, kind: str = "move") -> bool:
        region = _region_of(interface, ex, ey)
        if not (0 <= region < len(regions) and regions[region] and masks["type"][row, A[kind]]):
            return False
        rows[row] = 0
        rows[row, 0], rows[row, 2] = A[kind], region
        return True

    def point_at(row: int, kind: str, head: int, cells: list, build_kind: int = 0) -> bool:
        """Points the actor's local head at the first of `cells` (ego frame) that is in its window and legal."""
        if not masks["type"][row, A[kind]]:
            return False
        ax, ay = masks["cells"][row]
        for cx, cy in cells:
            dx, dy = cx - ax, cy - ay
            if max(abs(dx), abs(dy)) > RADIUS:
                continue
            index = local_index(dx, dy)
            if masks["local"][row, head, index]:
                rows[row] = 0
                rows[row, 0], rows[row, 1], rows[row, 3] = A[kind], index, build_kind
                return True
        return False

    for cmd in commands:
        row = rows_of.get(cmd.actor)
        if row is None:
            note(DROPPED)
            continue
        actor = g.get(cmd.actor)
        kind = cmd.kind

        if isinstance(actor, Building):
            if kind == "train" and cmd.what in UNIT_KINDS:
                i = UNIT_KINDS.index(cmd.what)
                if masks["type"][row, A["train"]] and masks["train_kind"][row, i]:
                    rows[row] = 0
                    rows[row, 0], rows[row, 4] = A["train"], i
                    note(EXACT)
                    continue
            elif kind == "cancel" and masks["type"][row, A["cancel"]]:
                rows[row] = 0
                rows[row, 0] = A["cancel"]
                note(EXACT)
                continue
            note(DROPPED)
            continue

        if kind == "stop":
            rows[row] = 0
            rows[row, 0] = A["stop"]
            note(EXACT)
            continue

        if kind in ("move", "attack_move"):
            ex, ey = interface.ego_cell(player, cmd.x, cmd.y)
            note(BY_REGION if go_to_region(row, ex, ey, kind) else DROPPED)
            continue

        if kind == "build":
            if cmd.what not in PLACEABLE_KINDS:
                note(DROPPED)
                continue
            b = PLACEABLE_KINDS.index(cmd.what)
            width = g.cfg.buildings[cmd.what].size[0]
            ex, ey = interface.ego_cell(player, cmd.x + width - 1, cmd.y) if interface.flips(player) \
                else (cmd.x, cmd.y)  # the building's top-left cell as the player sees it
            if masks["build_kind"][row, b] and point_at(row, "build", HEAD[f"build_{cmd.what}"], [(ex, ey)], b):
                note(EXACT)
            else:
                note(BY_REGION if go_to_region(row, ex, ey) else DROPPED)
            continue

        if kind in ("attack", "guard", "harvest", "help_build"):
            target = g.get(cmd.target)
            if target is None:
                note(DROPPED)
                continue
            if isinstance(target, Building):
                cells = [interface.ego_cell(player, x, y)
                         for y in range(target.y, target.y + target.h) for x in range(target.x, target.x + target.w)]
            else:
                tx, ty = target.occupied if isinstance(target, Unit) else (target.x, target.y)
                cells = [interface.ego_cell(player, tx, ty)]
            ax, ay = masks["cells"][row]
            cells.sort(key=lambda c: max(abs(c[0] - ax), abs(c[1] - ay)))
            if point_at(row, kind, HEAD[kind], cells):
                note(EXACT)
            else:
                fallback = "attack_move" if kind == "attack" else "move"
                note(BY_REGION if go_to_region(row, *cells[0], fallback) else DROPPED)
            continue

        note(DROPPED)
    return rows


def rows_to_grid(env, masks: dict, rows: np.ndarray) -> np.ndarray:
    """Action rows [K, 5] spread onto the GridNet action grid [H, W, 5]."""
    g = env.game
    action = np.zeros((g.height, g.width, 5), dtype=np.int64)
    cells = masks["cells"]
    if len(cells):
        action[cells[:, 1], cells[:, 0]] = rows
    return action


class TranslatedBot:
    """Plays `bot`'s orders through encode_commands, as a network copying it perfectly would."""

    def __init__(self, bot):
        self.bot = bot
        self.counts: Counter = Counter()

    def act(self, env, player, obs):
        commands = self.bot.act(env, player, obs)
        masks = actor_masks_of(env, player, obs)
        rows = encode_commands(env, player, commands, masks, self.counts)
        return rows_to_grid(env, masks, rows)


class TeacherRushBot(RushBot):
    """RushBot as a teacher: the same strategy, but it builds with the worker nearest the building
    site, so the build order fits in that worker's window (see encode_commands). RushBot builds with
    the first idle or harvesting worker, which is often too far away: the order then becomes "walk
    there first", and RushBot, seeing no building site yet, keeps pulling more workers off their jobs."""

    @staticmethod
    def _pick_builder(free_workers, harvesting, anchor) -> list:
        candidates = free_workers or harvesting
        if not candidates or anchor is None:
            return candidates[:1]
        reach = lambda u: max(abs(u.occupied[0] - anchor[0]), abs(u.occupied[1] - anchor[1]))  # noqa: E731
        near = [u for u in free_workers + harvesting if reach(u) <= RADIUS]
        return [min(near or candidates, key=lambda u: (reach(u), u.id))]
