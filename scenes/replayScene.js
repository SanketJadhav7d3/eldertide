// Plays back a replay saved by the RL simulator (rl/eldertide_rl/replay.py): start screen -> "Watch replay".
//
// A replay is a list of snapshots (every unit and building, every 0.5 s of game time) plus the hits and
// arrows in between, so everything drawn here is worked out from the playback time alone: scrubbing,
// pausing and changing speed just draw a different moment. Nothing can be ordered; the mouse and keys
// only move the camera.
//
// Player 0 is drawn in blue and player 1 in red, with the game's own art.

import { createMapLayers, createSpriteObjects, normalizeTiledMap } from '../mapLoader.js';

const ART = './Tiny Swords/Tiny Swords (Update 010)/';
const TILE = 64;
const FORMAT = 'eldertide-replay';
const COLORS = ['blue', 'red'];
const TEAM_HEX = ['#3d8fd6', '#d6493d'];
const TEAM_BAR = [0x4fa3ff, 0xff5a4f];
const SPEEDS = [0.5, 1, 2, 4, 8];
const ARROW_SPEED = 350; // px/s, as entities/projectile.js
const ARROW_GRAVITY = 600; // px/s^2
const MISSED_ARROW_TICKS = 15; // a missed arrow stays stuck in the ground this long
const HIT_FLASH_TICKS = 1.5;
const CORPSE_TICKS = 30;

/** Reads a replay file (plain or gzip-compressed JSON) picked by the player. Throws with a readable message. */
export async function readReplayFile(file) {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  let stream = file.stream();
  if (head[0] === 0x1f && head[1] === 0x8b) stream = stream.pipeThrough(new DecompressionStream('gzip'));
  let data;
  try {
    data = JSON.parse(await new Response(stream).text());
  } catch {
    throw new Error(`"${file.name}" is not a replay file.`);
  }
  if (data?.format !== FORMAT) throw new Error(`"${file.name}" is not an Eldertide replay.`);
  if (data.version > 1) throw new Error(`"${file.name}" was saved by a newer version (replay version ${data.version}).`);
  if (!data.frames?.length) throw new Error(`"${file.name}" has no frames.`);
  return data;
}

// --- Art ----------------------------------------------------------------------------------------------

// Unit sheets per colour (192 px frames) and the frames of each animation in them.
const UNIT_SHEETS = {
  worker: { blue: 'Factions/Player/Pawn/Blue/Pawn_Blue.png', red: 'Factions/Player/Pawn/Red/Pawn_Red.png' },
  warrior: { blue: 'Factions/Player/Warrior/Blue/Warrior_Blue.png', red: 'Factions/Player/Warrior/Red/Warrior_Red.png' },
  archer: { blue: 'Factions/Player/Archer/Blue/Archer_Blue.png', red: 'Factions/Player/Archer/Red/Archer_Red.png' },
};
const UNIT_FRAMES = {
  worker: { idle: [0, 5], run: [6, 11], hammer: [12, 17], cut: [18, 23] },
  warrior: { idle: [0, 5], run: [6, 11], right: [12, 23], down: [24, 35], up: [36, 47] },
  archer: { idle: [0, 5], run: [8, 13], up: [16, 23], 'up-right': [24, 31], right: [32, 39], 'down-right': [40, 47], down: [48, 55] },
};
// The lancer has one 320 px sheet per animation.
const LANCER_SHEETS = {
  idle: 'Lancer_Idle.png', run: 'Lancer_Run.png', right: 'Lancer_Right_Attack.png', 'up-right': 'Lancer_UpRight_Attack.png',
  'down-right': 'Lancer_DownRight_Attack.png', down: 'Lancer_Down_Attack.png', up: 'Lancer_Up_Attack.png',
};
const LANCER_DIR = { blue: 'Factions/Player/Blue Units/Lancer/', red: 'Factions/Player/Red Units/Lancer/' };

// Buildings: the finished art per colour, the construction site and the rubble, the scale the game draws
// them at (entities/structureEntity.js FOOTPRINT.scale) and the bottom of each image's visible pixels,
// which is set on the bottom edge of the building's footprint.
const BUILDINGS = {
  castle: { blue: 'Factions/Player/Buildings/Castle/Castle_Blue.png', red: 'Factions/Player/Buildings/Castle/Castle_Red.png',
    construct: 'Factions/Player/Buildings/Castle/Castle_Construction.png', destroyed: 'Factions/Player/Buildings/Castle/Castle_Destroyed.png',
    scale: 0.8, h: 256, bottom: { built: 250, construct: 247, destroyed: 254 } },
  house: { blue: 'Factions/Player/Buildings/House/House_Blue.png', red: 'Factions/Player/Buildings/House/House_Red.png',
    construct: 'Factions/Player/Buildings/House/House_Construction.png', destroyed: 'Factions/Player/Buildings/House/House_Destroyed.png',
    scale: 0.8, h: 192, bottom: { built: 172, construct: 184, destroyed: 166 } },
  tower: { blue: 'Factions/Player/Buildings/Tower/Tower_Blue.png', red: 'Factions/Player/Buildings/Tower/Tower_Red.png',
    construct: 'Factions/Player/Buildings/Tower/Tower_Construction.png', destroyed: 'Factions/Player/Buildings/Tower/Tower_Destroyed.png',
    scale: 0.8, h: 256, bottom: { built: 235, construct: 232, destroyed: 230 } },
  barracks: { blue: 'Buildings/Blue Buildings/Barracks.png', red: 'Buildings/Red Buildings/Barracks.png',
    construct: 'Buildings/Constructed/barracks-constructed.png', destroyed: 'Buildings/Destroyed/barracks_destroyed.png',
    scale: 1, h: 256, bottom: { built: 245, construct: 244, destroyed: 239 } },
  archery: { blue: 'Buildings/Blue Buildings/Archery.png', red: 'Buildings/Red Buildings/Archery.png',
    construct: 'Buildings/Constructed/archery-construction.png', destroyed: 'Buildings/Destroyed/archery_destroyed.png',
    scale: 1.2, h: 256, bottom: { built: 240, construct: 239, destroyed: 239 } },
};

// Trees get one of the game's five tree kinds (picked from the tree's id, so it never changes).
const TREES = [
  { file: 'Resources/Trees/Tree.png', w: 192, h: 192, frames: 4 },
  { file: 'Deco-Trees/Tree1.png', w: 192, h: 256, frames: 8 },
  { file: 'Deco-Trees/Tree2.png', w: 192, h: 256, frames: 8 },
  { file: 'Deco-Trees/Tree3.png', w: 192, h: 192, frames: 8 },
  { file: 'Deco-Trees/Tree4.png', w: 192, h: 192, frames: 8 },
];

const key = (...parts) => `rp-${parts.join('-')}`;

/** 8-way direction from (dx, dy) in screen space: [animation direction, mirrored]. */
function direction8(dx, dy) {
  const a = (Phaser.Math.RadToDeg(Math.atan2(dy, dx)) + 360) % 360;
  if (a > 337.5 || a <= 22.5) return ['right', false];
  if (a <= 67.5) return ['down-right', false];
  if (a <= 112.5) return ['down', false];
  if (a <= 157.5) return ['down-right', true];
  if (a <= 202.5) return ['right', true];
  if (a <= 247.5) return ['up-right', true];
  if (a <= 292.5) return ['up', false];
  return ['up-right', false];
}

/** The last index i with values[i] <= x (0 if none). */
function floorIndex(values, x) {
  let lo = 0;
  let hi = values.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (values[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Copies the west half of every tile layer onto the east half, mirrored, as the simulator does
 * (rl/eldertide_rl/mapdata.py mirror_west_half). Tiles are flipped with Tiled's horizontal-flip bit. */
function mirrorWestHalf(json) {
  const w = json.width;
  const half = Math.ceil(w / 2);
  const FLIP_H = 0x80000000;
  const tilesets = [...json.tilesets].sort((a, b) => b.firstgid - a.firstgid);
  // Tiles wider than a cell (foam, water rocks) are drawn from their cell rightwards, so the mirror
  // image of one n cells wide starts n - 1 cells further left.
  const cellsWide = gid => {
    const id = (gid & 0x1fffffff) >>> 0;
    const tileset = tilesets.find(t => t.firstgid <= id);
    return Math.max(1, Math.round((tileset?.tilewidth ?? json.tilewidth) / json.tilewidth));
  };
  for (const layer of json.layers) {
    if (layer.type === 'tilelayer' && Array.isArray(layer.data)) {
      for (let y = 0; y < layer.height; y++) {
        const row = y * w;
        for (let x = half; x < w; x++) layer.data[row + x] = 0;
        for (let x = 0; x < half; x++) {
          const gid = layer.data[row + x];
          if (!gid) continue;
          const to = w - x - cellsWide(gid);
          if (to >= half && to < w) layer.data[row + to] = (gid ^ FLIP_H) >>> 0;
        }
      }
    } else if (layer.type === 'objectgroup' && layer.objects) {
      // Tile objects (the "sprite-layer" scenery): keep the west ones and add their mirror images.
      const west = layer.objects.filter(o => o.x + (o.width ?? 0) / 2 < half * json.tilewidth);
      const mirrored = west.filter(o => o.gid).map((o, i) => ({
        ...o, id: 1_000_000 + i, x: w * json.tilewidth - o.x - (o.width ?? 0), gid: (o.gid ^ FLIP_H) >>> 0,
      }));
      layer.objects = [...west, ...mirrored];
    }
  }
}

export default class ReplayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ReplayScene' });
  }

  preload() {
    const sheet = (k, file, w, h) => {
      if (!this.textures.exists(k)) this.load.spritesheet(k, ART + file, { frameWidth: w, frameHeight: h ?? w });
    };
    const image = (k, file) => {
      if (!this.textures.exists(k)) this.load.image(k, ART + file);
    };
    for (const color of COLORS) {
      for (const [kind, files] of Object.entries(UNIT_SHEETS)) sheet(key(kind, color), files[color], 192);
      for (const [anim, file] of Object.entries(LANCER_SHEETS)) sheet(key('lancer', anim, color), LANCER_DIR[color] + file, 320);
      for (const [kind, b] of Object.entries(BUILDINGS)) image(key(kind, color), b[color]);
    }
    for (const [kind, b] of Object.entries(BUILDINGS)) {
      image(key(kind, 'construct'), b.construct);
      image(key(kind, 'destroyed'), b.destroyed);
    }
    TREES.forEach((t, i) => sheet(key('tree', i), t.file, t.w, t.h));
    image(key('mine'), 'Resources/Gold Mine/GoldMine_Active.png');
    sheet(key('sheep'), 'Resources/Sheep/HappySheep_All.png', 128);
    sheet(key('meat'), 'Resources/Resources/M_Spawn.png', 128);
    sheet(key('dead'), 'Factions/Player/Dead/Dead.png', 128);
    sheet(key('arrow'), 'Factions/Player/Archer/Arrow/Arrow.png', 64);
  }

  create() {
    this.replay = this.registry.get('replay');
    this.createAnimations();
    this.prepare(this.replay);
    this.createMap();
    this.layer = {
      units: new Map(), buildings: new Map(), resources: new Map(), rubble: new Map(), arrows: [], corpses: [],
    };
    this.bars = this.add.graphics().setDepth(1e7);
    this.time_ = 0; // playback time, in ticks
    this.speed = 1;
    this.playing = true;
    this.createCamera();
    this.createHud();
    this.events.once('shutdown', () => this.hud?.remove());
    this.render(0);
  }

  createAnimations() {
    const anim = (k, texture, start, end, frameRate = 10, repeat = -1) => {
      if (this.anims.exists(k)) return;
      const frames = end === undefined
        ? this.anims.generateFrameNumbers(texture)
        : this.anims.generateFrameNumbers(texture, { start, end });
      this.anims.create({ key: k, frames, frameRate, repeat });
    };
    for (const color of COLORS) {
      for (const [kind, frames] of Object.entries(UNIT_FRAMES)) {
        for (const [name, [start, end]] of Object.entries(frames)) anim(key(kind, name, color), key(kind, color), start, end);
      }
      for (const name of Object.keys(LANCER_SHEETS)) anim(key('lancer', name, color), key('lancer', name, color));
    }
    TREES.forEach((t, i) => anim(key('tree', i), key('tree', i), 0, t.frames - 1, 5));
    anim(key('sheep'), key('sheep'), 0, 7);
  }

  /** Turns the snapshots into lookups for drawing any moment. */
  prepare(data) {
    const frames = data.frames;
    this.times = frames.map(f => f.t);
    this.end = data.ticks ?? this.times[this.times.length - 1];
    this.unitRows = frames.map(f => new Map(f.u.map(r => [r[0], r])));
    this.buildingRows = frames.map(f => new Map(f.b.map(r => [r[0], r])));

    // Deaths and destroyed buildings: anything that is in one snapshot and gone from the next.
    this.deaths = [];
    this.destroyed = [];
    for (let k = 0; k + 1 < frames.length; k++) {
      for (const [id, r] of this.unitRows[k]) {
        if (!this.unitRows[k + 1].has(id)) this.deaths.push({ id, x: r[3], y: r[4], t: frames[k + 1].t });
      }
      for (const [id, r] of this.buildingRows[k]) {
        if (!this.buildingRows[k + 1].has(id)) this.destroyed.push({ id, kind: r[1], x: r[3], y: r[4], t: frames[k + 1].t });
      }
    }

    // Resources: when each one appeared, went, and (sheep) was butchered.
    this.resources = [];
    const current = new Map();
    const add = (r, from) => {
      const entry = { id: r[0], kind: data.kinds.resources[r[1]], x: r[2], y: r[3], from, to: Infinity, butchered: Infinity };
      this.resources.push(entry);
      current.set(entry.id, entry);
    };
    data.resources.forEach(r => add(r, -Infinity));
    for (const f of frames) {
      f.ra.forEach(r => add(r, f.t));
      for (const id of f.rr) if (current.has(id)) current.get(id).to = f.t;
      for (const id of f.rb) if (current.has(id)) current.get(id).butchered = f.t;
    }

    // Hits (for the red flash) and arrows.
    this.hits = new Map();
    this.arrows = [];
    const hit = (id, t) => {
      if (!this.hits.has(id)) this.hits.set(id, []);
      this.hits.get(id).push(t);
    };
    for (const f of frames) {
      for (const ev of f.ev) {
        if (ev[0] === 'hit') hit(ev[3], ev[1]);
        else if (ev[0] === 'arrow') {
          const [, loosed, lands, , target, from, aim, wasHit] = ev;
          this.arrows.push({ loosed, lands, from, aim, hit: !!wasHit });
          if (wasHit) hit(target, lands);
        }
      }
    }
    for (const list of this.hits.values()) list.sort((a, b) => a - b);
    this.arrows.sort((a, b) => a.loosed - b.loosed);
    this.arrowStarts = this.arrows.map(a => a.loosed);
  }

  createMap() {
    const data = this.replay;
    const source = this.cache.json.get('map-source');
    const { json, originX, originY } = normalizeTiledMap(source);
    if (data.mirrored) mirrorWestHalf(json);
    // Replay positions are in the map file's tiles; the normalised map starts at (originX, originY).
    this.shift = { x: originX, y: originY };
    this.cache.tilemap.remove('replay-map');
    this.cache.tilemap.add('replay-map', { format: Phaser.Tilemaps.Formats.TILED_JSON, data: json });
    const map = this.make.tilemap({ key: 'replay-map' });
    const { tilesets } = createMapLayers(this, map, this.registry.get('mapPath'));
    createSpriteObjects(this, map, tilesets);
    this.animatedTiles.init(map);
    this.animatedTiles.setRate(0.6);
    this.map = map;
    this.wrongMap = this.registry.get('mapPath') !== data.map;
  }

  /** World pixel of the centre of map-file tile (x, y). */
  px(x) {
    return (x - this.shift.x) * TILE + TILE / 2;
  }

  py(y) {
    return (y - this.shift.y) * TILE + TILE / 2;
  }

  // --- Camera -----------------------------------------------------------------------------------------

  createCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    cam.setBackgroundColor('#47aba9');
    const [gx, gy] = this.replay.origin;
    const [gw, gh] = this.replay.size ?? [this.map.width, this.map.height];
    this.fitZoom = Phaser.Math.Clamp(Math.min(cam.width / (gw * TILE), cam.height / (gh * TILE)), 0.2, 1);
    cam.setZoom(this.fitZoom);
    cam.centerOn((gx - this.shift.x + gw / 2) * TILE, (gy - this.shift.y + gh / 2) * TILE);

    this.input.on('pointermove', p => {
      if (!p.isDown) return;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on('wheel', (p, objects, dx, dy) => {
      const before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.15, 2));
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.input.keyboard.on('keydown-SPACE', () => this.setPlaying(!this.playing));
    this.input.keyboard.on('keydown-PLUS', () => this.stepSpeed(1));
    this.input.keyboard.on('keydown-NUMPAD_ADD', () => this.stepSpeed(1));
    this.input.keyboard.on('keydown-MINUS', () => this.stepSpeed(-1));
    this.input.keyboard.on('keydown-NUMPAD_SUBTRACT', () => this.stepSpeed(-1));
    this.input.keyboard.on('keydown-PERIOD', () => this.seek(this.time_ + 5));
    this.input.keyboard.on('keydown-COMMA', () => this.seek(this.time_ - 5));
    this.input.keyboard.on('keydown-HOME', () => this.seek(0));
    this.input.keyboard.on('keydown-ESC', () => this.exit());
    this.scale.on('resize', () => cam.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels), this);
  }

  // --- HUD (HTML over the canvas) ---------------------------------------------------------------------

  createHud() {
    const data = this.replay;
    // The resource images have a lot of empty space: show just their visible pixels (x0, y0, x1, y1).
    const icon = (file, [x0, y0, x1, y1]) => {
      const s = Math.min(28 / (x1 - x0), 22 / (y1 - y0));
      return `<i style="width:${(x1 - x0) * s}px;height:${(y1 - y0) * s}px;background-image:url('${ART}Resources/Resources/${file}');`
        + `background-size:${128 * s}px;background-position:${-x0 * s}px ${-y0 * s}px"></i>`;
    };
    const hud = document.createElement('div');
    hud.className = 'replay-hud';
    hud.innerHTML = `
      <style>
        .replay-hud { position: fixed; inset: 0; pointer-events: none; font: 600 15px Arial, sans-serif; color: #f3ead2; }
        .replay-hud .card, .replay-hud .bar, .replay-hud .banner, .replay-hud .note { pointer-events: auto; background: #2f5b5bee;
          border: 3px solid #e9dcc0; border-radius: 10px; box-shadow: 0 3px 8px #0006; }
        .replay-hud .cards { position: absolute; top: 12px; left: 12px; right: 12px; display: flex; justify-content: space-between; gap: 12px; }
        .replay-hud .card { padding: 6px 12px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .replay-hud .card .name { font-size: 17px; padding-left: 8px; border-left: 6px solid; }
        .replay-hud .card span { display: inline-flex; align-items: center; gap: 5px; font-variant-numeric: tabular-nums; }
        .replay-hud .card i { display: inline-block; background-repeat: no-repeat; image-rendering: pixelated; }
        .replay-hud .bar { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); width: min(820px, calc(100% - 32px));
          padding: 8px 12px; display: flex; align-items: center; gap: 10px; box-sizing: border-box; }
        .replay-hud button { font: inherit; color: #7a1f2b; background: #e9dcc0; border: 0; border-radius: 7px; padding: 5px 10px; cursor: pointer; }
        .replay-hud button:hover { background: #ffd24a; }
        .replay-hud button.on { background: #ffd24a; }
        .replay-hud .speeds { display: flex; gap: 3px; }
        .replay-hud .speeds button { padding: 5px 7px; }
        .replay-hud input[type=range] { flex: 1; min-width: 80px; accent-color: #ffd24a; }
        .replay-hud .clock { font-variant-numeric: tabular-nums; white-space: nowrap; }
        .replay-hud .banner { position: absolute; top: 90px; left: 50%; transform: translateX(-50%); padding: 10px 22px; font-size: 22px; display: none; }
        .replay-hud .note { position: absolute; top: 90px; left: 12px; padding: 6px 10px; font-size: 13px; max-width: 360px; }
        .replay-hud .help { position: absolute; right: 12px; bottom: 74px; font-size: 12px; color: #fffc; text-shadow: 0 1px 2px #000; text-align: right; }
        @media (max-width: 640px) { .replay-hud .speeds button:not(.on) { display: none; } .replay-hud .help { display: none; } }
      </style>
      <div class="cards">
        ${data.players.map((p, i) => `
          <div class="card">
            <div class="name" style="border-color:${TEAM_HEX[i]}">${escapeHtml(p.name)}</div>
            <span title="Wood">${icon('W_Idle_(NoShadow).png', [39, 72, 88, 100])}<b data-res="${i}-0">0</b></span>
            <span title="Meat">${icon('M_Idle_(NoShadow).png', [43, 59, 92, 96])}<b data-res="${i}-1">0</b></span>
            <span title="Gold">${icon('G_Idle_(NoShadow).png', [48, 51, 91, 96])}<b data-res="${i}-2">0</b></span>
            <span title="units / room (+ in training)">Pop&nbsp;<b data-pop="${i}">0</b></span>
          </div>`).join('')}
      </div>
      ${this.wrongMap ? `<div class="note">Could not load the replay's map (${escapeHtml(data.map)}); showing another map, so the ground will not match.</div>` : ''}
      <div class="banner"></div>
      <div class="help">Drag / arrow keys: move · Wheel: zoom · Space: pause · , . : step · Esc: leave</div>
      <div class="bar">
        <button data-act="play" title="Play / pause (Space)">❚❚</button>
        <div class="speeds">${SPEEDS.map(s => `<button data-speed="${s}">${s}×</button>`).join('')}</div>
        <input type="range" min="0" max="${this.end}" step="1" value="0">
        <span class="clock"></span>
        <button data-act="exit" title="Back to the start screen (Esc)">Exit</button>
      </div>`;
    document.body.appendChild(hud);
    this.hud = hud;
    this.ui = {
      play: hud.querySelector('[data-act=play]'),
      slider: hud.querySelector('input[type=range]'),
      clock: hud.querySelector('.clock'),
      banner: hud.querySelector('.banner'),
      res: [...hud.querySelectorAll('[data-res]')],
      pop: [...hud.querySelectorAll('[data-pop]')],
      speeds: [...hud.querySelectorAll('[data-speed]')],
    };
    this.ui.play.addEventListener('click', () => this.setPlaying(!this.playing));
    hud.querySelector('[data-act=exit]').addEventListener('click', () => this.exit());
    this.ui.speeds.forEach(b => b.addEventListener('click', () => this.setSpeed(Number(b.dataset.speed))));
    this.ui.slider.addEventListener('input', () => {
      this.scrubbing = true;
      this.seek(Number(this.ui.slider.value));
    });
    this.ui.slider.addEventListener('change', () => { this.scrubbing = false; });
    // Keys pressed while a HUD button has focus must still reach the game (Space would click the button).
    hud.addEventListener('keydown', e => e.preventDefault());
    hud.addEventListener('pointerup', () => document.activeElement?.blur());
    this.setSpeed(1);
    this.lastHud = '';
  }

  setPlaying(playing) {
    if (playing && this.time_ >= this.end) this.time_ = 0;
    this.playing = playing;
    this.ui.play.textContent = playing ? '❚❚' : '▶';
  }

  setSpeed(speed) {
    this.speed = speed;
    this.ui.speeds.forEach(b => b.classList.toggle('on', Number(b.dataset.speed) === speed));
  }

  stepSpeed(step) {
    const i = Phaser.Math.Clamp(SPEEDS.indexOf(this.speed) + step, 0, SPEEDS.length - 1);
    this.setSpeed(SPEEDS[i]);
  }

  seek(t) {
    this.time_ = Phaser.Math.Clamp(t, 0, this.end);
    this.render(this.time_);
  }

  exit() {
    this.registry.remove('replay');
    this.scene.start('StartScene');
  }

  // --- Playback ---------------------------------------------------------------------------------------

  update(time, delta) {
    const cam = this.cameras.main;
    const pan = (delta / 1000) * 900 / cam.zoom;
    if (this.keys.A.isDown || this.keys.LEFT.isDown) cam.scrollX -= pan;
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) cam.scrollX += pan;
    if (this.keys.W.isDown || this.keys.UP.isDown) cam.scrollY -= pan;
    if (this.keys.S.isDown || this.keys.DOWN.isDown) cam.scrollY += pan;

    if (this.playing && !this.scrubbing) {
      this.time_ = Math.min(this.end, this.time_ + (delta / this.replay.tick_ms) * this.speed);
      if (this.time_ >= this.end) this.setPlaying(false);
    }
    this.render(this.time_);
  }

  /** Draws the game as it was at time t (ticks). */
  render(t) {
    const k = floorIndex(this.times, t);
    const next = Math.min(k + 1, this.times.length - 1);
    const span = this.times[next] - this.times[k];
    const alpha = span > 0 ? Phaser.Math.Clamp((t - this.times[k]) / span, 0, 1) : 0;
    this.bars.clear();
    this.renderResources(t);
    this.renderBuildings(t, k, next, alpha);
    this.renderUnits(t, k, next, alpha);
    this.renderCorpses(t);
    this.renderArrows(t);
    this.renderHud(t, k);
  }

  flashing(id, t) {
    const list = this.hits.get(id);
    if (!list) return false;
    const i = floorIndex(list, t);
    return list[i] <= t && t - list[i] < HIT_FLASH_TICKS;
  }

  healthBar(x, y, width, fraction, color) {
    this.bars.fillStyle(0x1b1b1b, 0.85).fillRect(x - width / 2 - 1, y - 1, width + 2, 7);
    this.bars.fillStyle(color, 1).fillRect(x - width / 2, y, width * Phaser.Math.Clamp(fraction, 0, 1), 5);
  }

  renderUnits(t, k, next, alpha) {
    const kinds = this.replay.kinds;
    const seen = new Set();
    for (const [id, a] of this.unitRows[k]) {
      const b = this.unitRows[next].get(id) ?? a;
      const x = this.px(a[3] + (b[3] - a[3]) * alpha);
      const y = this.py(a[4] + (b[4] - a[4]) * alpha);
      const kind = kinds.units[a[1]];
      const color = COLORS[a[2]];
      const action = kinds.actions[a[6]];
      let sprite = this.layer.units.get(id);
      if (!sprite) {
        sprite = this.add.sprite(x, y, kind === 'lancer' ? key('lancer', 'idle', color) : key(kind, color)).setScale(0.8);
        sprite.facingLeft = a[2] === 1;
        this.layer.units.set(id, sprite);
      }
      seen.add(id);
      sprite.setPosition(x, y).setDepth(y).setVisible(true);

      // Facing: towards where it walks, or towards what it works on or attacks.
      const dx = b[3] - a[3];
      let dir = null;
      if (Math.abs(dx) > 0.01) sprite.facingLeft = dx < 0;
      const target = a[7] >= 0 ? this.positionOf(a[7], k) : null;
      if (target && action !== 'walk') {
        const [d, mirrored] = direction8(this.px(target.x) - x, this.py(target.y) - y);
        dir = d;
        sprite.facingLeft = d === 'up' || d === 'down' ? sprite.facingLeft : mirrored;
      }
      sprite.setFlipX(sprite.facingLeft);
      sprite.play(this.animationFor(kind, color, action, dir), true);
      sprite.setTint(this.flashing(id, t) ? 0xff7070 : 0xffffff);
      if (a[5] < 1) this.healthBar(x, y - 44, 40, a[5], TEAM_BAR[a[2]]);
    }
    for (const [id, sprite] of this.layer.units) if (!seen.has(id)) sprite.setVisible(false);
  }

  animationFor(kind, color, action, dir) {
    if (action === 'walk') return key(kind, 'run', color);
    if (kind === 'worker') {
      if (action === 'build' || action === 'mine') return key('worker', 'hammer', color);
      if (action === 'chop' || action === 'meat' || action === 'attack') return key('worker', 'cut', color);
      return key('worker', 'idle', color);
    }
    if (action !== 'attack') return key(kind, 'idle', color);
    dir ??= 'right';
    if (kind === 'warrior') return key('warrior', dir === 'up' || dir === 'down' ? dir : 'right', color); // 3 directions
    return key(kind, dir, color);
  }

  /** Where unit or building `id` is in snapshot k (map-file tiles; a building's centre), or null. */
  positionOf(id, k) {
    const u = this.unitRows[k].get(id);
    if (u) return { x: u[3], y: u[4] };
    const b = this.buildingRows[k].get(id);
    if (b) {
      const [w, h] = this.replay.building_sizes[this.replay.kinds.buildings[b[1]]];
      return { x: b[3] + (w - 1) / 2, y: b[4] + (h - 1) / 2 };
    }
    return null;
  }

  /** Places a building image so its visible base sits on the bottom edge of its footprint. */
  placeBuilding(sprite, kind, x, y, state) {
    const spec = BUILDINGS[kind];
    const [w, h] = this.replay.building_sizes[kind];
    const left = (x - this.shift.x) * TILE;
    const bottom = (y - this.shift.y + h) * TILE;
    sprite.setOrigin(0.5, spec.bottom[state] / spec.h).setScale(spec.scale)
      .setPosition(left + (w * TILE) / 2, bottom).setDepth(bottom - 8).setVisible(true);
    return { cx: left + (w * TILE) / 2, top: bottom - spec.bottom[state] * spec.scale + 40 * spec.scale, width: w * TILE };
  }

  renderBuildings(t, k, next, alpha) {
    const kinds = this.replay.kinds;
    const seen = new Set();
    for (const [id, a] of this.buildingRows[k]) {
      const b = this.buildingRows[next].get(id) ?? a;
      const kind = kinds.buildings[a[1]];
      const built = a[6] >= 1;
      const texture = built ? key(kind, COLORS[a[2]]) : key(kind, 'construct');
      let sprite = this.layer.buildings.get(id);
      if (!sprite) {
        sprite = this.add.image(0, 0, texture);
        this.layer.buildings.set(id, sprite);
      }
      if (sprite.texture.key !== texture) sprite.setTexture(texture);
      seen.add(id);
      const box = this.placeBuilding(sprite, kind, a[3], a[4], built ? 'built' : 'construct');
      sprite.setTint(this.flashing(id, t) ? 0xff9090 : 0xffffff);
      const hp = a[5] + (b[5] - a[5]) * alpha;
      const width = Math.min(box.width - 16, 120);
      if (!built) {
        this.healthBar(box.cx, box.top, width, a[6] + (b[6] - a[6]) * alpha, 0xffd24a);
      } else if (hp < 1) {
        this.healthBar(box.cx, box.top, width, hp, TEAM_BAR[a[2]]);
      }
    }
    for (const [id, sprite] of this.layer.buildings) if (!seen.has(id)) sprite.setVisible(false);

    for (const d of this.destroyed) {
      let sprite = this.layer.rubble.get(d.id);
      if (d.t > t) {
        sprite?.setVisible(false);
        continue;
      }
      const kind = kinds.buildings[d.kind];
      if (!sprite) {
        sprite = this.add.image(0, 0, key(kind, 'destroyed'));
        this.layer.rubble.set(d.id, sprite);
      }
      this.placeBuilding(sprite, kind, d.x, d.y, 'destroyed');
      sprite.setDepth(sprite.depth - 64);
    }
  }

  renderResources(t) {
    for (const r of this.resources) {
      const id = `${r.id}@${r.from}`;
      let sprite = this.layer.resources.get(id);
      const shown = r.from <= t && t < r.to;
      if (!shown) {
        sprite?.setVisible(false);
        continue;
      }
      const x = this.px(r.x);
      const y = this.py(r.y);
      if (!sprite) {
        if (r.kind === 'tree') {
          const type = r.id % TREES.length;
          sprite = this.add.sprite(x, y, key('tree', type)).setOrigin(0.5, 1).setDepth(y);
          sprite.play({ key: key('tree', type), startFrame: r.id % TREES[type].frames });
        } else if (r.kind === 'mine') {
          sprite = this.add.image(x, y, key('mine')).setDepth(y + 32);
        } else {
          sprite = this.add.sprite(x, y, key('sheep')).setScale(0.8).setDepth(y);
          sprite.setFlipX(r.id % 2 === 0);
        }
        this.layer.resources.set(id, sprite);
      }
      sprite.setVisible(true);
      if (r.kind === 'sheep') {
        if (t >= r.butchered) {
          if (sprite.texture.key !== key('meat')) sprite.stop().setTexture(key('meat'), 6);
        } else if (sprite.texture.key !== key('sheep') || !sprite.anims.isPlaying) {
          sprite.setTexture(key('sheep')).play(key('sheep'));
        }
      }
    }
  }

  renderCorpses(t) {
    let n = 0;
    for (const d of this.deaths) {
      const age = t - d.t;
      if (age < 0 || age >= CORPSE_TICKS) continue;
      let sprite = this.layer.corpses[n];
      if (!sprite) {
        sprite = this.add.sprite(0, 0, key('dead'));
        this.layer.corpses.push(sprite);
      }
      n++;
      const x = this.px(d.x);
      const y = this.py(d.y);
      // The skull falls (frames 0-6), then the grave sinks away (7-13), as the game's dead-anim-1/2.
      const frame = Math.min(13, Math.floor(age < 7 ? age : 7 + (age - 7) * 7 / (CORPSE_TICKS - 7)));
      sprite.setFrame(frame).setPosition(x, y).setDepth(y - 1).setVisible(true);
    }
    for (let i = n; i < this.layer.corpses.length; i++) this.layer.corpses[i].setVisible(false);
  }

  renderArrows(t) {
    let n = 0;
    const longest = 40; // ticks: no flight lasts longer than this
    for (let i = floorIndex(this.arrowStarts, t - longest - MISSED_ARROW_TICKS); i < this.arrows.length; i++) {
      const a = this.arrows[i];
      if (a.loosed > t) break;
      const stuck = t >= a.lands;
      if (stuck && (a.hit || t - a.lands >= MISSED_ARROW_TICKS)) continue;
      let sprite = this.layer.arrows[n];
      if (!sprite) {
        sprite = this.add.sprite(0, 0, key('arrow')).setScale(0.8);
        this.layer.arrows.push(sprite);
      }
      n++;
      const x0 = this.px(a.from[0]);
      const y0 = this.py(a.from[1]);
      const x1 = this.px(a.aim[0]);
      const y1 = this.py(a.aim[1]);
      if (stuck) {
        sprite.setFrame(1).setPosition(x1, y1).setRotation(0).setDepth(y1).setVisible(true);
        continue;
      }
      // The game's arc: straight across at ARROW_SPEED while gravity bends it so it lands on the aim point.
      const flight = Math.max(0.05, Math.hypot(x1 - x0, y1 - y0) / ARROW_SPEED);
      const duration = Math.max(1e-6, a.lands - a.loosed);
      const s = ((t - a.loosed) / duration) * flight;
      const vx = (x1 - x0) / flight;
      const vy0 = (y1 - y0) / flight - 0.5 * ARROW_GRAVITY * flight;
      const x = x0 + vx * s;
      const y = y0 + vy0 * s + 0.5 * ARROW_GRAVITY * s * s;
      sprite.setFrame(0).setPosition(x, y).setRotation(Math.atan2(vy0 + ARROW_GRAVITY * s, vx)).setDepth(1e6).setVisible(true);
    }
    for (let i = n; i < this.layer.arrows.length; i++) this.layer.arrows[i].setVisible(false);
  }

  renderHud(t, k) {
    const f = this.replay.frames[k];
    const clock = `${formatTime(t * this.replay.tick_ms)} / ${formatTime(this.end * this.replay.tick_ms)}`;
    const ended = t >= this.end;
    const state = `${k}|${clock}|${ended}`;
    if (!this.scrubbing) this.ui.slider.value = String(Math.round(t));
    if (state === this.lastHud) return;
    this.lastHud = state;
    this.ui.clock.textContent = clock;
    this.ui.res.forEach(el => {
      const [p, r] = el.dataset.res.split('-').map(Number);
      el.textContent = String(f.res[p][r]);
    });
    this.ui.pop.forEach(el => {
      const [units, queued, room] = f.pop[Number(el.dataset.pop)];
      el.textContent = `${units}/${room}${queued ? ` (+${queued})` : ''}`;
    });
    const w = this.replay.winner;
    this.ui.banner.style.display = ended ? 'block' : 'none';
    if (ended) {
      this.ui.banner.innerHTML = w === 0 || w === 1
        ? `<span style="color:${TEAM_HEX[w]}">${w === 0 ? 'Blue' : 'Red'} (${escapeHtml(this.replay.players[w].name)})</span> wins`
        : 'Draw: time ran out';
    }
  }
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
