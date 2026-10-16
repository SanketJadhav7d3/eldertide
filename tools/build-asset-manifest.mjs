// Scans the art folder and writes editor/asset-manifest.json: every PNG with its size, a category
// taken from its folder, and a guess at how it is cut into tiles/frames.
//
// Run from the project root:   node tools/build-asset-manifest.mjs
//
// How the grid of each image is decided (first match wins):
//   1. tilesets already used by map.tmj   -> exact tile size / columns from the map ("map" source)
//   2. editor/asset-overrides.json        -> hand-written fixes keyed by path ("override" source)
//   3. a wide strip whose width is a whole multiple of its height -> square frames ("strip" guess)
//   4. anything else                      -> one single image ("image")
// Guesses can be wrong for odd sheets, so fix those in the overrides file and run the script again.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, relative, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART_DIR = join(ROOT, 'Tiny Swords');
const MAP_FILE = join(ROOT, 'map.tmj');
const OVERRIDES_FILE = join(ROOT, 'editor', 'asset-overrides.json');
const OUT_FILE = join(ROOT, 'editor', 'asset-manifest.json');

const SKIP_DIRS = new Set(['__MACOSX', 'gif_assets', 'audio']);

function toPosix(p) {
  return p.split('\\').join('/');
}

// The size of a PNG is stored in its IHDR header: bytes 16-19 width, 20-23 height (big endian).
function readPngSize(file) {
  const buf = readFileSync(file);
  const isPng = buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47;
  if (!isPng) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (extname(name).toLowerCase() === '.png') yield full;
  }
}

function loadJson(file, fallback) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
}

// Tilesets that map.tmj already uses, keyed by image path.
function loadMapTilesets() {
  const map = loadJson(MAP_FILE, null);
  const byImage = new Map();
  if (!map) return byImage;
  for (const ts of map.tilesets ?? []) {
    if (!ts.image) continue;
    byImage.set(toPosix(ts.image), {
      tileWidth: ts.tilewidth,
      tileHeight: ts.tileheight,
      columns: ts.columns,
      tileCount: ts.tilecount,
      mapTilesetName: ts.name,
    });
  }
  return byImage;
}

function gridFor(relPath, size, mapTilesets, overrides) {
  const fromMap = mapTilesets.get(relPath);
  if (fromMap) {
    return {
      kind: 'tileset',
      source: 'map',
      tileWidth: fromMap.tileWidth,
      tileHeight: fromMap.tileHeight,
      columns: fromMap.columns,
      rows: Math.ceil(fromMap.tileCount / fromMap.columns),
      tileCount: fromMap.tileCount,
      mapTilesetName: fromMap.mapTilesetName,
    };
  }

  const o = overrides[relPath];
  if (o) {
    const columns = Math.floor(size.width / o.tileWidth);
    const rows = Math.floor(size.height / o.tileHeight);
    return {
      kind: o.kind ?? 'sheet',
      source: 'override',
      tileWidth: o.tileWidth,
      tileHeight: o.tileHeight,
      columns,
      rows,
      tileCount: columns * rows,
    };
  }

  const isStrip = size.height > 0 && size.width > size.height && size.width % size.height === 0;
  if (isStrip) {
    const frames = size.width / size.height;
    return {
      kind: 'strip',
      source: 'guess',
      tileWidth: size.height,
      tileHeight: size.height,
      columns: frames,
      rows: 1,
      tileCount: frames,
    };
  }

  return {
    kind: 'image',
    source: 'single',
    tileWidth: size.width,
    tileHeight: size.height,
    columns: 1,
    rows: 1,
    tileCount: 1,
  };
}

const mapTilesets = loadMapTilesets();
const overrides = loadJson(OVERRIDES_FILE, {});
const assets = [];
const skipped = [];

for (const file of walk(ART_DIR)) {
  const relPath = toPosix(relative(ROOT, file));
  const size = readPngSize(file);
  if (!size) {
    skipped.push(relPath);
    continue;
  }
  const folders = toPosix(relative(ART_DIR, dirname(file))).split('/').filter(Boolean);
  // Drop the pack folder ("Tiny Swords (Update 010)") so categories read "Terrain/Ground", "Deco", ...
  const category = folders.filter(f => !f.startsWith('Tiny Swords')).join('/');
  assets.push({
    path: relPath,
    name: basename(file, extname(file)),
    category,
    width: size.width,
    height: size.height,
    ...gridFor(relPath, size, mapTilesets, overrides),
  });
}

assets.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, undefined, { numeric: true }));

// Anything map.tmj references that was not found on disk is worth knowing about.
const found = new Set(assets.map(a => a.path));
const missing = [...mapTilesets.keys()].filter(p => !found.has(p));

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify({ generated: new Date().toISOString(), count: assets.length, assets }, null, 2));

const byKind = {};
for (const a of assets) byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
const categories = new Set(assets.map(a => a.category));
console.log(`Wrote ${toPosix(relative(ROOT, OUT_FILE))}: ${assets.length} images in ${categories.size} categories`);
console.log('  by kind:', byKind);
console.log(`  tilesets taken from map.tmj: ${assets.filter(a => a.source === 'map').length} of ${mapTilesets.size}`);
if (missing.length) console.log('  WARNING - map.tmj tilesets whose image was not found:', missing);
if (skipped.length) console.log('  skipped (not valid PNGs):', skipped);
