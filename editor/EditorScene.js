// The in-game map editor. It is completely separate from the game: it only knows about the map file
// format (editor/mapModel.js) and the tileset images, never about units, waves or entities.
//
// Controls
//   Tile layers:   B brush, E eraser, R rectangle, F fill, I pick (Alt + click also picks)
//   Object layers: V select/move (drag the corner handle to resize), R rectangle, P point, T sprite,
//                  N snap on/off, Delete removes the selected object, Esc deselects
//   Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo, Ctrl+S save, Ctrl+Shift+S save as, Ctrl+O open
//   Mouse wheel zoom; middle/right drag, Space + left drag, arrows or WASD pan
//   G grid on/off, Home fit the whole map

import { MapDocument, TileLayer, ObjectLayer, diffJson, plainGid, relativePath } from './mapModel.js';
import { MAP_LAYERS, layerKind } from '../mapConventions.js';
import ObjectTools, { OBJECT_TOOLS, defaultToolFor } from './objectTools.js';
import TileView from './tileView.js';
import EditorUI, { TOOLS } from './editorUI.js';
import Palette, { AssetBrowser } from './palette.js';
import History, { CellEdit } from './history.js';
import { cellsOnLine, floodFillCells, stampTileAt } from './paint.js';
import { MapStore, OpenDialog, SaveAsDialog, toMapFileName } from './fileDialogs.js';

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 3;
const KEY_PAN_SPEED = 900; // screen px per second
const ERASE_STAMP = { width: 1, height: 1, gids: [0] };

const DEFAULT_MAP = 'map.tmj';
const UNTITLED = 'maps/untitled.tmj';

export default class EditorScene extends Phaser.Scene {
  constructor() {
    super({ key: 'EditorScene' });
  }

  /**
   * @param {object} data  mapUrl: map to open (project-relative, e.g. "maps/island.tmj");
   *   newMap: start an empty map; fileJson: the contents of a .tmj file opened from disk.
   */
  init(data) {
    this.mapUrl = (data?.mapUrl ?? DEFAULT_MAP).replace(/^\.\//, '');
    this.newMap = !!data?.newMap;
    this.fileJson = data?.fileJson ?? null;
    this.untitled = this.newMap || !!data?.untitled;
    this.saving = false;
    this.ready = false;
    this.panning = false;
    this.selectedLayer = null;
    this.tool = 'brush';        // tool used on tile layers
    this.objectTool = 'select'; // tool used on object layers
    this.hoverWorld = null;
    this.stamp = null;
    this.stroke = null;   // CellEdit while a brush/eraser drag is in progress
    this.rectStart = null; // first corner while dragging a rectangle
    this.lastCell = null;
    this.hoverCell = null;
    this.modified = false;
  }

  preload() {
    // The map is fetched as plain JSON; a reopened editor must not get a stale cached copy.
    // A new map starts from the default map's layers and tilesets (see MapDocument.emptyCopy).
    this.cache.json.remove('editor-map');
    if (!this.fileJson) this.load.json('editor-map', `${this.newMap ? DEFAULT_MAP : this.mapUrl}?t=${Date.now()}`);
    if (!this.cache.json.exists('editor-assets')) this.load.json('editor-assets', './editor/asset-manifest.json');
    // Icons for the special point layers (gold mines, enemy spawns, player start).
    const art = './Tiny Swords/Tiny Swords (Update 010)';
    if (!this.textures.exists('editor-icon-gold-mine')) this.load.image('editor-icon-gold-mine', `${art}/Resources/Gold Mine/GoldMine_Active.png`);
    if (!this.textures.exists('editor-icon-enemy')) this.load.spritesheet('editor-icon-enemy', `${art}/Factions/Enemy/Troops/Torch/Red/Torch_Red.png`, { frameWidth: 192, frameHeight: 192 });
    if (!this.textures.exists('editor-icon-castle')) this.load.image('editor-icon-castle', `${art}/Factions/Player/Buildings/Castle/Castle_Blue.png`);
  }

  create() {
    this.cameras.main.setBackgroundColor(0x1d2230);
    this.input.mouse.disableContextMenu();

    const loaded = this.fileJson ?? this.cache.json.get('editor-map');
    if (!loaded) {
      this.showFatal(`Could not load ${this.mapUrl}`);
      return;
    }
    this.manifest = this.cache.json.get('editor-assets') ?? null;
    if (this.newMap) {
      this.doc = MapDocument.fromJSON(loaded).emptyCopy();
      this.doc.rebaseImages(DEFAULT_MAP, UNTITLED);
      this.mapUrl = UNTITLED;
    } else {
      this.doc = MapDocument.fromJSON(loaded);
    }
    // What the file on disk looks like, to compare against ("Verify").
    this.sourceJson = JSON.parse(JSON.stringify(this.newMap ? this.doc : loaded));
    this.store = new MapStore();
    this.store.detect().then(mode => {
      if (mode === 'download') this.ui?.say('This browser cannot write files: Save will download the map (use Chrome/Edge, or run node tools/editor-server.mjs)', '');
    });
    this.view = new TileView(this, this.doc, this.mapUrl);
    this.history = new History(() => this.onHistoryChange());
    this.objects = new ObjectTools(this);

    this.ui = new EditorUI({
      onNew: () => this.confirmDiscard() && this.scene.restart({ newMap: true }),
      onOpen: () => this.openDialog(),
      onSave: () => this.save(),
      onSaveAs: () => this.saveAsDialog(),
      onBack: () => this.leave(),
      onFit: () => this.fitMap(),
      onToggleGrid: () => this.toggleGrid(),
      onVerify: () => this.verifyRoundTrip(),
      onTool: id => this.setTool(id),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onLayerVisibility: (layer, visible) => { layer.visible = visible; this.view.setDirty(); },
      onSelectLayer: layer => this.selectLayer(layer),
      onAddLayer: () => this.addLayer(),
      onDeleteLayer: () => this.deleteLayer(),
      onMoveLayer: delta => this.moveLayer(delta),
      onRenameLayer: (layer, name) => this.renameLayer(layer, name),
      onAddObjectLayer: key => this.addObjectLayer(key),
      onToggleSnap: () => this.toggleSnap(),
      onObjectField: (field, value) => this.objects.setField(field, value),
      onDeleteObject: () => this.objects.deleteSelected(),
    });
    this.palette = new Palette(this.ui.root, {
      imageUrl: ts => this.view.imageUrl(ts),
      onStamp: stamp => this.onStamp(stamp),
      onOpenAssets: () => this.openAssetBrowser(),
    });
    this.updateTitle();
    this.selectedLayer = this.doc.tileLayers().at(-1) ?? this.doc.layers.at(-1) ?? null;
    this.refreshLayers();
    this.refreshToolbar();
    this.ui.setHistory(false, false);
    this.ui.say('Loading tilesets...');

    this.bindInput();
    this.events.once('shutdown', () => this.cleanup());

    // Load the tileset images, then slice them into tiles.
    this.view.queueTilesets();
    this.load.once('complete', () => {
      this.view.sliceFrames();
      this.ready = true;
      this.palette.setTilesets(this.doc.tilesets);
      this.openingView();
      this.ui.say(this.newMap ? 'New empty map, with the same layers and tilesets as the game map' : `${this.doc.layers.length} layers loaded`, 'ok');
    });
    this.load.start();
  }

  // ---- input ---------------------------------------------------------------------------------

  bindInput() {
    // Held keys for panning. Capture is off so typing in the editor's text boxes still works.
    this.keys = this.input.keyboard.addKeys({
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D', space: 'SPACE',
    }, false);

    // One-shot shortcuts are read from the page so Ctrl combinations and text boxes can be handled.
    this.onKeyDown = e => {
      if (this.isTyping()) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 's') { e.preventDefault(); if (e.shiftKey) this.saveAsDialog(); else this.save(); return; }
      if ((e.ctrlKey || e.metaKey) && key === 'o') { e.preventDefault(); this.openDialog(); return; }
      if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && key === 'y') { e.preventDefault(); this.redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (key === 'g') this.toggleGrid();
      else if (e.key === 'Home') this.fitMap();
      else if (key === 'n' && this.objectMode) this.toggleSnap();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && this.objectMode) { e.preventDefault(); this.objects.deleteSelected(); }
      else if (e.key === 'Escape') this.objects.select(null);
      else {
        const tool = (this.objectMode ? OBJECT_TOOLS : TOOLS).find(t => t.key.toLowerCase() === key);
        if (tool) this.setTool(tool.id);
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
    // Warn before closing or reloading the tab with unsaved changes.
    this.onBeforeUnload = e => { if (this.modified) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', this.onBeforeUnload);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
    this.input.on('wheel', this.onWheel, this);
    this.input.on('gameout', () => this.view?.drawPreview(null));
  }

  isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
  }

  onPointerDown(pointer) {
    if (!this.ready) return;
    const wantsPan = pointer.middleButtonDown() || pointer.rightButtonDown()
      || (pointer.leftButtonDown() && this.keys.space.isDown);
    if (wantsPan) {
      this.panning = true;
      this.panStart = { x: pointer.x, y: pointer.y, scrollX: this.cameras.main.scrollX, scrollY: this.cameras.main.scrollY };
      return;
    }
    if (!pointer.leftButtonDown()) return;
    // Clicking the map takes the keyboard focus away from any text box in the panels.
    if (this.isTyping()) document.activeElement.blur();

    if (this.objectMode) {
      const world = this.screenToWorld(pointer.x, pointer.y);
      const layer = this.selectedLayer;
      if (this.objectTool !== 'select' && !layer.visible) {
        this.ui.say(`"${layer.name}" is hidden. Show it before adding objects to it`, 'bad');
        return;
      }
      this.objects.onDown(this.objectTool, layer, world.x, world.y);
      return;
    }

    const cell = this.cellAt(pointer);
    if (this.tool === 'pick' || pointer.event.altKey) {
      this.pick(cell);
      return;
    }
    const layer = this.paintableLayer();
    if (!layer) return;

    if (this.tool === 'brush' || this.tool === 'eraser') {
      this.stroke = new CellEdit(layer, this.tool === 'brush' ? 'Paint' : 'Erase');
      this.lastCell = cell;
      this.applyStampAt(cell.x, cell.y);
    } else if (this.tool === 'rect') {
      this.rectStart = cell;
    } else if (this.tool === 'fill') {
      this.fill(layer, cell);
    }
    this.updatePreview(cell);
  }

  onPointerMove(pointer) {
    const cam = this.cameras.main;
    if (this.panning) {
      if (!pointer.isDown) { this.onPointerUp(pointer); return; } // the release happened outside the window
      cam.scrollX = this.panStart.scrollX - (pointer.x - this.panStart.x) / cam.zoom;
      cam.scrollY = this.panStart.scrollY - (pointer.y - this.panStart.y) / cam.zoom;
    }
    if (!this.ready) return;
    const cell = this.cellAt(pointer);
    this.hoverWorld = this.screenToWorld(pointer.x, pointer.y);

    if (this.objects.drag) {
      if (!pointer.leftButtonDown()) this.onPointerUp(pointer); // released outside the window
      else this.objects.onMove(this.hoverWorld.x, this.hoverWorld.y);
    } else if ((this.stroke || this.rectStart) && !pointer.leftButtonDown()) {
      this.onPointerUp(pointer); // the release happened outside the window
    } else if (this.stroke && (cell.x !== this.lastCell.x || cell.y !== this.lastCell.y)) {
      // Paint every cell between the last position and this one so fast strokes have no gaps.
      for (const [x, y] of cellsOnLine(this.lastCell.x, this.lastCell.y, cell.x, cell.y).slice(1)) this.applyStampAt(x, y);
      this.lastCell = cell;
    }
    this.updateCursorInfo(cell);
    this.updatePreview(cell);
  }

  onPointerUp(pointer) {
    this.panning = false;
    if (this.objects.drag) this.objects.onUp();
    if (this.stroke) {
      if (!this.stroke.isEmpty) this.history.push(this.stroke);
      this.stroke = null;
    }
    if (this.rectStart) {
      const end = this.cellAt(pointer);
      this.fillRect(this.rectStart, end);
      this.rectStart = null;
    }
    if (this.ready) this.updatePreview(this.cellAt(pointer));
  }

  onWheel(pointer, objects, dx, dy) {
    const cam = this.cameras.main;
    const before = this.screenToWorld(pointer.x, pointer.y);
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.88 : 1 / 0.88), MIN_ZOOM, MAX_ZOOM));
    // Keep the world point under the cursor fixed while zooming.
    cam.scrollX = before.x - cam.width / 2 - (pointer.x - cam.width / 2) / cam.zoom;
    cam.scrollY = before.y - cam.height / 2 - (pointer.y - cam.height / 2) / cam.zoom;
    this.ui.setZoom(cam.zoom);
    if (this.ready) {
      this.hoverWorld = this.screenToWorld(pointer.x, pointer.y);
      this.updatePreview(this.cellAt(pointer));
      this.objects.drawSelection(); // line widths depend on the zoom
    }
  }

  /** Screen position -> world position. (The camera zooms around its centre.) */
  screenToWorld(px, py) {
    const cam = this.cameras.main;
    return {
      x: (px - cam.width / 2) / cam.zoom + cam.scrollX + cam.width / 2,
      y: (py - cam.height / 2) / cam.zoom + cam.scrollY + cam.height / 2,
    };
  }

  cellAt(pointer) {
    const w = this.screenToWorld(pointer.x, pointer.y);
    return { x: Math.floor(w.x / this.view.tileW), y: Math.floor(w.y / this.view.tileH) };
  }

  updateCursorInfo(cell) {
    this.ui.setCursor(`tile ${cell.x}, ${cell.y}   chunk ${Math.floor(cell.x / 16)}, ${Math.floor(cell.y / 16)}`);
    const hit = this.view.tileAt(cell.x, cell.y);
    this.ui.setHover(hit ? `${hit.layer.name}: ${hit.tileset?.name ?? '?'} #${hit.index}` : 'empty');
  }

  updatePreview(cell) {
    this.hoverCell = cell;
    if (this.panning) { this.view.drawPreview(null); return; }
    if (this.objectMode) {
      if (this.hoverWorld) this.objects.hoverPreview(this.objectTool, this.selectedLayer, this.hoverWorld.x, this.hoverWorld.y);
      return;
    }
    if (this.rectStart) {
      const x = Math.min(this.rectStart.x, cell.x);
      const y = Math.min(this.rectStart.y, cell.y);
      this.view.drawPreview({ x, y, w: Math.abs(cell.x - this.rectStart.x) + 1, h: Math.abs(cell.y - this.rectStart.y) + 1, fillAlpha: 0.25 });
      return;
    }
    const stamp = this.tool === 'brush' ? this.stamp : null;
    const w = stamp?.width ?? 1;
    const h = stamp?.height ?? 1;
    const colors = { eraser: 0xff6b6b, pick: 0xffd24a };
    this.view.drawPreview({ x: cell.x, y: cell.y, w, h, stamp, color: colors[this.tool] });
  }

  // ---- painting ------------------------------------------------------------------------------

  /** The selected layer if it can be painted, otherwise null (with a message saying why). */
  paintableLayer() {
    const layer = this.selectedLayer;
    if (!(layer instanceof TileLayer)) {
      this.ui.say('Select a tile layer to paint on', 'bad');
      return null;
    }
    if (!layer.visible) {
      this.ui.say(`"${layer.name}" is hidden. Show it before painting on it`, 'bad');
      return null;
    }
    if (this.tool !== 'eraser' && !this.stamp) {
      this.ui.say('Pick a tile from the palette first', 'bad');
      return null;
    }
    return layer;
  }

  /** Brush/eraser: puts the current stamp with its top-left corner on (x, y). */
  applyStampAt(x, y) {
    const stamp = this.tool === 'eraser' ? ERASE_STAMP : this.stamp;
    let changed = false;
    for (let row = 0; row < stamp.height; row++) {
      for (let col = 0; col < stamp.width; col++) {
        changed = this.stroke.set(x + col, y + row, stamp.gids[row * stamp.width + col]) || changed;
      }
    }
    if (changed) this.view.setDirty();
  }

  /** Rectangle tool: fills the dragged rectangle, repeating a multi-tile stamp as a pattern. */
  fillRect(a, b) {
    const layer = this.paintableLayer();
    if (!layer) return;
    const x0 = Math.min(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const edit = new CellEdit(layer, 'Rectangle');
    for (let y = y0; y <= Math.max(a.y, b.y); y++) {
      for (let x = x0; x <= Math.max(a.x, b.x); x++) edit.set(x, y, stampTileAt(this.stamp, x0, y0, x, y));
    }
    this.commit(edit);
  }

  /** Fill tool: replaces the connected area of identical tiles under the cursor. */
  fill(layer, cell) {
    // The map is infinite, so the fill stays inside the painted area of the map plus what is on screen.
    const bounds = this.unionRect(this.view.mapBounds(), this.view.visibleTileRect());
    const cells = floodFillCells(layer, cell.x, cell.y, bounds);
    if (!cells) {
      this.ui.say('That area is too large to fill in one go. Zoom in or use the rectangle tool', 'bad');
      return;
    }
    const edit = new CellEdit(layer, 'Fill');
    for (const [x, y] of cells) edit.set(x, y, stampTileAt(this.stamp, cell.x, cell.y, x, y));
    this.commit(edit);
  }

  /** Pick tool: copies the tile under the cursor (from the selected layer, else the topmost one). */
  pick(cell) {
    let gid = this.selectedLayer instanceof TileLayer ? this.selectedLayer.getTile(cell.x, cell.y) : 0;
    if (!gid) gid = this.view.tileAt(cell.x, cell.y)?.gid ?? 0;
    const ts = gid ? this.doc.tilesetForGid(gid) : null;
    if (!ts) {
      this.ui.say('Nothing to pick there');
      return;
    }
    this.palette.selectTile(ts, plainGid(gid) - ts.firstgid); // also sets the stamp and switches to the brush
    this.ui.say(`Picked ${ts.name} #${plainGid(gid) - ts.firstgid}`, 'ok');
  }

  unionRect(a, b) {
    if (!a) return b;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
  }

  commit(edit) {
    if (edit.isEmpty) return;
    this.history.push(edit);
    this.view.setDirty();
  }

  /** True while an object layer is selected (the toolbar then shows the object tools). */
  get objectMode() {
    return this.selectedLayer instanceof ObjectLayer;
  }

  setTool(id) {
    if (this.objectMode) this.objectTool = id;
    else this.tool = id;
    this.refreshToolbar();
    if (this.hoverCell) this.updatePreview(this.hoverCell);
  }

  refreshToolbar() {
    if (this.objectMode) this.ui.setToolSet(OBJECT_TOOLS, this.objectTool);
    else this.ui.setToolSet(TOOLS, this.tool);
    this.ui.setSnap(this.objects.snap, this.objectMode);
  }

  toggleSnap() {
    this.objects.snap = !this.objects.snap;
    this.refreshToolbar();
    this.ui.say(this.objects.snap ? 'Snap on: objects snap to a 32 px grid' : 'Snap off: objects go exactly where you click');
  }

  /** A tile (or block) was picked in the palette. */
  onStamp(stamp) {
    this.stamp = stamp;
    if (this.objectMode) {
      // On a sprite layer (or any non-special object layer) picking an image means "place this".
      const shape = layerKind(this.selectedLayer.name)?.shape;
      if (!shape || shape === 'tile') this.setTool('sprite');
    } else if (this.tool === 'eraser' || this.tool === 'pick') {
      this.setTool('brush');
    }
  }

  // ---- objects -------------------------------------------------------------------------------

  onObjectSelected(selection) {
    if (!selection) {
      this.ui.showObject(null);
      return;
    }
    const { layer, obj } = selection;
    this.ui.showObject({
      title: ObjectTools.describe(layer, obj),
      layerName: layer.name,
      obj,
      isPoint: ObjectLayer.shapeOf(obj) === 'point',
    });
  }

  /** Something about an object changed: refresh the panel and the layer list's object counts. */
  onObjectChanged() {
    this.onObjectSelected(this.objects.selected);
    this.refreshLayers();
  }

  /** "+ Objects": adds one of the special object layers (or selects it if the map has it already). */
  addObjectLayer(key) {
    const kind = key ? MAP_LAYERS[key] : null;
    const existing = kind ? this.doc.getLayer(kind.name) : null;
    if (existing) {
      this.selectLayer(existing);
      this.ui.say(`Selected the existing "${existing.name}" layer`);
      return;
    }
    // Sprites sort with the layers around them, so they go above the selected layer; markers go on top.
    const index = kind && kind.shape !== 'tile'
      ? this.doc.layers.length
      : (this.selectedLayer ? this.doc.layers.indexOf(this.selectedLayer) + 1 : this.doc.layers.length);
    const layer = this.doc.addObjectLayer(kind?.name ?? 'objects', index);
    this.history.push({
      label: `add layer "${layer.name}"`,
      undo: () => this.doc.removeLayer(layer),
      redo: () => this.doc.insertLayer(layer, index),
    });
    this.selectLayer(layer);
    this.ui.say(kind ? `Added "${layer.name}": ${kind.description}` : `Added "${layer.name}". Double-click its name to rename it`, 'ok');
  }

  // ---- undo / redo ---------------------------------------------------------------------------

  undo() {
    if (this.stroke || this.rectStart || this.objects.drag) return; // finish the current stroke first
    const command = this.history.undo();
    if (command) this.afterHistoryStep(`Undid ${command.label}`);
  }

  redo() {
    if (this.stroke || this.rectStart || this.objects.drag) return;
    const command = this.history.redo();
    if (command) this.afterHistoryStep(`Redid ${command.label}`);
  }

  afterHistoryStep(message) {
    if (!this.doc.layers.includes(this.selectedLayer)) this.selectedLayer = this.doc.layers.at(-1) ?? null;
    this.objects.validateSelection();
    this.onObjectSelected(this.objects.selected);
    this.refreshToolbar();
    this.refreshLayers();
    this.view.setDirty();
    this.ui.say(message);
  }

  onHistoryChange() {
    this.modified = true;
    this.updateTitle();
    this.ui.setHistory(this.history.canUndo, this.history.canRedo);
  }

  updateTitle() {
    this.ui.setMapName(this.untitled ? 'untitled map' : this.mapUrl, this.modified);
  }

  // ---- files ---------------------------------------------------------------------------------

  /** True if there is nothing unsaved, or the user agrees to throw it away. */
  confirmDiscard() {
    return !this.modified || window.confirm('This map has unsaved changes. Discard them?');
  }

  async openDialog() {
    if (this.fileDialog) return;
    let maps;
    try {
      maps = await this.store.list();
    } catch (e) {
      this.ui.say(e.name === 'AbortError' ? 'Cancelled' : e.message, 'bad');
      return;
    }
    this.fileDialog = new OpenDialog(this.ui.root, {
      maps,
      canWrite: this.store.canWrite,
      note: this.store.describe(),
      currentPath: this.untitled ? null : this.mapUrl,
      onOpen: path => this.confirmDiscard() && this.scene.restart({ mapUrl: path }),
      onNew: () => this.confirmDiscard() && this.scene.restart({ newMap: true }),
      onOpenFile: (name, text) => this.openFromDisk(name, text),
    });
    this.fileDialog.onClose = () => { this.fileDialog = null; };
  }

  /** Opens a .tmj picked from disk. It is treated as unsaved until it is saved into the project. */
  openFromDisk(fileName, text) {
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      this.ui.say(`${fileName} is not a valid map file`, 'bad');
      return;
    }
    if (!Array.isArray(json.layers) || !json.tilewidth) {
      this.ui.say(`${fileName} does not look like a Tiled map`, 'bad');
      return;
    }
    if (!this.confirmDiscard()) return;
    // Image paths in the file are relative to where it was saved: "../Tiny Swords/..." means the maps folder.
    const inMapsFolder = (json.tilesets ?? []).some(ts => ts.image?.startsWith('../'));
    const name = toMapFileName(fileName) || 'imported';
    this.scene.restart({ mapUrl: inMapsFolder ? `maps/${name}.tmj` : `${name}.tmj`, fileJson: json, untitled: true });
  }

  async saveAsDialog() {
    if (this.fileDialog || this.saving) return;
    let maps = [];
    try {
      maps = await this.store.list();
    } catch (e) {
      if (e.name === 'AbortError') return; // the folder picker was cancelled
      this.ui.say(e.message, 'bad');
      return;
    }
    const current = this.mapUrl.split('/').pop().replace(/\.tmj$/, '');
    this.fileDialog = new SaveAsDialog(this.ui.root, {
      maps,
      canWrite: this.store.canWrite,
      note: this.store.describe(),
      suggestedName: this.newMap && this.untitled ? '' : current,
      onSave: path => this.writeMap(path),
    });
    this.fileDialog.onClose = () => { this.fileDialog = null; };
  }

  save() {
    if (this.saving) return;
    if (this.untitled) {
      this.saveAsDialog();
      return;
    }
    if (this.mapUrl === DEFAULT_MAP && this.store.canWrite && !this.confirmedDefaultOverwrite) {
      const ok = window.confirm('map.tmj is the map the game plays. Overwrite it? (The old version is kept in maps/.backup/.)\n\nChoose Cancel and use "Save as" to keep your changes as a separate map instead.');
      if (!ok) return;
      this.confirmedDefaultOverwrite = true;
    }
    this.writeMap(this.mapUrl);
  }

  /** Saves the map to `path`, rewriting tileset image paths if the map moves to another folder. */
  async writeMap(path) {
    if (this.saving) return;
    this.saving = true;
    const previous = this.mapUrl;
    if (path !== previous) this.doc.rebaseImages(previous, path);
    const json = JSON.parse(JSON.stringify(this.doc));
    this.ui.say(`Saving ${path}...`);
    try {
      const result = await this.store.save(path, json);
      this.mapUrl = path;
      this.view.mapUrl = path;
      this.untitled = false;
      this.modified = false;
      this.sourceJson = json;
      this.updateTitle();
      this.ui.say(result.downloaded
        ? `Downloaded ${path.split('/').pop()} to your Downloads folder. Move it into the project's maps/ folder`
        : `Saved ${path}`, 'ok');
    } catch (e) {
      if (path !== previous) this.doc.rebaseImages(path, previous);
      this.ui.say(e.name === 'AbortError' ? 'Save cancelled' : `Could not save: ${e.message}`, 'bad');
    } finally {
      this.saving = false;
    }
  }

  // ---- layers --------------------------------------------------------------------------------

  refreshLayers() {
    this.ui.setLayers(this.doc.layers, this.selectedLayer);
  }

  /** @param {object} [opts] keepTool: do not switch to the layer's usual tool (used when clicking an object). */
  selectLayer(layer, opts = {}) {
    const changed = layer !== this.selectedLayer;
    this.selectedLayer = layer;
    if (changed && !opts.keepTool) {
      this.objects.select(null);
      if (layer instanceof ObjectLayer) this.objectTool = defaultToolFor(layer);
    }
    this.refreshToolbar();
    this.refreshLayers();
    if (this.hoverCell) this.updatePreview(this.hoverCell);
  }

  addLayer() {
    const index = this.selectedLayer ? this.doc.layers.indexOf(this.selectedLayer) + 1 : this.doc.layers.length;
    const layer = this.doc.addTileLayer('Tile Layer', index);
    this.selectedLayer = layer;
    this.history.push({
      label: `add layer "${layer.name}"`,
      undo: () => this.doc.removeLayer(layer),
      redo: () => { this.doc.insertLayer(layer, index); this.selectedLayer = layer; },
    });
    this.refreshLayers();
    this.ui.say(`Added "${layer.name}". Double-click a layer name to rename it`, 'ok');
  }

  deleteLayer() {
    const layer = this.selectedLayer;
    if (!layer) return;
    const index = this.doc.removeLayer(layer);
    this.history.push({
      label: `delete layer "${layer.name}"`,
      undo: () => { this.doc.insertLayer(layer, index); this.selectedLayer = layer; },
      redo: () => this.doc.removeLayer(layer),
    });
    this.selectedLayer = this.doc.layers[Math.min(index, this.doc.layers.length - 1)] ?? null;
    this.objects.validateSelection();
    this.refreshToolbar();
    this.refreshLayers();
    this.view.setDirty();
    this.ui.say(`Deleted "${layer.name}" (Ctrl+Z to undo)`);
  }

  moveLayer(delta) {
    const layer = this.selectedLayer;
    if (!layer || !this.doc.moveLayer(layer, delta)) return;
    this.history.push({
      label: 'move layer',
      undo: () => this.doc.moveLayer(layer, -delta),
      redo: () => this.doc.moveLayer(layer, delta),
    });
    this.refreshLayers();
    this.view.setDirty();
  }

  renameLayer(layer, name) {
    const before = layer.name;
    const after = this.doc.renameLayer(layer, name);
    this.history.push({
      label: 'rename layer',
      undo: () => { layer.props.name = before; },
      redo: () => { layer.props.name = after; },
    });
    this.refreshLayers();
  }

  // ---- assets --------------------------------------------------------------------------------

  openAssetBrowser() {
    if (this.assetBrowser) return;
    const assetImage = a => relativePath(this.mapUrl, a.path);
    this.assetBrowser = new AssetBrowser(this.ui.root, this.manifest, {
      isInMap: a => !!this.doc.tilesetForImage(assetImage(a)),
      onPick: a => this.addAsset(a, assetImage(a)),
    });
    this.assetBrowser.onClose = () => { this.assetBrowser = null; };
  }

  /** Adds an art-pack image to the map as a tileset (cut into tiles as the manifest says) and selects it. */
  addAsset(asset, image) {
    const existing = this.doc.tilesetForImage(image);
    const ts = existing ?? this.doc.addTileset({
      name: asset.name,
      image,
      imageWidth: asset.width,
      imageHeight: asset.height,
      tileWidth: asset.tileWidth,
      tileHeight: asset.tileHeight,
    });
    if (!existing) {
      this.view.ensureTileset(ts);
      this.onHistoryChange(); // the map file changes even though this step is not undoable
    }
    this.palette.setTilesets(this.doc.tilesets, ts);
    this.ui.say(existing ? `"${ts.name}" is already in this map` : `Added "${ts.name}" (${ts.tilecount} tile${ts.tilecount > 1 ? 's' : ''})`, 'ok');
  }

  // ---- view ----------------------------------------------------------------------------------

  toggleGrid() {
    this.view.setGridVisible(!this.view.showGrid);
  }

  fitMap() {
    if (!this.view) return;
    const cam = this.cameras.main;
    const box = this.view.mapBounds();
    if (!box) {
      cam.setZoom(0.75);
      cam.centerOn(0, 0);
    } else {
      const w = box.width * this.view.tileW;
      const h = box.height * this.view.tileH;
      const zoom = Phaser.Math.Clamp(Math.min((cam.width - 600) / w, (cam.height - 120) / h), MIN_ZOOM, 1);
      cam.setZoom(zoom);
      cam.centerOn(box.x * this.view.tileW + w / 2, box.y * this.view.tileH + h / 2);
    }
    this.ui.setZoom(cam.zoom);
    this.view.setDirty();
  }

  /** The view the editor opens with: a comfortable 50% zoom on the middle of the map (not zoomed to fit). */
  openingView() {
    const cam = this.cameras.main;
    const box = this.view.mapBounds();
    cam.setZoom(0.5);
    const cx = box ? (box.x + box.width / 2) * this.view.tileW : 0;
    const cy = box ? (box.y + box.height / 2) * this.view.tileH : 0;
    cam.centerOn(cx, cy);
    this.ui.setZoom(cam.zoom);
    this.view.setDirty();
  }

  /** Saves the open map in memory and compares it with the file it came from. */
  verifyRoundTrip() {
    const saved = JSON.parse(JSON.stringify(this.doc));
    const diffs = diffJson(this.sourceJson, saved);
    if (!diffs.length) {
      this.ui.say('Round trip OK: saving would reproduce the file exactly', 'ok');
    } else if (this.modified) {
      this.ui.say(`The map has been edited, so it differs from the file in ${diffs.length}+ place(s)`, '');
    } else {
      console.warn('Round trip differences:', diffs);
      this.ui.say(`Round trip FAILED: ${diffs.length} difference(s), see the console`, 'bad');
    }
  }

  leave() {
    if (!this.confirmDiscard()) return;
    this.scene.start('StartScene');
  }

  showFatal(text) {
    this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, text, { color: '#ff8888', fontSize: '20px' }).setOrigin(0.5);
    this.input.once('pointerdown', () => this.scene.start('StartScene'));
  }

  // ---- frame loop ----------------------------------------------------------------------------

  update(time, delta) {
    if (!this.ready) return;
    const cam = this.cameras.main;
    const k = this.keys;
    if (!this.isTyping()) {
      const dx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      const dy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
      if (dx || dy) {
        const step = (KEY_PAN_SPEED * delta) / 1000 / cam.zoom;
        cam.scrollX += dx * step;
        cam.scrollY += dy * step;
      }
    }
    this.view.update();
  }

  cleanup() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    this.assetBrowser?.close();
    this.fileDialog?.close();
    this.palette?.destroy();
    this.objects?.destroy();
    this.ui?.destroy();
    this.view?.destroy();
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup', this.onPointerUp, this);
    this.input.off('pointerupoutside', this.onPointerUp, this);
    this.input.off('wheel', this.onWheel, this);
    this.input.off('gameout');
  }
}
