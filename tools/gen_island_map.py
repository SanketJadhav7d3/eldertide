"""Generates a square map with one island in an ocean (no bridges), in the same Tiled format as maps/*.tmj.

    python tools/gen_island_map.py                       # maps/island_64.tmj, 64x64 tiles
    python tools/gen_island_map.py --size 48 --seed 3 --out maps/island_48.tmj
    python tools/gen_island_map.py --preview preview.png # also renders the map with the real tile images

Layers follow the game's conventions (see mapConventions.js and mapLoader.js):
  water-layer         ocean everywhere
  water-foam          animated foam under every shoreline tile
  water-stones        a few animated rocks out in the water
  land-layer          sand: the whole island (walkable; buildings are placed on land tiles)
  player-grass-layer  grass on the player's (west) half: sheep and trees spawn here
  grass-layer         grass on the enemy's (east) half: trees and decorations spawn here
  deco-layer-1        a few rocks on the beach
  gold-mine-layer, player-start-layer, enemy-spawn-layer, collision-layer (empty)
"""

import argparse
import json
import math
import random
from collections import deque
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
TILE = 64
CHUNK = 16

# Global tile ids, from the tilesets shared by every map (copied from maps/map_new.tmj).
WATER = 1
FOAM = 127
WATER_ROCKS = [135, 143, 151, 159]  # 128px animated rocks
BEACH_ROCKS = [108, 109, 110, 111]
# 9-slice blocks of Tilemap_Flat.png, indexed [row][col]: row 0 = top edge, col 0 = left edge.
SAND = [[7, 8, 9], [17, 18, 19], [27, 28, 29]]
GRASS = [[2, 3, 4], [12, 13, 14], [22, 23, 24]]


def neighbors4(x, y):
    return [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]


def island_mask(size, seed):
    """A blob in the middle of the map whose radius wobbles with the angle."""
    rng = random.Random(seed)
    waves = [(rng.randint(2, 5), rng.uniform(0, 2 * math.pi), rng.uniform(0.04, 0.09)) for _ in range(4)]
    center = (size - 1) / 2
    base = size * 0.36
    mask = np.zeros((size, size), bool)
    for y in range(size):
        for x in range(size):
            dx, dy = x - center, y - center
            angle = math.atan2(dy, dx)
            r = base * (1 + sum(a * math.sin(k * angle + p) for k, p, a in waves))
            mask[y, x] = math.hypot(dx * 0.92, dy) < r  # a little wider than tall
    return mask


def keep_largest_region(mask):
    size_y, size_x = mask.shape
    seen = np.zeros_like(mask)
    best = []
    for sy in range(size_y):
        for sx in range(size_x):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            region, queue = [], deque([(sx, sy)])
            seen[sy, sx] = True
            while queue:
                x, y = queue.popleft()
                region.append((x, y))
                for nx, ny in neighbors4(x, y):
                    if 0 <= nx < size_x and 0 <= ny < size_y and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((nx, ny))
            if len(region) > len(best):
                best = region
    out = np.zeros_like(mask)
    for x, y in best:
        out[y, x] = True
    return out


def fill_holes(mask):
    """Water not connected to the map border (lakes) becomes land."""
    return ~keep_largest_region(~np.pad(mask, 1))[1:-1, 1:-1]


def smooth(mask, allow_fill=True):
    """
    Removes shapes the 9-slice tiles cannot draw: strips one tile thick (no tile has both a left and a
    right edge) and land touching only diagonally. Thin water inlets are filled instead when allowed.
    """
    mask = mask.copy()
    h, w = mask.shape
    at = lambda x, y: 0 <= x < w and 0 <= y < h and mask[y, x]
    changed = True
    while changed:
        changed = False
        for y in range(h):
            for x in range(w):
                if mask[y, x]:
                    if (not at(x - 1, y) and not at(x + 1, y)) or (not at(x, y - 1) and not at(x, y + 1)):
                        mask[y, x] = False
                        changed = True
                elif allow_fill:
                    if (at(x - 1, y) and at(x + 1, y)) or (at(x, y - 1) and at(x, y + 1)):
                        mask[y, x] = True
                        changed = True
                # Two cells touching only at a corner: join them.
                if mask[y, x] and at(x + 1, y + 1) and not at(x + 1, y) and not at(x, y + 1):
                    if allow_fill:
                        mask[y, x + 1] = True
                    else:
                        mask[y + 1, x + 1] = False
                    changed = True
                if mask[y, x] and at(x - 1, y + 1) and not at(x - 1, y) and not at(x, y + 1):
                    if allow_fill:
                        mask[y, x - 1] = True
                    else:
                        mask[y + 1, x - 1] = False
                    changed = True
    return mask


def erode(mask, radius):
    """Cells whose whole (2r+1)-square neighbourhood is in the mask."""
    h, w = mask.shape
    padded = np.pad(mask, radius)
    out = np.ones_like(mask)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            out &= padded[radius + dy:radius + dy + h, radius + dx:radius + dx + w]
    return out


def nine_slice(mask, block):
    """Picks the edge/corner/centre tile for every cell of a mask from its four neighbours."""
    h, w = mask.shape
    at = lambda x, y: 0 <= x < w and 0 <= y < h and mask[y, x]
    gids = np.zeros(mask.shape, int)
    for y in range(h):
        for x in range(w):
            if not mask[y, x]:
                continue
            row = 0 if not at(x, y - 1) else 2 if not at(x, y + 1) else 1
            col = 0 if not at(x - 1, y) else 2 if not at(x + 1, y) else 1
            gids[y, x] = block[row][col]
    return gids


def tile_layer(layer_id, name, gids):
    """An infinite-map tile layer made of 16x16 chunks (empty chunks are left out, as Tiled does)."""
    h, w = gids.shape
    chunks = []
    for cy in range(0, h, CHUNK):
        for cx in range(0, w, CHUNK):
            block = np.zeros((CHUNK, CHUNK), int)
            part = gids[cy:cy + CHUNK, cx:cx + CHUNK]
            block[:part.shape[0], :part.shape[1]] = part
            if block.any():
                chunks.append({"data": block.flatten().tolist(), "height": CHUNK, "width": CHUNK, "x": cx, "y": cy})
    xs = [c["x"] for c in chunks] or [0]
    ys = [c["y"] for c in chunks] or [0]
    return {
        "chunks": chunks,
        "height": max(ys) + CHUNK - min(ys), "width": max(xs) + CHUNK - min(xs),
        "id": layer_id, "name": name, "opacity": 1,
        "startx": min(xs), "starty": min(ys),
        "type": "tilelayer", "visible": True, "x": 0, "y": 0,
    }


def object_layer(layer_id, name, objects):
    return {"draworder": "topdown", "id": layer_id, "name": name, "objects": objects,
            "opacity": 1, "type": "objectgroup", "visible": True, "x": 0, "y": 0}


def nearest_cell(mask, target, taken=(), min_gap=0):
    """The cell of `mask` nearest to `target` that is at least `min_gap` cells from every cell in `taken`."""
    ys, xs = np.nonzero(mask)
    best = None
    for x, y in zip(xs.tolist(), ys.tolist()):
        if any(max(abs(x - tx), abs(y - ty)) < min_gap for tx, ty in taken):
            continue
        d = (x - target[0]) ** 2 + (y - target[1]) ** 2
        if best is None or d < best[0]:
            best = (d, (x, y))
    if best is None:
        raise SystemExit(f"No room on the island for an object near {target}")
    return best[1]


def build_map(size, seed):
    rng = random.Random(seed)

    land = island_mask(size, seed)
    land = smooth(fill_holes(keep_largest_region(land)))
    land = keep_largest_region(land)
    # Grass sits on the sand, leaving a beach two tiles wide.
    grass = keep_largest_region(smooth(erode(land, 2), allow_fill=False))

    water = np.full((size, size), WATER)
    sand = nine_slice(land, SAND)
    grass_gids = nine_slice(grass, GRASS)

    # Grass west of the middle belongs to the player, east of it to the enemy (one seamless field).
    mid = size // 2
    player_grass = grass_gids.copy()
    player_grass[:, mid:] = 0
    enemy_grass = grass_gids.copy()
    enemy_grass[:, :mid] = 0

    # Foam: a 192px tile is drawn with its bottom-left on its cell, so the foam centred on shore cell
    # (x, y) goes in cell (x - 1, y + 1).
    foam = np.zeros((size, size), int)
    shore = land & ~erode(land, 1)
    for y, x in zip(*np.nonzero(shore)):
        if 0 <= x - 1 and y + 1 < size:
            foam[y + 1, x - 1] = FOAM

    # Rocks in the water, clear of the foam: a 128px rock covers cells (x..x+1, y-1..y).
    near_land = ~erode(~land, 3)
    stones = np.zeros((size, size), int)
    placed = []
    for _ in range(400):
        if len(placed) >= max(4, size // 6):
            break
        x, y = rng.randrange(0, size - 1), rng.randrange(1, size)
        if near_land[y - 1:y + 1, x:x + 2].any() or any(abs(x - px) < 4 and abs(y - py) < 4 for px, py in placed):
            continue
        stones[y, x] = rng.choice(WATER_ROCKS)
        placed.append((x, y))

    # A few rocks on the beach (sand that has no grass on it).
    beach = erode(land, 1) & ~grass  # sand away from the shoreline tiles
    deco = np.zeros((size, size), int)
    cells = list(zip(*np.nonzero(beach)))
    rng.shuffle(cells)
    for y, x in cells[:max(3, size // 8)]:
        deco[y, x] = rng.choice(BEACH_ROCKS)

    # Objects (pixel positions at tile centres). Keep them well inside the grass so their sprites fit.
    inner = erode(grass, 2)
    ys, xs = np.nonzero(land)
    west, east = xs.min(), xs.max()
    cy = int(round(ys.mean()))
    span = east - west
    start = nearest_cell(inner, (west + span * 0.22, cy))
    spawns = [nearest_cell(inner & (np.arange(size) > mid + 4)[None, :], (east - span * 0.1, cy + dy))
              for dy in (-span // 6, 0, span // 6)]
    spawns = list(dict.fromkeys(spawns))
    mines = []
    for target in [(start[0] + 6, start[1] - 5), (start[0] + 6, start[1] + 5), (mid, cy - span // 4),
                   (mid + span // 6, cy + span // 4)]:
        mines.append(nearest_cell(inner, target, taken=mines + [start] + spawns, min_gap=4))

    next_id = 1

    def point(cell):
        nonlocal next_id
        obj = {"height": 0, "id": next_id, "name": "", "point": True, "rotation": 0, "type": "",
               "visible": True, "width": 0, "x": cell[0] * TILE + TILE / 2, "y": cell[1] * TILE + TILE / 2}
        next_id += 1
        return obj

    layers = [
        tile_layer(1, "water-layer", water),
        tile_layer(2, "water-foam", foam),
        tile_layer(3, "water-stones", stones),
        tile_layer(4, "land-layer", sand),
        tile_layer(5, "grass-layer", enemy_grass),
        tile_layer(6, "player-grass-layer", player_grass),
        tile_layer(7, "deco-layer-1", deco),
        object_layer(8, "gold-mine-layer", [point(c) for c in mines]),
        object_layer(9, "player-start-layer", [point(start)]),
        object_layer(10, "enemy-spawn-layer", [point(c) for c in spawns]),
        object_layer(11, "collision-layer", []),
    ]

    template = json.loads((ROOT / "maps" / "map_new.tmj").read_text())
    return {
        "compressionlevel": -1, "height": size, "infinite": True, "layers": layers,
        "nextlayerid": len(layers) + 1, "nextobjectid": next_id,
        "orientation": "orthogonal", "renderorder": "right-down",
        "tiledversion": template.get("tiledversion", "1.11.0"),
        "tileheight": TILE, "tilesets": template["tilesets"], "tilewidth": TILE,
        "type": "map", "version": template.get("version", "1.10"), "width": size,
    }


def render_preview(tmj, map_path, out_path, scale=0.25):
    """Draws the tile layers with the real tileset images (first animation frame), plus object markers."""
    from PIL import Image, ImageDraw

    size = tmj["width"]
    canvas = Image.new("RGBA", (size * TILE, size * TILE), (0, 0, 0, 255))
    sheets = []
    for ts in tmj["tilesets"]:
        img = Image.open((map_path.parent / ts["image"]).resolve()).convert("RGBA")
        sheets.append((ts["firstgid"], ts, img))

    def tile_image(gid):
        for first, ts, img in reversed(sheets):
            if gid >= first:
                i = gid - first
                tw, th = ts["tilewidth"], ts["tileheight"]
                col, row = i % ts["columns"], i // ts["columns"]
                return img.crop((col * tw, row * th, col * tw + tw, row * th + th))
        return None

    cache = {}
    for layer in tmj["layers"]:
        if layer["type"] != "tilelayer":
            continue
        for chunk in layer["chunks"]:
            for i, gid in enumerate(chunk["data"]):
                if not gid:
                    continue
                if gid not in cache:
                    cache[gid] = tile_image(gid)
                img = cache[gid]
                x = (chunk["x"] + i % CHUNK) * TILE
                y = (chunk["y"] + i // CHUNK + 1) * TILE - img.height  # bottom-left anchored, like Tiled
                canvas.alpha_composite(img, (x, y)) if x >= 0 and y >= 0 else canvas.paste(img, (x, y), img)

    draw = ImageDraw.Draw(canvas)
    colors = {"gold-mine-layer": (255, 210, 74), "player-start-layer": (74, 210, 255), "enemy-spawn-layer": (255, 79, 216)}
    for layer in tmj["layers"]:
        for obj in layer.get("objects", []):
            c = colors.get(layer["name"])
            if c:
                draw.ellipse((obj["x"] - 28, obj["y"] - 28, obj["x"] + 28, obj["y"] + 28), outline=c, width=10)
    canvas = canvas.resize((int(canvas.width * scale), int(canvas.height * scale)), Image.LANCZOS)
    canvas.save(out_path)


def register(map_path):
    """Adds the map to maps/index.json so the start screen lists it."""
    index_path = ROOT / "maps" / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {"maps": []}
    if map_path.parent.resolve() == index_path.parent.resolve() and map_path.name not in index["maps"]:
        index["maps"] = sorted(index["maps"] + [map_path.name])
        index_path.write_text(json.dumps(index, indent=2) + "\n", newline="\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--size", type=int, default=64, help="map width and height in 64px tiles")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--out", default="maps/island_64.tmj")
    parser.add_argument("--preview", help="also write a PNG preview here")
    args = parser.parse_args()

    out = (ROOT / args.out).resolve()
    tmj = build_map(args.size, args.seed)
    out.write_text(json.dumps(tmj, indent=1), newline="\n")
    register(out)
    print(f"Wrote {out}")
    if args.preview:
        render_preview(tmj, out, args.preview)
        print(f"Wrote {args.preview}")


if __name__ == "__main__":
    main()
