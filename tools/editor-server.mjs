// A small local web server for playing the game and saving maps from the in-game editor.
//
//   node tools/editor-server.mjs            -> http://localhost:8080
//   node tools/editor-server.mjs 3000       -> another port
//
// It serves the project folder like any static server (with caching turned off, so edited maps and
// code always reload), plus a tiny API that only the map editor uses:
//   GET  /api/maps          list map.tmj and every maps/*.tmj
//   POST /api/maps/save     { path, content } write a map (only map.tmj or maps/<name>.tmj)
// Before a map is overwritten, the previous version is copied to maps/.backup/.
// No dependencies; it only listens on this computer (127.0.0.1).

import { createServer } from 'node:http';
import { readFile, writeFile, readdir, stat, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, normalize, extname, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 8080;
const MAPS_DIR = join(ROOT, 'maps');
const BACKUP_DIR = join(MAPS_DIR, '.backup');
const MAX_MAP_BYTES = 50 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.tmj': 'application/json; charset=utf-8',
  '.tsx': 'application/xml; charset=utf-8',
  '.tmx': 'application/xml; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.map': 'application/json; charset=utf-8',
};

/** Only the default map and files directly inside maps/ may be written. */
function mapFileFor(path) {
  if (path === 'map.tmj') return join(ROOT, 'map.tmj');
  const m = /^maps\/([A-Za-z0-9 _.-]+\.tmj)$/.exec(path);
  if (!m || m[1].startsWith('.')) return null;
  return join(MAPS_DIR, m[1]);
}

async function describe(file, path) {
  const s = await stat(file);
  return { path, name: basename(path, '.tmj'), size: s.size, modified: s.mtime.toISOString() };
}

async function listMaps() {
  const maps = [];
  if (existsSync(join(ROOT, 'map.tmj'))) maps.push({ ...(await describe(join(ROOT, 'map.tmj'), 'map.tmj')), isDefault: true });
  if (existsSync(MAPS_DIR)) {
    for (const name of (await readdir(MAPS_DIR)).sort()) {
      if (name.endsWith('.tmj') && !name.startsWith('.')) maps.push(await describe(join(MAPS_DIR, name), `maps/${name}`));
    }
  }
  return maps;
}

async function saveMap(body) {
  const { path, content } = JSON.parse(body);
  const file = mapFileFor(path);
  if (!file) throw Object.assign(new Error(`Not allowed to write "${path}"`), { status: 400 });
  JSON.parse(content); // refuse anything that is not valid JSON
  await mkdir(dirname(file), { recursive: true });
  if (existsSync(file)) {
    await mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await copyFile(file, join(BACKUP_DIR, `${basename(file, '.tmj')}-${stamp}.tmj`));
  }
  await writeFile(file, content);
  return describe(file, path);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_MAP_BYTES) { reject(Object.assign(new Error('Map too large'), { status: 413 })); req.destroy(); }
      else parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT + sep) && file !== ROOT) return send(res, 403, 'Forbidden', 'text/plain');
  try {
    const s = await stat(file);
    if (s.isDirectory()) return serveStatic(req, res, urlPath.replace(/\/?$/, '/'));
    send(res, 200, await readFile(file), TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/maps' && req.method === 'GET') return send(res, 200, await listMaps());
    if (url.pathname === '/api/maps/save' && req.method === 'POST') {
      const saved = await saveMap(await readBody(req));
      console.log(`saved ${saved.path} (${Math.round(saved.size / 1024)} KB)`);
      return send(res, 200, saved);
    }
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Unknown API' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e.message);
    send(res, e.status ?? 500, { error: e.message });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Game and map editor: http://localhost:${PORT}`);
  console.log('Maps are saved to map.tmj and maps/*.tmj (previous versions go to maps/.backup/).');
});
