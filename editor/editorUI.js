// The editor's panels are plain HTML laid over the game canvas (much easier to build and style than
// Phaser text/buttons). They live in one container that is removed when the editor scene shuts down.

import { TileLayer } from './mapModel.js';
import { MAP_LAYERS } from '../mapConventions.js';

const CSS = `
#map-editor-ui { position: fixed; inset: 0; pointer-events: none; font: 13px/1.35 system-ui, sans-serif; color: #e8e8e8; z-index: 10; }
#map-editor-ui .panel { position: absolute; background: rgba(24, 28, 36, 0.92); border: 1px solid #3a4150; border-radius: 6px; pointer-events: auto; }
#map-editor-ui .top { left: 8px; right: 8px; top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 10px; }
#map-editor-ui .top .title { font-weight: 600; margin-right: 4px; }
#map-editor-ui .top .name { color: #9fb3c8; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#map-editor-ui .top .sep { width: 1px; align-self: stretch; background: #3a4150; margin: 0 4px; }
#map-editor-ui button { background: #2c3444; color: #e8e8e8; border: 1px solid #4a5468; border-radius: 4px; padding: 4px 10px; cursor: pointer; font: inherit; }
#map-editor-ui button:hover { background: #3a4458; }
#map-editor-ui button:disabled { opacity: .4; cursor: default; }
#map-editor-ui button.active { background: #3b5b8c; border-color: #6b8cc4; }
#map-editor-ui .layers { left: 8px; top: 56px; width: 250px; max-height: calc(100vh - 110px); display: flex; flex-direction: column; }
#map-editor-ui .layers h3 { margin: 0; padding: 8px 10px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #9fb3c8; border-bottom: 1px solid #3a4150; }
#map-editor-ui .layer-tools { display: flex; gap: 4px; padding: 6px; border-bottom: 1px solid #3a4150; }
#map-editor-ui .layer-tools button { padding: 3px 7px; white-space: nowrap; }
#map-editor-ui .layer-list { overflow-y: auto; padding: 4px; }
#map-editor-ui .layer { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px; cursor: pointer; }
#map-editor-ui .layer:hover { background: #2c3444; }
#map-editor-ui .layer.selected { background: #3b5b8c; }
#map-editor-ui .layer .lname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#map-editor-ui .layer input.rename { flex: 1; min-width: 0; background: #1d2230; color: #fff; border: 1px solid #6b8cc4; border-radius: 3px; font: inherit; padding: 1px 4px; }
#map-editor-ui .layer .kind { font-size: 10px; color: #9fb3c8; border: 1px solid #4a5468; border-radius: 3px; padding: 0 4px; }
#map-editor-ui .layer .count { font-size: 11px; color: #7f8da0; }
#map-editor-ui .toolbox { display: contents; }
#map-editor-ui .menu { position: absolute; left: 6px; top: 72px; width: 300px; background: #1d2230; border: 1px solid #4a5468; border-radius: 6px; padding: 4px; z-index: 5; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
#map-editor-ui .menu .item { padding: 6px 8px; border-radius: 4px; cursor: pointer; }
#map-editor-ui .menu .item:hover { background: #2c3444; }
#map-editor-ui .menu .item .d { font-size: 11px; color: #7f8da0; }
#map-editor-ui .menu .item.exists { opacity: .55; }
#map-editor-ui .swatch { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
#map-editor-ui .props { right: 8px; bottom: 50px; width: 300px; padding-bottom: 6px; }
#map-editor-ui .props h3 { margin: 0; padding: 8px 10px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #9fb3c8; border-bottom: 1px solid #3a4150; }
#map-editor-ui .props .grid { display: grid; grid-template-columns: 60px 1fr 60px 1fr; gap: 6px 8px; padding: 8px 10px 4px; align-items: center; }
#map-editor-ui .props label { color: #9fb3c8; font-size: 12px; }
#map-editor-ui .props input { min-width: 0; background: #2c3444; color: #e8e8e8; border: 1px solid #4a5468; border-radius: 4px; padding: 3px 6px; font: inherit; }
#map-editor-ui .props .wide { grid-column: 2 / 5; }
#map-editor-ui .props .row { display: flex; justify-content: space-between; align-items: center; padding: 4px 10px 0; color: #7f8da0; font-size: 11px; }
#map-editor-ui.has-props .palette { max-height: calc(100vh - 330px); }
#map-editor-ui .status { left: 8px; right: 8px; bottom: 8px; padding: 5px 10px; display: flex; gap: 18px; color: #b8c4d2; }
#map-editor-ui .status .message { margin-left: auto; color: #ffd24a; }
#map-editor-ui .status .message.ok { color: #7dff6b; }
#map-editor-ui .status .message.bad { color: #ff7b7b; }
`;

export const TOOLS = [
  { id: 'brush', label: 'Brush', key: 'B' },
  { id: 'eraser', label: 'Eraser', key: 'E' },
  { id: 'rect', label: 'Rectangle', key: 'R' },
  { id: 'fill', label: 'Fill', key: 'F' },
  { id: 'pick', label: 'Pick', key: 'I' },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export default class EditorUI {
  /**
   * @param {object} handlers  onNew, onOpen, onSave, onSaveAs, onBack, onVerify, onToggleGrid, onFit, onTool(id), onUndo, onRedo,
   *   onLayerVisibility(layer, visible), onSelectLayer(layer), onAddLayer, onDeleteLayer, onMoveLayer(delta),
   *   onRenameLayer(layer, name), onAddObjectLayer(kindKey | null), onToggleSnap, onObjectField(field, value),
   *   onDeleteObject
   */
  constructor(handlers) {
    this.handlers = handlers;
    this.style = el('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.root = el('div');
    this.root.id = 'map-editor-ui';

    const top = el('div', 'panel top');
    top.appendChild(el('span', 'title', 'Map Editor'));
    this.nameLabel = el('span', 'name', '');
    top.appendChild(this.nameLabel);
    top.appendChild(this.button('Open', () => handlers.onOpen(), 'Open or create a map (Ctrl+O)'));
    top.appendChild(this.button('Save', () => handlers.onSave(), 'Ctrl+S'));
    top.appendChild(this.button('Save as', () => handlers.onSaveAs(), 'Save under a new name (Ctrl+Shift+S)'));
    top.appendChild(el('span', 'sep'));
    // The tool buttons change with the selected layer: tile tools or object tools (see setToolSet).
    this.toolBox = el('span', 'toolbox');
    this.toolButtons = {};
    top.appendChild(this.toolBox);
    this.snapButton = this.button('Snap (N)', () => handlers.onToggleSnap(), 'Snap objects to a half-tile (32 px) grid');
    top.appendChild(this.snapButton);
    top.appendChild(el('span', 'sep'));
    this.undoButton = this.button('Undo', () => handlers.onUndo());
    this.undoButton.title = 'Ctrl+Z';
    this.redoButton = this.button('Redo', () => handlers.onRedo());
    this.redoButton.title = 'Ctrl+Y or Ctrl+Shift+Z';
    top.append(this.undoButton, this.redoButton, el('span', 'sep'));
    top.appendChild(this.button('Fit (Home)', () => handlers.onFit()));
    top.appendChild(this.button('Grid (G)', () => handlers.onToggleGrid()));
    top.appendChild(this.button('Verify', () => handlers.onVerify()));
    top.appendChild(this.button('Back to menu', () => handlers.onBack()));

    const layers = el('div', 'panel layers');
    layers.appendChild(el('h3', '', 'Layers'));
    const tools = el('div', 'layer-tools');
    tools.append(
      this.button('+ Tiles', () => handlers.onAddLayer(), 'Add a tile layer above the selected one'),
      this.objectMenuButton = this.button('+ Objects', () => this.toggleObjectMenu(), 'Add an object layer (collision, gold mines, spawns, ...)'),
      this.button('Delete', () => handlers.onDeleteLayer(), 'Delete the selected layer (can be undone)'),
      this.button('▲', () => handlers.onMoveLayer(1), 'Move up (drawn on top of more layers)'),
      this.button('▼', () => handlers.onMoveLayer(-1), 'Move down'),
    );
    layers.appendChild(tools);
    this.layerList = el('div', 'layer-list');
    layers.appendChild(this.layerList);
    this.layersPanel = layers;

    this.props = this.buildObjectPanel();

    const status = el('div', 'panel status');
    this.cursorLabel = el('span', '', '');
    this.hoverLabel = el('span', '', '');
    this.zoomLabel = el('span', '', '');
    this.message = el('span', 'message', '');
    status.append(this.cursorLabel, this.hoverLabel, this.zoomLabel, this.message);

    this.root.append(top, layers, this.props, status);
    document.body.appendChild(this.root);
  }

  button(label, onClick, title) {
    const b = el('button', '', label);
    if (title) b.title = title;
    b.addEventListener('click', onClick);
    return b;
  }

  setMapName(name, modified = false) {
    this.nameLabel.textContent = name + (modified ? '  ● unsaved' : '');
    this.nameLabel.title = name;
  }

  /** Shows a set of tool buttons (tile tools or object tools). */
  setToolSet(tools, activeId) {
    if (this.toolSet !== tools) {
      this.toolSet = tools;
      this.toolBox.replaceChildren();
      this.toolButtons = {};
      for (const tool of tools) {
        const b = this.button(`${tool.label} (${tool.key})`, () => this.handlers.onTool(tool.id));
        this.toolButtons[tool.id] = b;
        this.toolBox.appendChild(b);
      }
    }
    this.setTool(activeId);
  }

  setTool(id) {
    for (const [toolId, b] of Object.entries(this.toolButtons)) b.classList.toggle('active', toolId === id);
  }

  setSnap(on, visible) {
    this.snapButton.classList.toggle('active', on);
    this.snapButton.style.display = visible ? '' : 'none';
  }

  // ---- "+ Objects" menu ----------------------------------------------------------------------

  toggleObjectMenu(existingNames = this.layerNames ?? []) {
    if (this.objectMenu) {
      this.objectMenu.remove();
      this.objectMenu = null;
      return;
    }
    const menu = el('div', 'menu');
    const add = (key, label, description, color, exists) => {
      const item = el('div', 'item' + (exists ? ' exists' : ''));
      const title = el('div');
      if (color !== undefined) {
        const sw = el('span', 'swatch');
        sw.style.background = `#${color.toString(16).padStart(6, '0')}`;
        title.appendChild(sw);
      }
      title.appendChild(document.createTextNode(label + (exists ? ' (already in the map: select it)' : '')));
      item.append(title, el('div', 'd', description));
      item.addEventListener('click', () => {
        this.toggleObjectMenu();
        this.handlers.onAddObjectLayer(key);
      });
      menu.appendChild(item);
    };
    for (const [key, kind] of Object.entries(MAP_LAYERS)) add(key, kind.label, kind.description, kind.color, existingNames.includes(kind.name));
    add(null, 'Other objects', 'An empty object layer with a name of your choice (double-click to rename)', undefined, false);
    this.layersPanel.appendChild(menu);
    this.objectMenu = menu;
  }

  // ---- object properties ---------------------------------------------------------------------

  buildObjectPanel() {
    const panel = el('div', 'panel props');
    panel.style.display = 'none';
    this.propsTitle = el('h3', '', 'Object');
    const grid = el('div', 'grid');
    this.fields = {};
    const field = (name, label, wide) => {
      const l = el('label', '', label);
      const input = el('input');
      input.type = 'text';
      if (wide) input.className = 'wide';
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.value = input.dataset.value ?? ''; input.blur(); }
        e.stopPropagation();
      });
      input.addEventListener('change', () => this.handlers.onObjectField(name, input.value));
      grid.append(l, input);
      this.fields[name] = { label: l, input };
    };
    field('name', 'Name', true);
    field('type', 'Type', true);
    field('x', 'X');
    field('y', 'Y');
    field('width', 'Width');
    field('height', 'Height');
    const row = el('div', 'row');
    this.propsInfo = el('span', '', '');
    row.append(this.propsInfo, this.button('Delete (Del)', () => this.handlers.onDeleteObject()));
    panel.append(this.propsTitle, grid, row);
    return panel;
  }

  /** Shows the selected object's fields, or hides the panel. */
  showObject(info) {
    this.root.classList.toggle('has-props', !!info);
    if (!info) {
      this.props.style.display = 'none';
      return;
    }
    this.props.style.display = '';
    this.propsTitle.textContent = `${info.title} · ${info.layerName}`;
    this.propsInfo.textContent = `id ${info.obj.id}`;
    for (const [name, { label, input }] of Object.entries(this.fields)) {
      const hidden = (name === 'width' || name === 'height') && info.isPoint;
      label.style.display = input.style.display = hidden ? 'none' : '';
      const value = info.obj[name] ?? '';
      // Do not overwrite what the user is typing.
      if (document.activeElement !== input) input.value = value;
      input.dataset.value = value;
    }
  }

  setHistory(canUndo, canRedo) {
    this.undoButton.disabled = !canUndo;
    this.redoButton.disabled = !canRedo;
  }

  /** Rebuilds the layer list. The top of the list is the layer drawn on top. */
  setLayers(layers, selected) {
    this.layerNames = layers.map(l => l.name);
    this.layerList.replaceChildren();
    [...layers].reverse().forEach(layer => {
      const row = el('div', 'layer' + (layer === selected ? ' selected' : ''));
      const eye = el('input');
      eye.type = 'checkbox';
      eye.checked = layer.visible;
      eye.title = 'Show / hide';
      eye.addEventListener('click', e => e.stopPropagation());
      eye.addEventListener('change', () => this.handlers.onLayerVisibility(layer, eye.checked));
      row.appendChild(eye);
      const name = el('span', 'lname', layer.name);
      name.title = 'Double-click to rename';
      name.addEventListener('dblclick', e => { e.stopPropagation(); this.startRename(row, name, layer); });
      row.appendChild(name);
      if (layer instanceof TileLayer) {
        row.appendChild(el('span', 'count', `${layer.nonEmptyChunks().length} ch`));
        row.appendChild(el('span', 'kind', 'tiles'));
      } else {
        if (layer.props.type === 'objectgroup') row.appendChild(el('span', 'count', `${layer.props.objects?.length ?? 0} obj`));
        row.appendChild(el('span', 'kind', layer.props.type === 'objectgroup' ? 'objects' : layer.props.type));
      }
      row.addEventListener('click', () => this.handlers.onSelectLayer(layer));
      this.layerList.appendChild(row);
    });
  }

  startRename(row, label, layer) {
    const input = el('input', 'rename');
    input.value = layer.name;
    row.replaceChild(input, label);
    input.focus();
    input.select();
    let done = false;
    const finish = commit => {
      if (done) return;
      done = true;
      if (commit && input.value.trim() && input.value !== layer.name) this.handlers.onRenameLayer(layer, input.value);
      else row.replaceChild(label, input);
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
      e.stopPropagation();
    });
    input.addEventListener('blur', () => finish(true));
  }

  setCursor(text) { this.cursorLabel.textContent = text; }
  setHover(text) { this.hoverLabel.textContent = text; }
  setZoom(zoom) { this.zoomLabel.textContent = `zoom ${Math.round(zoom * 100)}%`; }

  say(text, kind = '') {
    this.message.textContent = text;
    this.message.className = 'message ' + kind;
  }

  destroy() {
    this.root.remove();
    this.style.remove();
  }
}
