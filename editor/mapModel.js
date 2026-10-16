// The editor's in-memory map. It reads and writes exactly the Tiled JSON (.tmj) format that the game
// loads with `this.load.tilemapTiledJSON`, so a map saved here loads in the game like any other.
//
// This file has no Phaser dependency, so it can also run in Node (see tools/roundtrip-test.mjs).
//
// Tile layers are stored the way Tiled stores infinite maps: sparse 16x16 "chunks" holding global
// tile ids (gids). A gid of 0 is an empty cell; the top bits are Tiled's flip/rotate flags.
// Anything the editor does not understand (map properties, tileset details, extra layer fields,
// object layers) is kept untouched and written back as it was.

export const CHUNK_SIZE = 16;

export const FLIP_H = 0x80000000;
export const FLIP_V = 0x40000000;
export const FLIP_D = 0x20000000;
const FLAG_MASK = FLIP_H | FLIP_V | FLIP_D | 0x10000000;

/** The tile id without Tiled's flip flags. */
export function plainGid(gid) {
  return (gid & ~FLAG_MASK) >>> 0;
}

const chunkKey = (cx, cy) => `${cx},${cy}`;

// Paths below are relative to the project root (the page's folder), e.g. "maps/island.tmj".
const ROOT_URL = 'http://project/';

/** Project-root path of `target`, which is written relative to the folder of `fromFile`. */
export function resolvePath(fromFile, target) {
  return decodeURIComponent(new URL(target, new URL(fromFile, ROOT_URL)).pathname.slice(1));
}

/** Path from the folder of `fromFile` to `toFile` (both relative to the project root), as Tiled writes it. */
export function relativePath(fromFile, toFile) {
  const from = new URL(fromFile, ROOT_URL).pathname.split('/').slice(1, -1);
  const to = new URL(toFile, ROOT_URL).pathname.split('/').slice(1);
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  return [...from.slice(i).map(() => '..'), ...to.slice(i)].map(decodeURIComponent).join('/');
}

function unionBounds(a, b) {
  if (!a || !b || !b.width) return a ?? b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

export class TileLayer {
  constructor(props) {
    // Every field of the original layer except the ones the editor recomputes on save.
    this.props = props;
    this.chunks = new Map(); // "cx,cy" -> { cx, cy, data: Uint32Array(256) }
    // Tiled keeps the area a layer has ever used, even after tiles are erased. Remember what the file
    // said so saving never shrinks it (and an unedited map is written back identically).
    this.extent = props.width !== undefined
      ? { x: props.startx ?? 0, y: props.starty ?? 0, width: props.width, height: props.height }
      : null;
  }

  get name() { return this.props.name; }
  get visible() { return this.props.visible !== false; }
  set visible(v) { this.props.visible = !!v; }

  getTile(x, y) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cy));
    if (!chunk) return 0;
    return chunk.data[(y - cy * CHUNK_SIZE) * CHUNK_SIZE + (x - cx * CHUNK_SIZE)];
  }

  /** Sets a cell, creating the chunk if needed. Returns true if the cell actually changed. */
  setTile(x, y, gid) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const key = chunkKey(cx, cy);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      if (gid === 0) return false;
      chunk = { cx, cy, data: new Uint32Array(CHUNK_SIZE * CHUNK_SIZE) };
      this.chunks.set(key, chunk);
    }
    const index = (y - cy * CHUNK_SIZE) * CHUNK_SIZE + (x - cx * CHUNK_SIZE);
    if (chunk.data[index] === gid) return false;
    chunk.data[index] = gid;
    return true;
  }

  /** Chunks that contain at least one tile. */
  nonEmptyChunks() {
    return [...this.chunks.values()].filter(c => c.data.some(g => g !== 0));
  }

  /** Bounding box of the used chunks in tiles, or null for an empty layer. */
  bounds() {
    const used = this.nonEmptyChunks();
    if (!used.length) return null;
    const minCx = Math.min(...used.map(c => c.cx));
    const minCy = Math.min(...used.map(c => c.cy));
    const maxCx = Math.max(...used.map(c => c.cx));
    const maxCy = Math.max(...used.map(c => c.cy));
    return {
      x: minCx * CHUNK_SIZE,
      y: minCy * CHUNK_SIZE,
      width: (maxCx - minCx + 1) * CHUNK_SIZE,
      height: (maxCy - minCy + 1) * CHUNK_SIZE,
    };
  }

  toJSON() {
    const out = { ...this.props };
    const used = this.nonEmptyChunks().sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    const box = unionBounds(this.bounds(), this.extent) ?? { x: 0, y: 0, width: 0, height: 0 };
    out.chunks = used.map(c => ({
      data: Array.from(c.data),
      height: CHUNK_SIZE,
      width: CHUNK_SIZE,
      x: c.cx * CHUNK_SIZE,
      y: c.cy * CHUNK_SIZE,
    }));
    out.startx = box.x;
    out.starty = box.y;
    out.width = box.width;
    out.height = box.height;
    return out;
  }
}

/** Object layers and anything else are carried through unchanged. */
export class PassthroughLayer {
  constructor(props) { this.props = props; }
  get name() { return this.props.name; }
  get type() { return this.props.type; }
  get visible() { return this.props.visible !== false; }
  set visible(v) { this.props.visible = !!v; }
  toJSON() { return this.props; }
}

/** A Tiled object group. The objects are the plain Tiled objects, edited in place. */
export class ObjectLayer extends PassthroughLayer {
  constructor(props) {
    super(props);
    if (!Array.isArray(props.objects)) props.objects = [];
  }

  get objects() { return this.props.objects; }

  /** What kind of object this is: 'tile' (has a gid), 'point', 'ellipse', 'polygon' or 'rect'. */
  static shapeOf(obj) {
    if (obj.gid) return 'tile';
    if (obj.point) return 'point';
    if (obj.ellipse) return 'ellipse';
    if (obj.polygon || obj.polyline) return 'polygon';
    return 'rect';
  }
}

export class MapDocument {
  constructor(meta, tilesets, layers) {
    this.meta = meta;       // top-level map fields other than layers/tilesets (size, tile size, ids, ...)
    this.tilesets = tilesets; // kept exactly as in the file
    this.layers = layers;
  }

  static fromJSON(json) {
    const { layers: rawLayers = [], tilesets = [], ...meta } = structuredClone(json);
    if (!meta.infinite) {
      // Fixed-size maps store one flat `data` array. Convert to chunks so editing works the same way.
      // They will be saved as infinite maps, which the game's loader also understands.
      meta.infinite = true;
    }
    const layers = rawLayers.map(raw => {
      if (raw.type === 'objectgroup') return new ObjectLayer(raw);
      if (raw.type !== 'tilelayer') return new PassthroughLayer(raw);
      const { chunks = [], data, ...props } = raw;
      const layer = new TileLayer(props);
      if (data) layer.loadFlatData(data, raw);
      for (const c of chunks) layer.loadChunk(c);
      return layer;
    });
    return new MapDocument(meta, tilesets, layers);
  }

  tileLayers() { return this.layers.filter(l => l instanceof TileLayer); }
  getLayer(name) { return this.layers.find(l => l.name === name); }

  /** Finds the tileset a gid belongs to (the one with the highest firstgid not above it). */
  tilesetForGid(gid) {
    const id = plainGid(gid);
    if (!id) return null;
    let found = null;
    for (const ts of this.tilesets) {
      if (ts.firstgid <= id && (!found || ts.firstgid > found.firstgid)) found = ts;
    }
    return found;
  }

  toJSON() {
    return {
      ...this.meta,
      layers: this.layers.map(l => l.toJSON()),
      tilesets: this.tilesets,
    };
  }

  // ---- editing ---------------------------------------------------------------------------------

  /** The first gid free for a new tileset (just past the last tile of every existing tileset). */
  nextFirstGid() {
    return this.tilesets.reduce((max, ts) => Math.max(max, ts.firstgid + (ts.tilecount ?? 1)), 1);
  }

  /** Finds a tileset already using this image (path as written in the map file). */
  tilesetForImage(image) {
    return this.tilesets.find(ts => ts.image === image) ?? null;
  }

  /**
   * Adds an image as a tileset, the same way Tiled writes an embedded tileset.
   * @param {object} spec  name, image (path relative to the map file), imageWidth, imageHeight, tileWidth, tileHeight
   */
  addTileset(spec) {
    const existing = this.tilesetForImage(spec.image);
    if (existing) return existing;
    const columns = Math.max(1, Math.floor(spec.imageWidth / spec.tileWidth));
    const rows = Math.max(1, Math.floor(spec.imageHeight / spec.tileHeight));
    const tileset = {
      columns,
      firstgid: this.nextFirstGid(),
      image: spec.image,
      imageheight: spec.imageHeight,
      imagewidth: spec.imageWidth,
      margin: 0,
      name: this.uniqueName(spec.name, this.tilesets.map(t => t.name)),
      spacing: 0,
      tilecount: columns * rows,
      tileheight: spec.tileHeight,
      tilewidth: spec.tileWidth,
    };
    this.tilesets.push(tileset);
    return tileset;
  }

  uniqueName(base, taken) {
    if (!taken.includes(base)) return base;
    let i = 2;
    while (taken.includes(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  /** Creates an empty tile layer and inserts it at `index` (end of the list = drawn on top). */
  addTileLayer(name, index = this.layers.length) {
    const id = this.meta.nextlayerid ?? this.layers.length + 1;
    this.meta.nextlayerid = id + 1;
    const layer = new TileLayer({
      id,
      name: this.uniqueName(name, this.layers.map(l => l.name)),
      opacity: 1,
      type: 'tilelayer',
      visible: true,
      x: 0,
      y: 0,
    });
    this.layers.splice(index, 0, layer);
    return layer;
  }

  /** Creates an empty object layer and inserts it at `index` (end of the list = drawn on top). */
  addObjectLayer(name, index = this.layers.length) {
    const id = this.meta.nextlayerid ?? this.layers.length + 1;
    this.meta.nextlayerid = id + 1;
    const layer = new ObjectLayer({
      draworder: 'topdown',
      id,
      name: this.uniqueName(name, this.layers.map(l => l.name)),
      objects: [],
      opacity: 1,
      type: 'objectgroup',
      visible: true,
      x: 0,
      y: 0,
    });
    this.layers.splice(index, 0, layer);
    return layer;
  }

  objectLayers() { return this.layers.filter(l => l instanceof ObjectLayer); }

  /** Hands out the next object id, as Tiled does (ids are never reused). */
  takeObjectId() {
    const used = this.objectLayers().flatMap(l => l.objects.map(o => o.id ?? 0));
    const id = Math.max(this.meta.nextobjectid ?? 1, ...used.map(n => n + 1));
    this.meta.nextobjectid = id + 1;
    return id;
  }

  insertLayer(layer, index) { this.layers.splice(index, 0, layer); }

  /** Removes a layer and returns the index it was at (for undo). */
  removeLayer(layer) {
    const index = this.layers.indexOf(layer);
    if (index >= 0) this.layers.splice(index, 1);
    return index;
  }

  /** Moves a layer up (+1 = drawn later, i.e. on top) or down. Returns false at either end. */
  moveLayer(layer, delta) {
    const from = this.layers.indexOf(layer);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= this.layers.length) return false;
    this.layers.splice(from, 1);
    this.layers.splice(to, 0, layer);
    return true;
  }

  /**
   * Rewrites the tileset image paths for a map file that moves from `fromFile` to `toFile`
   * (Tiled stores image paths relative to the map file).
   */
  rebaseImages(fromFile, toFile) {
    for (const ts of this.tilesets) {
      if (!ts.image) continue;
      ts.image = relativePath(toFile, resolvePath(fromFile, ts.image));
    }
  }

  /**
   * A new, empty map with the same layers (names, order, ids) and tilesets as this one, so it has
   * everything the game expects to find. Nothing is painted and object layers are empty.
   */
  emptyCopy() {
    const json = structuredClone(this.toJSON());
    for (const layer of json.layers) {
      if (layer.type === 'tilelayer') {
        layer.chunks = [];
        layer.startx = 0;
        layer.starty = 0;
        layer.width = 0;
        layer.height = 0;
      } else if (layer.type === 'objectgroup') {
        layer.objects = [];
      }
    }
    json.nextobjectid = 1;
    return MapDocument.fromJSON(json);
  }

  renameLayer(layer, name) {
    const taken = this.layers.filter(l => l !== layer).map(l => l.name);
    layer.props.name = this.uniqueName(name.trim() || 'layer', taken);
    return layer.props.name;
  }
}

TileLayer.prototype.loadChunk = function loadChunk(c) {
  const chunk = { cx: Math.floor(c.x / CHUNK_SIZE), cy: Math.floor(c.y / CHUNK_SIZE), data: new Uint32Array(CHUNK_SIZE * CHUNK_SIZE) };
  if (c.width !== CHUNK_SIZE || c.height !== CHUNK_SIZE) {
    // Tiled always writes 16x16 chunks; anything else is copied cell by cell.
    for (let i = 0; i < c.data.length; i++) this.setTile(c.x + (i % c.width), c.y + Math.floor(i / c.width), c.data[i]);
    return;
  }
  chunk.data.set(c.data);
  this.chunks.set(chunkKey(chunk.cx, chunk.cy), chunk);
};

TileLayer.prototype.loadFlatData = function loadFlatData(data, raw) {
  const width = raw.width;
  const ox = raw.x ?? 0;
  const oy = raw.y ?? 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i]) this.setTile(ox + (i % width), oy + Math.floor(i / width), data[i]);
  }
};

/**
 * Lists where two parsed JSON values differ (key order and formatting are ignored).
 * Used to prove that opening and saving a map does not change it.
 */
export function diffJson(a, b, path = '$', out = [], limit = 25) {
  if (out.length > limit || a === b) return out;
  const isObj = v => typeof v === 'object' && v !== null;
  if (!isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) {
    out.push(`${path}: ${JSON.stringify(a)?.slice(0, 60)} != ${JSON.stringify(b)?.slice(0, 60)}`);
    return out;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(k in a)) out.push(`${path}.${k}: only in the saved map`);
    else if (!(k in b)) out.push(`${path}.${k}: missing from the saved map`);
    else diffJson(a[k], b[k], `${path}.${k}`, out, limit);
  }
  return out;
}
