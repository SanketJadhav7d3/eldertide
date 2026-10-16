// Checks that the editor's map model reads a .tmj file and writes it back identically.
//   node tools/roundtrip-test.mjs [path/to/map.tmj]      (default: map.tmj)
// "Identically" means the parsed JSON is deeply equal; formatting and key order do not matter.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MapDocument, diffJson } from '../editor/mapModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] ?? join(ROOT, 'map.tmj');
const original = JSON.parse(readFileSync(file, 'utf8'));

const saved = JSON.parse(JSON.stringify(MapDocument.fromJSON(original)));

const differences = diffJson(original, saved);

const tiles = original.layers.filter(l => l.type === 'tilelayer')
  .reduce((n, l) => n + (l.chunks ?? []).reduce((m, c) => m + c.data.filter(Boolean).length, 0), 0);
console.log(`${file}\n  ${original.layers.length} layers, ${tiles} painted tiles`);
if (differences.length) {
  console.log(`  ROUND TRIP FAILED (${differences.length}${differences.length > 25 ? '+' : ''} differences):`);
  differences.forEach(d => console.log('   ', d));
  process.exit(1);
}
console.log('  round trip OK: the saved map is identical to the original');
