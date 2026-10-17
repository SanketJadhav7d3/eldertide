"""Reads a game map (.tmj, as saved by the map editor or Tiled) into grids the simulator uses.

The map is normalised the way the browser game's mapLoader.js does it: an infinite map becomes a
fixed-size one whose top-left is the top-left of the area used by any tile layer, and objects are
moved by the same amount. One map tile (64 px) is one cell.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np

from .config import CELL_PX

LAYER_NAMES = {
    "land": "land-layer",
    "grass": "grass-layer",
    "player_grass": "player-grass-layer",
    "bridge": "bridge-layer",
}
OBJECT_LAYERS = {
    "collision": "collision-layer",
    "gold_mines": "gold-mine-layer",
    "enemy_spawns": "enemy-spawn-layer",
    "player_start": "player-start-layer",
}


@dataclass(frozen=True)
class MapData:
    width: int
    height: int
    walkable: np.ndarray  # [y, x] bool: land, grass or bridge
    buildable: np.ndarray  # [y, x] bool: land (buildings need a land tile) and not a collision area
    grass: np.ndarray  # [y, x] bool: where trees may grow
    player_grass: np.ndarray  # [y, x] bool: where sheep graze
    gold_mines: tuple  # ((x, y), ...)
    player_start: tuple | None  # (x, y)
    enemy_spawns: tuple
    origin: tuple = (0, 0)  # where this grid's cell (0, 0) is on the map file (non-zero after cropping)

    def to_file_cell(self, x: int, y: int) -> tuple:
        """A cell of this grid as a cell of the map file (and of the browser game's map)."""
        return (x + self.origin[0], y + self.origin[1])

    def in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height


def _tile_layer_box(layers):
    box = None
    for layer in layers:
        parts = []
        if layer.get("width") and layer.get("height"):
            parts.append((layer.get("startx", 0), layer.get("starty", 0), layer["width"], layer["height"]))
        for c in layer.get("chunks", []):
            parts.append((c["x"], c["y"], c["width"], c["height"]))
        for x, y, w, h in parts:
            if box is None:
                box = [x, y, x + w, y + h]
            else:
                box = [min(box[0], x), min(box[1], y), max(box[2], x + w), max(box[3], y + h)]
    return box


def _layer_mask(layer, origin, size):
    width, height = size
    mask = np.zeros((height, width), dtype=bool)
    if layer is None:
        return mask
    if "chunks" in layer:
        for c in layer["chunks"]:
            data = np.asarray(c["data"], dtype=np.int64).reshape(c["height"], c["width"])
            ys, xs = np.nonzero(data)
            mask[ys + c["y"] - origin[1], xs + c["x"] - origin[0]] = True
    elif "data" in layer:
        data = np.asarray(layer["data"], dtype=np.int64).reshape(layer["height"], layer["width"])
        mask[: data.shape[0], : data.shape[1]] = data[:height, :width] != 0
    return mask


def load_map(path: Path | str) -> MapData:
    tmj = json.loads(Path(path).read_text(encoding="utf-8"))
    if tmj.get("tilewidth") != CELL_PX or tmj.get("tileheight") != CELL_PX:
        raise ValueError(f"{path}: expected {CELL_PX}px tiles")
    tile_layers = [l for l in tmj["layers"] if l["type"] == "tilelayer"]
    by_name = {l["name"]: l for l in tmj["layers"]}

    if tmj.get("infinite"):
        box = _tile_layer_box(tile_layers) or [0, 0, tmj.get("width", 1), tmj.get("height", 1)]
        origin = (box[0], box[1])
        size = (box[2] - box[0], box[3] - box[1])
    else:
        origin = (0, 0)
        size = (tmj["width"], tmj["height"])

    masks = {key: _layer_mask(by_name.get(name), origin, size) for key, name in LAYER_NAMES.items()}
    walkable = masks["land"] | masks["grass"] | masks["bridge"]

    def objects(key):
        layer = by_name.get(OBJECT_LAYERS[key])
        return layer.get("objects", []) if layer and layer["type"] == "objectgroup" else []

    shift_x, shift_y = -origin[0] * CELL_PX, -origin[1] * CELL_PX

    def cell_of(obj):
        return (int((obj["x"] + shift_x) // CELL_PX), int((obj["y"] + shift_y) // CELL_PX))

    # Collision rectangles block every cell they cover at least half of.
    blocked = np.zeros_like(walkable)
    for rect in objects("collision"):
        if not rect.get("width") or not rect.get("height"):
            continue
        x0, y0 = rect["x"] + shift_x, rect["y"] + shift_y
        x1, y1 = x0 + rect["width"], y0 + rect["height"]
        for cy in range(max(0, int(y0 // CELL_PX)), min(size[1], int(y1 // CELL_PX) + 1)):
            for cx in range(max(0, int(x0 // CELL_PX)), min(size[0], int(x1 // CELL_PX) + 1)):
                overlap_w = min(x1, (cx + 1) * CELL_PX) - max(x0, cx * CELL_PX)
                overlap_h = min(y1, (cy + 1) * CELL_PX) - max(y0, cy * CELL_PX)
                if overlap_w > 0 and overlap_h > 0 and overlap_w * overlap_h >= CELL_PX * CELL_PX / 2:
                    blocked[cy, cx] = True
    walkable &= ~blocked

    in_map = lambda c: 0 <= c[0] < size[0] and 0 <= c[1] < size[1]
    mines = tuple(c for c in map(cell_of, objects("gold_mines")) if in_map(c) and walkable[c[1], c[0]])
    starts = [c for c in map(cell_of, objects("player_start")) if in_map(c)]
    spawns = tuple(c for c in map(cell_of, objects("enemy_spawns")) if in_map(c))

    return MapData(
        width=size[0],
        height=size[1],
        walkable=walkable,
        buildable=walkable & masks["land"],
        grass=walkable & (masks["grass"] | masks["player_grass"]),
        player_grass=walkable & masks["player_grass"],
        gold_mines=mines,
        player_start=starts[0] if starts else None,
        enemy_spawns=spawns,
    )


def crop_to_land(m: MapData, multiple: int = 8) -> MapData:
    """
    Cuts away the open sea around the land: the result is the land's bounding box, grown to a
    multiple of `multiple` cells each way (move targets are 8 x 8-cell regions) and centred on the
    land. A map that is mirror-symmetric left-right stays symmetric: its crop is centred on the
    mirror line. `origin` records the offset, so cells can be converted back with to_file_cell.
    """
    ys, xs = np.nonzero(m.walkable)
    if len(xs) == 0:
        raise ValueError("crop_to_land: the map has no land")

    def span(lo, hi, size):
        need = hi - lo + 1
        length = min(size, -(-need // multiple) * multiple)
        start = lo - (length - need) // 2
        return max(0, min(start, size - length)), length

    x0, w = span(int(xs.min()), int(xs.max()), m.width)
    y0, h = span(int(ys.min()), int(ys.max()), m.height)
    symmetric = all(np.array_equal(g, g[:, ::-1]) for g in (m.walkable, m.buildable, m.grass, m.player_grass))
    if symmetric and (m.width - w) % 2 == 0:
        x0 = (m.width - w) // 2  # the same number of columns cut from both sides
        if not (x0 <= xs.min() and xs.max() < x0 + w):
            raise AssertionError("a symmetric crop must contain the land")

    def inside(c):
        return x0 <= c[0] < x0 + w and y0 <= c[1] < y0 + h

    def shift(c):
        return (c[0] - x0, c[1] - y0)

    window = (slice(y0, y0 + h), slice(x0, x0 + w))
    return replace(
        m,
        width=w,
        height=h,
        walkable=m.walkable[window].copy(),
        buildable=m.buildable[window].copy(),
        grass=m.grass[window].copy(),
        player_grass=m.player_grass[window].copy(),
        gold_mines=tuple(shift(c) for c in m.gold_mines if inside(c)),
        player_start=shift(m.player_start) if m.player_start is not None and inside(m.player_start) else None,
        enemy_spawns=tuple(shift(c) for c in m.enemy_spawns if inside(c)),
        origin=(m.origin[0] + x0, m.origin[1] + y0),
    )


def mirror_x(x: int, width: int) -> int:
    return width - 1 - x


def mirror_west_half(m: MapData) -> MapData:
    """
    Copies the west half of the map onto the east half (mirrored left-right), so a duel between a
    player starting in the west and one starting at the mirrored spot is perfectly fair. Gold mines
    in the west half are kept and mirrored; those in the east half are dropped.
    """
    w = m.width
    half = (w + 1) // 2  # columns [0, half) are the source; with an odd width the middle stays

    def mirror(grid):
        out = grid.copy()
        for x in range(half, w):
            out[:, x] = grid[:, mirror_x(x, w)]
        return out

    west_mines = [c for c in m.gold_mines if c[0] < w // 2]
    middle_mines = [c for c in m.gold_mines if w % 2 == 1 and c[0] == w // 2]
    mines = tuple(sorted(set(west_mines + middle_mines + [(mirror_x(x, w), y) for x, y in west_mines])))
    if m.player_start is not None and m.player_start[0] >= w // 2:
        raise ValueError("mirror_west_half: the player start must be in the west half of the map")
    return replace(
        m,
        walkable=mirror(m.walkable),
        buildable=mirror(m.buildable),
        grass=mirror(m.grass),
        player_grass=mirror(m.player_grass),
        gold_mines=mines,
        enemy_spawns=(),
    )
