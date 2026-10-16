// Loads the map chosen on the start screen (map.tmj or any maps/*.tmj made with the map editor or Tiled)
// and turns its layers into game objects. Everything that depends on how a map is laid out lives here,
// so the rest of the game only sees named layers and plain world coordinates.

import { MAP_LAYERS } from './mapConventions.js';

export const DEFAULT_MAP = 'map.tmj';

// Tile layers the game's logic reads (walkable ground, build checks, sheep, trees). A map without one of
// them still loads; the layer is just created empty.
export const REQUIRED_TILE_LAYERS = ['water-layer', 'land-layer', 'grass-layer', 'player-grass-layer', 'bridge-layer'];

// Where the goblins march to when the map has no player start (32 px pathfinding cells).
export const DEFAULT_ENEMY_DESTINATION = { x: 22, y: 30 };

const STORAGE_KEY = 'eldertide.mapPath';

/** The map the player picked last time (or the default). */
export function rememberedMap() {
  try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_MAP; } catch { return DEFAULT_MAP; }
}

export function rememberMap(path) {
  try { localStorage.setItem(STORAGE_KEY, path); } catch { /* private mode: just not remembered */ }
}

/**
 * Every map that can be played: map.tmj plus the .tmj files in maps/. A web page cannot list a folder,
 * so this asks, in turn: the editor server (tools/editor-server.mjs), maps/index.json (written by the
 * map editor when it saves), and the server's folder listing (VS Code Live Server provides one).
 */
export async function listMaps() {
  const found = new Map([[DEFAULT_MAP, { path: DEFAULT_MAP, name: 'Default map' }]]);
  const add = file => {
    const name = decodeURIComponent(file.split('/').pop());
    if (!/^[^.][^/]*\.tmj$/i.test(name)) return;
    const path = `maps/${name}`;
    if (!found.has(path)) found.set(path, { path, name: name.replace(/\.tmj$/i, '') });
  };
  const get = async (url, type) => {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes(type)) return null;
      return type === 'json' ? await r.json() : await r.text();
    } catch {
      return null;
    }
  };

  const api = await get('api/maps', 'json');
  if (Array.isArray(api)) api.filter(m => m.path?.startsWith('maps/')).forEach(m => add(m.path));
  const index = await get('maps/index.json', 'json');
  if (Array.isArray(index?.maps)) index.maps.forEach(add);
  const listing = await get('maps/', 'html');
  if (listing) for (const m of listing.matchAll(/href="([^"?#]+\.tmj)"/gi)) add(m[1]);

  const maps = [...found.values()];
  return [maps[0], ...maps.slice(1).sort((a, b) => a.name.localeCompare(b.name))];
}

/** The texture key a tileset image is loaded under (its full URL, so different maps never clash). */
export function tilesetTextureKey(url) {
  return `map-tileset:${url}`;
}

/** The URL of a tileset image; Tiled stores image paths relative to the map file. */
export function tilesetImageUrl(mapPath, image) {
  return new URL(image, new URL(mapPath, document.baseURI)).href;
}

/**
 * Converts a Tiled map into the shape the game expects:
 *  - Infinite maps (what the editor and Tiled save) become fixed-size maps whose top-left corner is the
 *    top-left of the area used by any tile layer. Every layer gets that same origin, so layers whose
 *    painted areas differ still line up.
 *  - Objects are moved by the same amount, so they stay on the tiles they were placed on.
 * Returns a new object; `json` is not changed.
 */
export function normalizeTiledMap(json) {
  const map = structuredClone(json);
  const tw = map.tilewidth;
  const th = map.tileheight;
  const tileLayers = map.layers.filter(l => l.type === 'tilelayer');

  let originX = 0;
  let originY = 0;
  if (map.infinite) {
    // The area covered by all tile layers, from their stored extents (or their chunks).
    let box = null;
    for (const layer of tileLayers) {
      const parts = [];
      if (layer.width && layer.height) parts.push({ x: layer.startx ?? 0, y: layer.starty ?? 0, w: layer.width, h: layer.height });
      for (const c of layer.chunks ?? []) parts.push({ x: c.x, y: c.y, w: c.width, h: c.height });
      for (const p of parts) {
        if (!box) box = { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h };
        else {
          box.x0 = Math.min(box.x0, p.x);
          box.y0 = Math.min(box.y0, p.y);
          box.x1 = Math.max(box.x1, p.x + p.w);
          box.y1 = Math.max(box.y1, p.y + p.h);
        }
      }
    }
    box ??= { x0: 0, y0: 0, x1: map.width || 1, y1: map.height || 1 };
    originX = box.x0;
    originY = box.y0;
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;

    for (const layer of tileLayers) {
      const data = new Array(width * height).fill(0);
      for (const c of layer.chunks ?? []) {
        for (let i = 0; i < c.data.length; i++) {
          if (!c.data[i]) continue;
          const x = c.x + (i % c.width) - originX;
          const y = c.y + Math.floor(i / c.width) - originY;
          data[y * width + x] = c.data[i];
        }
      }
      delete layer.chunks;
      delete layer.startx;
      delete layer.starty;
      Object.assign(layer, { data, width, height, x: 0, y: 0 });
    }
    map.infinite = false;
    map.width = width;
    map.height = height;
  }

  const dx = -originX * tw;
  const dy = -originY * th;
  for (const layer of map.layers) {
    if (layer.type !== 'objectgroup') continue;
    for (const o of layer.objects ?? []) {
      o.x += dx;
      o.y += dy;
    }
  }
  return { json: map, originX, originY };
}

/**
 * Adds every tileset of the map, creates every tile layer in the map's own order (so the game looks like
 * the editor), and creates any required layer the map does not have as an empty layer.
 * Returns { tilesets, layers } where layers is keyed by layer name.
 */
export function createMapLayers(scene, map, mapPath) {
  const tilesets = [];
  for (const data of map.tilesets) {
    const image = scene.cache.tilemap.get('map')?.data.tilesets.find(t => t.name === data.name)?.image;
    if (!image) continue;
    const tileset = map.addTilesetImage(data.name, tilesetTextureKey(tilesetImageUrl(mapPath, image)));
    if (!tileset) continue;
    // Tiled draws a tile that is taller than the grid with its bottom on the cell's bottom (e.g. the
    // 192 px foam on the 64 px grid reaches 128 px up). Phaser draws from the cell's top, so shift it.
    tileset.tileOffset.set(0, tileset.tileHeight - map.tileHeight);
    tilesets.push(tileset);
  }

  const reach = Math.max(1, ...tilesets.map(t => Math.ceil(Math.max(t.tileWidth / map.tileWidth, t.tileHeight / map.tileHeight))));
  const layers = {};
  for (const data of map.layers) {
    const layer = map.createLayer(data.name, tilesets, 0, 0);
    if (!layer) continue;
    layer.setCullPadding(reach + 1, reach + 1); // big tiles near the screen edge must not be culled
    layers[data.name] = layer;
  }
  for (const name of REQUIRED_TILE_LAYERS) {
    if (!layers[name]) {
      console.warn(`Map has no "${name}" layer; using an empty one.`);
      layers[name] = map.createBlankLayer(name, tilesets, 0, 0);
    }
  }
  return { tilesets, layers };
}

/** The objects of one of the special object layers (see mapConventions.js), or []. */
export function objectsOf(map, kind) {
  return map.getObjectLayer(MAP_LAYERS[kind].name)?.objects ?? [];
}

/**
 * Draws the "sprite-layer" images (tile objects). They are sorted by their bottom edge like the other
 * scenery, so units walk in front of or behind them correctly.
 */
export function createSpriteObjects(scene, map, tilesets) {
  const images = [];
  for (const o of objectsOf(map, 'sprites')) {
    if (!o.gid || o.visible === false) continue;
    const tileset = tilesets.filter(t => t.firstgid <= o.gid).sort((a, b) => b.firstgid - a.firstgid)[0];
    if (!tileset?.image) continue;
    const index = o.gid - tileset.firstgid;
    const texture = tileset.image;
    const frame = `tile-${index}`;
    if (!texture.has(frame)) {
      const coords = tileset.getTileTextureCoordinates(o.gid);
      if (!coords) continue;
      texture.add(frame, 0, coords.x, coords.y, tileset.tileWidth, tileset.tileHeight);
    }
    const image = scene.add.image(o.x, o.y, texture.key, frame)
      .setOrigin(0, 1)
      .setDisplaySize(o.width, o.height)
      .setFlip(!!o.flippedHorizontal, !!o.flippedVertical)
      .setDepth(o.y);
    images.push(image);
  }
  return images;
}
