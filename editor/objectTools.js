// Editing objects on object layers: selecting, moving, resizing, deleting, and creating rectangles,
// points and placed images ("sprites"). Every change is an undoable command on the editor's history.
//
// Objects are the plain Tiled objects stored in the layer, so they are saved exactly as Tiled saves them.

import { ObjectLayer, plainGid } from './mapModel.js';
import { layerKind } from '../mapConventions.js';

const SNAP = 32;        // world px; half a tile, the same grid the game's pathfinding uses
const HANDLE_PX = 9;    // screen px; size of the resize handle
const MIN_SIZE = 4;     // world px; smaller drags count as a click

export const OBJECT_TOOLS = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'rect', label: 'Rectangle', key: 'R' },
  { id: 'point', label: 'Point', key: 'P' },
  { id: 'sprite', label: 'Sprite', key: 'T' },
];

/** Which object tool fits a layer best (used when that layer is selected). */
export function defaultToolFor(layer) {
  const shape = layerKind(layer.name)?.shape;
  return { rect: 'rect', point: 'point', tile: 'sprite' }[shape] ?? 'select';
}

const round = v => Math.round(v * 100) / 100;

/** A command that sets some fields of an object (and can set them back). */
function changeCommand(obj, before, after, label) {
  return {
    label,
    undo: () => Object.assign(obj, before),
    redo: () => Object.assign(obj, after),
  };
}

export default class ObjectTools {
  constructor(scene) {
    this.scene = scene;
    this.selected = null; // { layer, obj }
    this.drag = null;
    this.snap = true;
    this.selectionGraphics = scene.add.graphics().setDepth(1e9 + 4);
  }

  get doc() { return this.scene.doc; }
  get view() { return this.scene.view; }

  snapValue(v) {
    return this.snap ? Math.round(v / SNAP) * SNAP : round(v);
  }

  // ---- selection ---------------------------------------------------------------------------

  select(layer, obj) {
    this.selected = obj ? { layer, obj } : null;
    this.scene.onObjectSelected(this.selected);
    this.drawSelection();
  }

  /** Drops the selection if its object no longer exists (after undo, layer delete, ...). */
  validateSelection() {
    const s = this.selected;
    if (s && (!this.doc.layers.includes(s.layer) || !s.layer.objects.includes(s.obj))) this.select(null);
    else this.drawSelection();
  }

  /** The topmost object under a world point: the selected layer first, then the other visible layers. */
  hitTest(wx, wy) {
    const layers = this.doc.objectLayers().filter(l => l.visible);
    const current = this.scene.selectedLayer;
    const ordered = [...layers.filter(l => l === current), ...layers.filter(l => l !== current).reverse()];
    for (const layer of ordered) {
      for (let i = layer.objects.length - 1; i >= 0; i--) {
        const o = layer.objects[i];
        if (o.visible === false) continue;
        const b = this.view.objectBounds(layer, o);
        const pad = 4 / this.scene.cameras.main.zoom; // thin rectangles stay clickable
        if (wx >= b.x - pad && wx <= b.x + b.w + pad && wy >= b.y - pad && wy <= b.y + b.h + pad) return { layer, obj: o };
      }
    }
    return null;
  }

  /** True if the world point is on the resize handle of the selected rectangle/image. */
  onResizeHandle(wx, wy) {
    const s = this.selected;
    if (!s || !['rect', 'ellipse', 'tile'].includes(ObjectLayer.shapeOf(s.obj))) return false;
    const b = this.view.objectBounds(s.layer, s.obj);
    const r = HANDLE_PX / this.scene.cameras.main.zoom;
    return Math.abs(wx - (b.x + b.w)) <= r && Math.abs(wy - (b.y + b.h)) <= r;
  }

  drawSelection() {
    const g = this.selectionGraphics;
    g.clear();
    const s = this.selected;
    if (!s || !s.layer.visible) return;
    const zoom = this.scene.cameras.main.zoom;
    const b = this.view.objectBounds(s.layer, s.obj);
    g.lineStyle(2 / zoom, 0xffffff, 1).strokeRect(b.x, b.y, b.w, b.h);
    g.lineStyle(1 / zoom, 0x000000, 1).strokeRect(b.x - 2 / zoom, b.y - 2 / zoom, b.w + 4 / zoom, b.h + 4 / zoom);
    if (['rect', 'ellipse', 'tile'].includes(ObjectLayer.shapeOf(s.obj))) {
      const r = HANDLE_PX / zoom;
      g.fillStyle(0xffffff, 1).fillRect(b.x + b.w - r / 2, b.y + b.h - r / 2, r, r);
      g.lineStyle(1 / zoom, 0x000000, 1).strokeRect(b.x + b.w - r / 2, b.y + b.h - r / 2, r, r);
    }
  }

  // ---- pointer -----------------------------------------------------------------------------

  /** Mouse down on the map with an object tool. `layer` is the selected object layer (may be null). */
  onDown(tool, layer, wx, wy) {
    if (tool === 'select') {
      if (this.onResizeHandle(wx, wy)) {
        const o = this.selected.obj;
        this.drag = { mode: 'resize', before: { width: o.width, height: o.height, y: o.y }, wx, wy };
        return;
      }
      const hit = this.hitTest(wx, wy);
      if (hit && hit.layer !== this.scene.selectedLayer) this.scene.selectLayer(hit.layer, { keepTool: true });
      this.select(hit?.layer, hit?.obj);
      if (hit) this.drag = { mode: 'move', before: { x: hit.obj.x, y: hit.obj.y }, wx, wy, moved: false };
      return;
    }
    if (!layer) return;
    if (tool === 'rect') {
      this.drag = { mode: 'create-rect', layer, x0: this.snapValue(wx), y0: this.snapValue(wy), x1: this.snapValue(wx), y1: this.snapValue(wy) };
    } else if (tool === 'point') {
      this.placePoint(layer, wx, wy);
    } else if (tool === 'sprite') {
      this.placeSprite(layer, wx, wy);
    }
  }

  onMove(wx, wy) {
    const d = this.drag;
    if (!d) return;
    if (d.mode === 'move') {
      const o = this.selected.obj;
      const dx = wx - d.wx;
      const dy = wy - d.wy;
      if (!d.moved && Math.hypot(dx, dy) * this.scene.cameras.main.zoom < 3) return; // a click, not a drag
      d.moved = true;
      o.x = this.snapValue(d.before.x + dx);
      o.y = this.snapValue(d.before.y + dy);
    } else if (d.mode === 'resize') {
      const o = this.selected.obj;
      const isTile = ObjectLayer.shapeOf(o) === 'tile';
      const b = this.view.objectBounds(this.selected.layer, o);
      const right = this.snapValue(wx);
      const bottom = this.snapValue(wy);
      o.width = Math.max(MIN_SIZE, round(right - b.x));
      const h = Math.max(MIN_SIZE, round(bottom - b.y));
      if (isTile) o.y = round(b.y + h - (this.selected.layer.props.offsety ?? 0)); // tile objects are anchored at the bottom
      o.height = h;
    } else if (d.mode === 'create-rect') {
      d.x1 = this.snapValue(wx);
      d.y1 = this.snapValue(wy);
    }
    this.view.setDirty();
    this.drawSelection();
    this.drawCreatePreview();
  }

  onUp() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.mode === 'move' && d.moved) {
      const o = this.selected.obj;
      this.scene.history.push(changeCommand(o, d.before, { x: o.x, y: o.y }, 'move object'));
      this.scene.onObjectChanged();
    } else if (d.mode === 'resize') {
      const o = this.selected.obj;
      const after = { width: o.width, height: o.height, y: o.y };
      if (after.width !== d.before.width || after.height !== d.before.height) {
        this.scene.history.push(changeCommand(o, d.before, after, 'resize object'));
        this.scene.onObjectChanged();
      }
    } else if (d.mode === 'create-rect') {
      let x = Math.min(d.x0, d.x1);
      let y = Math.min(d.y0, d.y1);
      let w = Math.abs(d.x1 - d.x0);
      let h = Math.abs(d.y1 - d.y0);
      if (w < MIN_SIZE || h < MIN_SIZE) {
        // A click: make a one-tile rectangle on the clicked tile.
        const tw = this.view.tileW;
        const th = this.view.tileH;
        x = Math.floor(d.x0 / tw) * tw;
        y = Math.floor(d.y0 / th) * th;
        w = tw;
        h = th;
      }
      this.addObject(d.layer, { height: h, name: '', rotation: 0, type: '', visible: true, width: w, x, y }, 'add rectangle');
    }
    this.selectionGraphics && this.drawCreatePreview();
    this.view.setDirty();
  }

  drawCreatePreview() {
    const d = this.drag;
    if (!d || d.mode !== 'create-rect') {
      this.view.drawPreview(null);
      return;
    }
    const x = Math.min(d.x0, d.x1);
    const y = Math.min(d.y0, d.y1);
    this.drawSelection();
    const g = this.selectionGraphics;
    const zoom = this.scene.cameras.main.zoom;
    g.lineStyle(2 / zoom, 0xffffff, 1).fillStyle(0xffffff, 0.15);
    g.fillRect(x, y, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
    g.strokeRect(x, y, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
  }

  /** What the create tools would place at the cursor (drawn while hovering). */
  hoverPreview(tool, layer, wx, wy) {
    if (this.drag) return;
    const g = this.view;
    if (tool === 'sprite' && layer) {
      const sprite = this.spriteFromStamp();
      if (sprite) {
        const x = this.snapValue(wx - sprite.width / 2);
        const y = this.snapValue(wy + sprite.height / 2);
        g.drawPreview({ px: { x, y: y - sprite.height, w: sprite.width, h: sprite.height }, stamp: { width: 1, height: 1, gids: [sprite.gid] }, color: 0x7dff6b });
        return;
      }
    }
    if (tool === 'point' && layer) {
      const x = this.snapValue(wx);
      const y = this.snapValue(wy);
      const r = 24;
      g.drawPreview({ px: { x: x - r, y: y - r, w: 2 * r, h: 2 * r }, color: layerKind(layer.name)?.color });
      return;
    }
    g.drawPreview(null);
  }

  // ---- creating ----------------------------------------------------------------------------

  addObject(layer, fields, label) {
    const obj = { id: this.doc.takeObjectId(), ...fields };
    layer.objects.push(obj);
    this.scene.history.push({
      label,
      undo: () => { const i = layer.objects.indexOf(obj); if (i >= 0) layer.objects.splice(i, 1); },
      redo: () => layer.objects.push(obj),
    });
    this.select(layer, obj);
    this.view.setDirty();
    this.scene.onObjectChanged();
    return obj;
  }

  placePoint(layer, wx, wy) {
    const x = this.snapValue(wx);
    const y = this.snapValue(wy);
    // Some layers (the player start) hold just one point: move it instead of adding a second one.
    if (layerKind(layer.name)?.single && layer.objects.length) {
      const o = layer.objects[0];
      const before = { x: o.x, y: o.y };
      Object.assign(o, { x, y });
      this.scene.history.push(changeCommand(o, before, { x, y }, 'move point'));
      this.select(layer, o);
      this.view.setDirty();
      this.scene.onObjectChanged();
      return;
    }
    this.addObject(layer, { height: 0, name: '', point: true, rotation: 0, type: '', visible: true, width: 0, x, y }, 'add point');
  }

  /** The first tile of the palette selection, as a placeable image. */
  spriteFromStamp() {
    const stamp = this.scene.stamp;
    const gid = stamp?.gids.find(Boolean);
    const ts = gid ? this.doc.tilesetForGid(gid) : null;
    if (!ts) return null;
    return { gid, width: ts.tilewidth, height: ts.tileheight, tileset: ts };
  }

  placeSprite(layer, wx, wy) {
    const sprite = this.spriteFromStamp();
    if (!sprite) {
      this.scene.ui.say('Pick an image in the Tiles panel first (use + Asset to add any sprite)', 'bad');
      return;
    }
    // The cursor is the centre of the image; Tiled stores tile objects by their bottom-left corner.
    this.addObject(layer, {
      gid: sprite.gid,
      height: sprite.height,
      name: '',
      rotation: 0,
      type: '',
      visible: true,
      width: sprite.width,
      x: this.snapValue(wx - sprite.width / 2),
      y: this.snapValue(wy + sprite.height / 2),
    }, 'place sprite');
  }

  // ---- editing -----------------------------------------------------------------------------

  deleteSelected() {
    const s = this.selected;
    if (!s) return false;
    const { layer, obj } = s;
    const index = layer.objects.indexOf(obj);
    if (index < 0) return false;
    layer.objects.splice(index, 1);
    this.scene.history.push({
      label: 'delete object',
      undo: () => layer.objects.splice(index, 0, obj),
      redo: () => { const i = layer.objects.indexOf(obj); if (i >= 0) layer.objects.splice(i, 1); },
    });
    this.select(null);
    this.view.setDirty();
    this.scene.onObjectChanged();
    return true;
  }

  /** Applies a field typed into the object panel (name, type, x, y, width, height). */
  setField(field, value) {
    const s = this.selected;
    if (!s) return;
    const o = s.obj;
    const numeric = ['x', 'y', 'width', 'height'].includes(field);
    let v = value;
    if (numeric) {
      v = Number(value);
      if (!Number.isFinite(v)) return;
      if ((field === 'width' || field === 'height') && v < 1) return;
      v = round(v);
    }
    if (o[field] === v) return;
    const before = { [field]: o[field] };
    const after = { [field]: v };
    Object.assign(o, after);
    this.scene.history.push(changeCommand(o, before, after, `change ${field}`));
    this.view.setDirty();
    this.scene.onObjectChanged();
  }

  /** A short description of the selected object for the panel title. */
  static describe(layer, obj) {
    const shape = ObjectLayer.shapeOf(obj);
    if (shape === 'tile') {
      return `Sprite (${plainGid(obj.gid)})`;
    }
    return { point: 'Point', rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon' }[shape];
  }

  destroy() {
    this.selectionGraphics.destroy();
  }
}
