// Draws a MapDocument's tile layers (and outlines of its objects) for the editor camera.
//
// Only the tiles inside the camera view are turned into sprites, taken from a pool, so the map can be
// as large as you like. Tiles are placed the way Tiled places them: the bottom-left corner of a tile
// sits on the bottom-left corner of its grid cell. That is why a 192px foam tile on a 64px grid is
// drawn 128px higher, with no per-layer offsets needed.

import { TileLayer, ObjectLayer, CHUNK_SIZE, FLIP_H, FLIP_V, plainGid } from './mapModel.js';
import { MAP_LAYERS, layerKind } from '../mapConventions.js';

const OTHER_OBJECT_COLOR = 0xd28bff;
const POINT_RADIUS = 24; // world px; how big a point marker is (and how near a click must be)

// Icons drawn on the special point layers (textures loaded by the editor scene).
export const POINT_ICONS = {
  [MAP_LAYERS.goldMines.name]: { key: 'editor-icon-gold-mine', frame: undefined, scale: 0.5, label: 'Gold mine' },
  [MAP_LAYERS.enemySpawns.name]: { key: 'editor-icon-enemy', frame: 0, scale: 0.45, label: 'Enemy spawn' },
  [MAP_LAYERS.playerStart.name]: { key: 'editor-icon-castle', frame: undefined, scale: 0.3, label: 'Player start' },
};

export default class TileView {
  constructor(scene, doc, mapUrl) {
    this.scene = scene;
    this.doc = doc;
    this.mapUrl = mapUrl;
    this.tileW = doc.meta.tilewidth;
    this.tileH = doc.meta.tileheight;
    this.pool = [];
    this.used = 0;
    this.dirty = true;
    this.lastView = '';
    this.showGrid = true;
    this.objectGraphics = scene.add.graphics().setDepth(1e9);
    this.objectImages = [];
    this.labels = [];
    this.gridGraphics = scene.add.graphics().setDepth(1e9 + 1);

    this.previewGraphics = scene.add.graphics().setDepth(1e9 + 2);
    this.previewImages = [];
    this.updateReach();
  }

  /** How far (in cells) a tile can reach beyond its own cell: tiles grow up and to the right. */
  updateReach() {
    this.reach = Math.max(1, ...this.doc.tilesets.map(ts => Math.ceil(Math.max(ts.tilewidth, ts.tileheight) / this.tileW)));
  }

  /** Loads (if needed) and slices a tileset added while the editor is open, then redraws. */
  ensureTileset(ts) {
    this.updateReach();
    const key = this.keyFor(ts);
    if (this.scene.textures.exists(key)) {
      this.sliceFrames();
      this.setDirty();
      return;
    }
    this.scene.load.image(key, this.imageUrl(ts));
    this.scene.load.once('complete', () => {
      this.sliceFrames();
      this.setDirty();
    });
    this.scene.load.start();
  }

  /**
   * Texture key of a tileset image. It is the image's full URL, so saving the map into another folder
   * (which rewrites the relative image paths) still finds the textures already loaded.
   */
  keyFor(ts) {
    return `ts:${this.imageUrl(ts)}`;
  }

  /** Where a tileset image is, relative to the page (tileset paths are relative to the map file). */
  imageUrl(ts) {
    return new URL(ts.image, new URL(this.mapUrl, document.baseURI)).href;
  }

  /** Queues every tileset image on the scene loader and slices them into frames once loaded. */
  queueTilesets() {
    for (const ts of this.doc.tilesets) {
      if (!ts.image) continue; // image-collection tilesets are not supported yet
      const key = this.keyFor(ts);
      if (!this.scene.textures.exists(key)) this.scene.load.image(key, this.imageUrl(ts));
    }
  }

  sliceFrames() {
    for (const ts of this.doc.tilesets) {
      if (!ts.image) continue;
      const texture = this.scene.textures.get(this.keyFor(ts));
      if (!texture || texture.key === '__MISSING' || texture.has(0)) continue;
      const margin = ts.margin ?? 0;
      const spacing = ts.spacing ?? 0;
      for (let i = 0; i < ts.tilecount; i++) {
        const col = i % ts.columns;
        const row = Math.floor(i / ts.columns);
        texture.add(i, 0, margin + col * (ts.tilewidth + spacing), margin + row * (ts.tileheight + spacing), ts.tilewidth, ts.tileheight);
      }
    }
  }

  setDirty() { this.dirty = true; }

  setGridVisible(v) {
    this.showGrid = v;
    this.dirty = true;
  }

  /** Redraws when the camera moved/zoomed or the map changed. Call once per frame. */
  update() {
    const cam = this.scene.cameras.main;
    const key = `${cam.scrollX}|${cam.scrollY}|${cam.zoom}|${cam.width}|${cam.height}`;
    if (!this.dirty && key === this.lastView) return;
    this.lastView = key;
    this.dirty = false;
    this.redraw(cam);
  }

  redraw(cam) {
    // Not cam.worldView: Phaser only refreshes it when rendering, after update() has run, so right
    // after a zoom/scroll change it still describes the old view and only part of the map was drawn.
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const vx = cam.scrollX + (cam.width - viewW) / 2;
    const vy = cam.scrollY + (cam.height - viewH) / 2;
    const view = { x: vx, y: vy, right: vx + viewW, bottom: vy + viewH };
    const x0 = Math.floor(view.x / this.tileW) - this.reach;
    const x1 = Math.ceil(view.right / this.tileW) + 1;
    const y0 = Math.floor(view.y / this.tileH) - 1;
    const y1 = Math.ceil(view.bottom / this.tileH) + this.reach;

    this.used = 0;
    const layers = this.doc.layers;
    layers.forEach((layer, index) => {
      if (!(layer instanceof TileLayer) || !layer.visible) return;
      const alpha = layer.props.opacity ?? 1;
      // Walk the layer's chunks (not every cell in view) so zooming far out stays cheap.
      for (const chunk of layer.chunks.values()) {
        const cx = chunk.cx * CHUNK_SIZE;
        const cy = chunk.cy * CHUNK_SIZE;
        if (cx + CHUNK_SIZE - 1 < x0 || cx > x1 || cy + CHUNK_SIZE - 1 < y0 || cy > y1) continue;
        for (let i = 0; i < chunk.data.length; i++) {
          const gid = chunk.data[i];
          if (!gid) continue;
          const x = cx + (i % CHUNK_SIZE);
          const y = cy + Math.floor(i / CHUNK_SIZE);
          if (x < x0 || x > x1 || y < y0 || y > y1) continue;
          this.place(gid, x, y, index, alpha, (y - y0) * 4096 + (x - x0));
        }
      }
    });
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].setVisible(false);

    this.drawObjects();
    this.drawGrid(view, x0 + this.reach, x1, y0 + 1, y1 - this.reach);
  }

  place(gid, x, y, layerIndex, alpha, order) {
    const ts = this.doc.tilesets.length ? this.doc.tilesetForGid(gid) : null;
    if (!ts || !ts.image) return;
    const frame = plainGid(gid) - ts.firstgid;
    const key = this.keyFor(ts);
    if (frame < 0 || frame >= ts.tilecount || !this.scene.textures.exists(key)) return;

    let image = this.pool[this.used];
    if (!image) {
      image = this.scene.add.image(0, 0, key, frame).setOrigin(0, 0);
      this.pool.push(image);
    }
    this.used++;
    image.setTexture(key, frame);
    image.setPosition(x * this.tileW, (y + 1) * this.tileH - ts.tileheight);
    image.setFlip(!!(gid & FLIP_H), !!(gid & FLIP_V));
    image.setAlpha(alpha);
    image.setDepth(layerIndex * 1e7 + order);
    image.setVisible(true);
  }

  /**
   * Shows what a tool would do at the cursor: a faded copy of the stamp and/or an outline.
   * @param {object|null} p  { x, y, w, h (cells), stamp?, color } or, for free placement,
   *   { px: { x, y, w, h } (world px), stamp?, color }
   */
  drawPreview(p) {
    const g = this.previewGraphics;
    g.clear();
    let used = 0;
    if (p) {
      if (p.stamp) {
        for (let row = 0; row < p.stamp.height; row++) {
          for (let col = 0; col < p.stamp.width; col++) {
            const gid = p.stamp.gids[row * p.stamp.width + col];
            const ts = gid ? this.doc.tilesetForGid(gid) : null;
            if (!ts || !this.scene.textures.exists(this.keyFor(ts))) continue;
            let image = this.previewImages[used];
            if (!image) {
              image = this.scene.add.image(0, 0, this.keyFor(ts)).setOrigin(0, 0).setDepth(1e9 - 1).setAlpha(0.65);
              this.previewImages.push(image);
            }
            used++;
            image.setTexture(this.keyFor(ts), plainGid(gid) - ts.firstgid);
            if (p.px) image.setPosition(p.px.x, p.px.y);
            else image.setPosition((p.x + col) * this.tileW, (p.y + row + 1) * this.tileH - ts.tileheight);
            image.setVisible(true);
          }
        }
      }
      const zoom = this.scene.cameras.main.zoom;
      g.lineStyle(2 / zoom, p.color ?? 0x5aa0ff, 1);
      g.fillStyle(p.color ?? 0x5aa0ff, p.fillAlpha ?? 0.12);
      const box = p.px ?? { x: p.x * this.tileW, y: p.y * this.tileH, w: p.w * this.tileW, h: p.h * this.tileH };
      g.fillRect(box.x, box.y, box.w, box.h);
      g.strokeRect(box.x, box.y, box.w, box.h);
    }
    for (let i = used; i < this.previewImages.length; i++) this.previewImages[i].setVisible(false);
  }

  /** The visible area in tiles (used to keep a fill of empty space from running forever). */
  visibleTileRect() {
    const cam = this.scene.cameras.main;
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const vx = cam.scrollX + (cam.width - viewW) / 2;
    const vy = cam.scrollY + (cam.height - viewH) / 2;
    const x = Math.floor(vx / this.tileW);
    const y = Math.floor(vy / this.tileH);
    return { x, y, width: Math.ceil((vx + viewW) / this.tileW) - x, height: Math.ceil((vy + viewH) / this.tileH) - y };
  }

  /** World-space box of an object (used for drawing, clicking and the selection outline). */
  objectBounds(layer, o) {
    const ox = layer.props.offsetx ?? 0;
    const oy = layer.props.offsety ?? 0;
    switch (ObjectLayer.shapeOf(o)) {
      case 'tile': return { x: o.x + ox, y: o.y + oy - o.height, w: o.width, h: o.height };
      case 'point': return { x: o.x + ox - POINT_RADIUS, y: o.y + oy - POINT_RADIUS, w: POINT_RADIUS * 2, h: POINT_RADIUS * 2 };
      case 'polygon': {
        const pts = o.polygon ?? o.polyline;
        const xs = pts.map(p => p.x);
        const ys = pts.map(p => p.y);
        return { x: o.x + ox + Math.min(...xs), y: o.y + oy + Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      default: return { x: o.x + ox, y: o.y + oy, w: o.width ?? 0, h: o.height ?? 0 };
    }
  }

  /** Draws every visible object layer: shapes, point markers with icons and labels, and placed images. */
  drawObjects() {
    const g = this.objectGraphics;
    g.clear();
    const zoom = this.scene.cameras.main.zoom;
    let imagesUsed = 0;
    let labelsUsed = 0;
    const image = (key, frame) => {
      let img = this.objectImages[imagesUsed++];
      if (!img) {
        img = this.scene.add.image(0, 0, key, frame);
        this.objectImages.push(img);
      }
      img.setTexture(key, frame).setVisible(true).setFlip(false, false).setAlpha(1);
      return img;
    };
    const label = (text, x, y, color) => {
      let t = this.labels[labelsUsed++];
      if (!t) {
        t = this.scene.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(1e9 + 3);
        this.labels.push(t);
      }
      t.setText(text).setPosition(x, y).setScale(1 / zoom).setColor(`#${color.toString(16).padStart(6, '0')}`).setVisible(true);
    };

    this.doc.layers.forEach((layer, layerIndex) => {
      if (!(layer instanceof ObjectLayer) || !layer.visible) return;
      const kind = layerKind(layer.name);
      const color = kind?.color ?? OTHER_OBJECT_COLOR;
      const icon = POINT_ICONS[layer.name];
      for (const o of layer.objects) {
        if (o.visible === false) continue;
        const box = this.objectBounds(layer, o);
        const shape = ObjectLayer.shapeOf(o);
        if (shape === 'tile') {
          const ts = this.doc.tilesetForGid(o.gid);
          if (ts && this.scene.textures.exists(this.keyFor(ts))) {
            image(this.keyFor(ts), plainGid(o.gid) - ts.firstgid)
              .setOrigin(0, 0)
              .setPosition(box.x, box.y)
              .setDisplaySize(box.w, box.h)
              .setFlip(!!(o.gid & FLIP_H), !!(o.gid & FLIP_V))
              // Placed images sort with their own layer, lower ones in front.
              .setDepth(layerIndex * 1e7 + 9e6 + (box.y + box.h) / 1000);
          } else {
            g.lineStyle(2 / zoom, color, 1).strokeRect(box.x, box.y, box.w, box.h);
          }
        } else if (shape === 'point') {
          const cx = box.x + POINT_RADIUS;
          const cy = box.y + POINT_RADIUS;
          if (icon && this.scene.textures.exists(icon.key)) {
            image(icon.key, icon.frame).setOrigin(0.5, 0.5).setPosition(cx, cy).setScale(icon.scale).setDepth(1e9 - 2).setAlpha(0.95);
          }
          g.lineStyle(2 / zoom, color, 1);
          g.fillStyle(color, 0.25);
          g.fillCircle(cx, cy, POINT_RADIUS);
          g.strokeCircle(cx, cy, POINT_RADIUS);
          g.fillStyle(color, 1).fillCircle(cx, cy, 4 / zoom);
          label(o.name || icon?.label || layer.name, cx, cy + POINT_RADIUS + 2 / zoom, color);
        } else if (shape === 'ellipse') {
          g.lineStyle(2 / zoom, color, 1).fillStyle(color, 0.18);
          g.fillEllipse(box.x + box.w / 2, box.y + box.h / 2, box.w, box.h);
          g.strokeEllipse(box.x + box.w / 2, box.y + box.h / 2, box.w, box.h);
        } else if (shape === 'polygon') {
          const pts = (o.polygon ?? o.polyline).map(p => ({ x: p.x + o.x, y: p.y + o.y }));
          g.lineStyle(2 / zoom, color, 1).strokePoints(pts, !!o.polygon);
        } else {
          g.lineStyle(2 / zoom, color, 1).fillStyle(color, 0.2);
          g.fillRect(box.x, box.y, box.w, box.h);
          g.strokeRect(box.x, box.y, box.w, box.h);
          if (o.name) label(o.name, box.x + box.w / 2, box.y + box.h + 2 / zoom, color);
        }
      }
    });
    for (let i = imagesUsed; i < this.objectImages.length; i++) this.objectImages[i].setVisible(false);
    for (let i = labelsUsed; i < this.labels.length; i++) this.labels[i].setVisible(false);
  }

  drawGrid(view, x0, x1, y0, y1) {
    const g = this.gridGraphics;
    g.clear();
    if (!this.showGrid) return;
    const zoom = this.scene.cameras.main.zoom;
    const w = this.tileW;
    const h = this.tileH;

    if (zoom >= 0.3) {
      g.lineStyle(1 / zoom, 0xffffff, 0.2);
      for (let x = x0; x <= x1; x++) if (x % 16) { g.lineBetween(x * w, view.y, x * w, view.bottom); }
      for (let y = y0; y <= y1; y++) if (y % 16) { g.lineBetween(view.x, y * h, view.right, y * h); }
    }
    // Chunk borders (every 16 cells) and the map origin.
    g.lineStyle(2 / zoom, 0xffcc33, 0.5);
    for (let x = Math.floor(x0 / 16) * 16; x <= x1; x += 16) g.lineBetween(x * w, view.y, x * w, view.bottom);
    for (let y = Math.floor(y0 / 16) * 16; y <= y1; y += 16) g.lineBetween(view.x, y * h, view.right, y * h);
    g.lineStyle(2 / zoom, 0xff5555, 0.45);
    g.lineBetween(0, view.y, 0, view.bottom);
    g.lineBetween(view.x, 0, view.right, 0);
  }

  /** The topmost painted tile at a cell: { layer, gid, tileset, index } or null. */
  tileAt(x, y) {
    for (let i = this.doc.layers.length - 1; i >= 0; i--) {
      const layer = this.doc.layers[i];
      if (!(layer instanceof TileLayer) || !layer.visible) continue;
      const gid = layer.getTile(x, y);
      if (!gid) continue;
      const ts = this.doc.tilesetForGid(gid);
      return { layer, gid, tileset: ts, index: ts ? plainGid(gid) - ts.firstgid : -1 };
    }
    return null;
  }

  /** Tile-space bounds of everything in the map, or null for an empty map. */
  mapBounds() {
    let box = null;
    for (const layer of this.doc.tileLayers()) {
      const b = layer.bounds();
      if (!b) continue;
      if (!box) box = { ...b };
      else {
        const x = Math.min(box.x, b.x);
        const y = Math.min(box.y, b.y);
        box = { x, y, width: Math.max(box.x + box.width, b.x + b.width) - x, height: Math.max(box.y + box.height, b.y + b.height) - y };
      }
    }
    return box;
  }

  destroy() {
    this.pool.forEach(i => i.destroy());
    this.pool = [];
    this.previewImages.forEach(i => i.destroy());
    this.previewImages = [];
    this.objectGraphics.destroy();
    this.objectImages.forEach(i => i.destroy());
    this.labels.forEach(t => t.destroy());
    this.gridGraphics.destroy();
    this.previewGraphics.destroy();
  }
}
