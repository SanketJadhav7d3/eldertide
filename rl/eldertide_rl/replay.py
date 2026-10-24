"""Replays: a record of what happened in a simulated game, for watching in the browser game
(start screen -> "Watch replay").

The replay stores what happened, not the orders given: the browser game is not a step-for-step copy of
the simulator, so re-running the orders there would drift apart. Every frame (each agent decision,
0.5 s of game time by default) holds every unit and building, the resources that appeared or went,
both players' stock, and the hits and arrows since the last frame.

Format ("eldertide-replay", version 1), JSON, gzip-compressed when the file name ends in .gz:

  map, origin       the map file the game was on, and where the simulator's grid starts on it (tiles);
                    every position below is in map-file tiles: pixel = tile * 64 + 32
  size              the simulator's grid (width, height) in tiles, starting at origin
  mirrored          the game was played with the map's west half copied onto its east half
                    (EnvConfig.mirror_map), so the viewer must draw the map that way too
  tick_ms           100; times are in ticks
  players           [{name, color}, {name, color}]
  kinds             names for the kind numbers used below (units, buildings, resources, actions)
  building_sizes    footprint (w, h) in tiles per building kind
  resources         [[id, kind, x, y], ...] at the start
  winner, ticks     filled in when the game ends (-1: a draw)
  frames            [{t, u, b, ra, rr, rb, res, pop, ev}, ...]
    u   units      [[id, kind, owner, x, y, health 0..1, action, target id or -1], ...]
                   x, y are where the unit is, part-way between tiles while walking
    b   buildings  [[id, kind, owner, x, y (top-left tile), health 0..1, built 0..1, queue length], ...]
    ra  resources that appeared [[id, kind, x, y]]; rr ids that went; rb ids of sheep butchered
    res [[wood, meat, gold], [wood, meat, gold]]   pop [[units, queued, room], [...]]
    ev  ["hit", tick, attacker id, target id]
        ["arrow", loosed tick, landing tick, shooter id, target id, [from x, y], [aim x, y], hit 0/1]
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

from .config import RESOURCE_KINDS, UNIT_KINDS
from .game import BUILD, HARVEST, Building, Resource, Unit

FORMAT = "eldertide-replay"
VERSION = 1
BUILDING_KINDS = ("castle", "house", "tower", "barracks", "archery")
ACTIONS = ("idle", "walk", "attack", "chop", "mine", "meat", "build")
_HARVEST_ACTION = {"tree": "chop", "mine": "mine", "sheep": "meat"}
COLORS = ("blue", "red")


def _r(v: float) -> float:
    return round(float(v), 2)


class ReplayRecorder:
    """Records one game of a DuelEnv: create it after env.reset(), call frame() after every
    env.step(), then save() when the game is over."""

    def __init__(self, env, names=("Blue", "Red")):
        self.env = env
        self.game = env.game
        self.ox, self.oy = env.map.origin
        self.game.record_events = True
        self.game.events.clear()
        cfg = self.game.cfg
        self.data = {
            "format": FORMAT,
            "version": VERSION,
            "map": str(Path(env.config.map_path).resolve().relative_to(Path(__file__).resolve().parents[2])).replace("\\", "/"),
            "origin": [self.ox, self.oy],
            "size": [self.game.width, self.game.height],
            "mirrored": bool(env.config.mirror_map),
            "tick_ms": 100,
            "players": [{"name": names[p], "color": COLORS[p]} for p in (0, 1)],
            "kinds": {"units": list(UNIT_KINDS), "buildings": list(BUILDING_KINDS),
                      "resources": list(RESOURCE_KINDS), "actions": list(ACTIONS)},
            "building_sizes": {k: list(cfg.buildings[k].size) for k in BUILDING_KINDS},
            "resources": [self._resource(r) for r in self.game.resource_nodes()],
            "winner": None,
            "ticks": None,
            "frames": [],
        }
        self._resources = {r.id for r in self.game.resource_nodes()}
        self._butchered = {r.id for r in self.game.resource_nodes("sheep") if r.butchered}
        self.frame()

    def _resource(self, r: Resource) -> list:
        return [r.id, RESOURCE_KINDS.index(r.kind), r.x + self.ox, r.y + self.oy]

    def _action(self, u: Unit) -> tuple:
        g = self.game
        if u.step_to is not None:
            return "walk", -1
        if u.attacking:
            return "attack", u.fighting if u.fighting is not None else -1
        if u.kind == "worker" and u.order in (HARVEST, BUILD):
            target = g.get(u.target)
            if target is not None and g.dist_to(u.x, u.y, target) < 1.5:
                if isinstance(target, Resource):
                    return _HARVEST_ACTION[target.kind], target.id
                if isinstance(target, Building):
                    return "build", target.id
        return "idle", -1

    def frame(self):
        g = self.game
        units = []
        for u in g.units():
            x, y = g.position(u)
            action, target = self._action(u)
            units.append([u.id, UNIT_KINDS.index(u.kind), u.owner, _r(x + self.ox), _r(y + self.oy),
                          _r(u.hp / u.max_hp), ACTIONS.index(action), target])
        buildings = [[b.id, BUILDING_KINDS.index(b.kind), b.owner, b.x + self.ox, b.y + self.oy,
                      _r(max(0.0, b.hp) / b.max_hp), _r(b.progress / b.build_points), len(b.queue)]
                     for b in g.buildings()]
        now = {r.id: r for r in g.resource_nodes()}
        added = [self._resource(now[i]) for i in now.keys() - self._resources]
        removed = sorted(self._resources - now.keys())
        butchered = sorted(i for i, r in now.items() if r.kind == "sheep" and r.butchered and i not in self._butchered)
        self._resources = set(now)
        self._butchered |= set(butchered)
        events = []
        for ev in g.events:
            if ev[0] == "hit":
                events.append(list(ev))
            else:
                _, loosed, lands, shooter, target, origin, aim, hit = ev
                events.append(["arrow", loosed, lands, shooter, target, [_r(origin[0] + self.ox), _r(origin[1] + self.oy)],
                               [_r(aim[0] + self.ox), _r(aim[1] + self.oy)], int(hit)])
        g.events.clear()
        self.data["frames"].append({
            "t": g.tick_count, "u": units, "b": buildings, "ra": added, "rr": removed, "rb": butchered,
            "res": [[g.resources[p]["wood"], g.resources[p]["meat"], g.resources[p]["gold"]] for p in (0, 1)],
            "pop": [list(g.population(p)) for p in (0, 1)],
            "ev": events,
        })

    def finish(self):
        self.data["winner"] = self.game.winner if self.game.done else -1
        self.data["ticks"] = self.game.tick_count
        self.game.record_events = False

    def save(self, path) -> Path:
        if self.data["winner"] is None:
            self.finish()
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(self.data, separators=(",", ":"))
        if path.suffix == ".gz":
            with gzip.open(path, "wt", encoding="utf-8") as f:
                f.write(text)
        else:
            path.write_text(text, encoding="utf-8")
        return path


def load_replay(path) -> dict:
    path = Path(path)
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as f:
        data = json.load(f)
    if data.get("format") != FORMAT:
        raise ValueError(f"{path} is not an Eldertide replay")
    return data
