// The tile palette (right-hand panel) and the asset browser used to add any sprite in the art pack to
// the map as a new tileset. Plain HTML, like the rest of the editor's panels.

const CSS = `
#map-editor-ui .palette { right: 8px; top: 56px; width: 300px; max-height: calc(100vh - 110px); display: flex; flex-direction: column; }
#map-editor-ui .palette h3 { margin: 0; padding: 8px 10px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #9fb3c8; border-bottom: 1px solid #3a4150; }
#map-editor-ui .palette .row { display: flex; gap: 6px; padding: 6px 8px; align-items: center; }
#map-editor-ui .palette select { flex: 1; min-width: 0; background: #2c3444; color: #e8e8e8; border: 1px solid #4a5468; border-radius: 4px; padding: 3px; font: inherit; }
#map-editor-ui .palette .info { padding: 0 10px 6px; font-size: 11px; color: #7f8da0; }
#map-editor-ui .palette .sheet { overflow: auto; margin: 0 8px 8px; background: repeating-conic-gradient(#2a2f3a 0 25%, #232833 0 50%) 0 0 / 16px 16px; border-radius: 4px; min-height: 60px; }
#map-editor-ui .palette canvas { display: block; cursor: crosshair; image-rendering: pixelated; }
#map-editor-ui .assets-modal { position: fixed; inset: 40px 80px; display: flex; flex-direction: column; pointer-events: auto; background: rgba(20, 24, 31, 0.97); border: 1px solid #4a5468; border-radius: 8px; z-index: 20; }
#map-editor-ui .assets-modal .head { display: flex; gap: 8px; align-items: center; padding: 10px; border-bottom: 1px solid #3a4150; }
#map-editor-ui .assets-modal .head strong { margin-right: 8px; }
#map-editor-ui .assets-modal input { flex: 1; background: #2c3444; color: #e8e8e8; border: 1px solid #4a5468; border-radius: 4px; padding: 5px 8px; font: inherit; }
#map-editor-ui .assets-modal .grid { overflow-y: auto; padding: 10px; display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; align-content: start; }
#map-editor-ui .assets-modal .cat { grid-column: 1 / -1; color: #9fb3c8; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; margin-top: 6px; }
#map-editor-ui .assets-modal .card { background: #262c38; border: 1px solid #3a4150; border-radius: 6px; padding: 6px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; }
#map-editor-ui .assets-modal .card:hover { border-color: #6b8cc4; background: #2e3646; }
#map-editor-ui .assets-modal .card img { width: 100%; height: 72px; object-fit: contain; image-rendering: pixelated; }
#map-editor-ui .assets-modal .card .n { font-size: 11px; text-align: center; word-break: break-word; }
#map-editor-ui .assets-modal .card .s { font-size: 10px; color: #7f8da0; }
#map-editor-ui .assets-modal .card.in-map { border-color: #4f7a4f; }
#map-editor-ui .assets-modal .empty { padding: 20px; color: #ff9b9b; }
`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export default class Palette {
  /**
   * @param {HTMLElement} root  the editor's UI container
   * @param {object} opts  imageUrl(tileset) -> url, onStamp(stamp), onOpenAssets()
   */
  constructor(root, opts) {
    this.opts = opts;
    this.tilesets = [];
    this.tileset = null;
    this.selection = null; // { col, row, w, h } in tiles

    this.style = el('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.panel = el('div', 'panel palette');
    this.panel.appendChild(el('h3', '', 'Tiles'));
    const row = el('div', 'row');
    this.select = el('select');
    this.select.addEventListener('change', () => this.showTileset(this.tilesets[+this.select.value]));
    const add = el('button', '', '+ Asset');
    add.title = 'Add any sprite from the art pack to this map';
    add.addEventListener('click', () => opts.onOpenAssets());
    row.append(this.select, add);
    this.info = el('div', 'info', '');
    this.sheet = el('div', 'sheet');
    this.canvas = el('canvas');
    this.sheet.appendChild(this.canvas);
    this.panel.append(row, this.info, this.sheet);
    root.appendChild(this.panel);

    this.bindCanvas();
  }

  setTilesets(tilesets, keep = this.tileset) {
    this.tilesets = tilesets.filter(ts => ts.image);
    this.select.replaceChildren(...this.tilesets.map((ts, i) => {
      const o = el('option', '', ts.name);
      o.value = i;
      return o;
    }));
    const index = Math.max(0, this.tilesets.indexOf(keep));
    if (this.tilesets.length) this.showTileset(this.tilesets[index]);
  }

  /** Shows a tileset; `select` optionally picks a tile rectangle in it. */
  showTileset(ts, select = { col: 0, row: 0, w: 1, h: 1 }) {
    if (!ts) return;
    this.tileset = ts;
    this.select.value = this.tilesets.indexOf(ts);
    const rows = Math.ceil(ts.tilecount / ts.columns);
    this.info.textContent = `${ts.tilewidth}×${ts.tileheight} px tiles, ${ts.columns}×${rows} (${ts.tilecount})`;

    // Show tiles at a readable size: fit the panel width when possible, but never tiny.
    const biggest = Math.max(ts.tilewidth, ts.tileheight);
    this.scale = Math.max(24 / biggest, Math.min(48 / biggest, 280 / ts.imagewidth));
    this.canvas.width = Math.round(ts.imagewidth * this.scale);
    this.canvas.height = Math.round(ts.imageheight * this.scale);

    this.image = new Image();
    this.image.onload = () => this.draw();
    this.image.src = this.opts.imageUrl(ts);
    this.selectRect(select.col, select.row, select.w, select.h);
  }

  /** Selects a tile by its local index (used by the picker). */
  selectTile(ts, index) {
    if (ts !== this.tileset) this.showTileset(ts, { col: index % ts.columns, row: Math.floor(index / ts.columns), w: 1, h: 1 });
    else this.selectRect(index % ts.columns, Math.floor(index / ts.columns), 1, 1);
    this.selection && this.scrollToSelection();
  }

  selectRect(col, row, w, h) {
    const ts = this.tileset;
    const rows = Math.ceil(ts.tilecount / ts.columns);
    col = Math.max(0, Math.min(col, ts.columns - 1));
    row = Math.max(0, Math.min(row, rows - 1));
    w = Math.max(1, Math.min(w, ts.columns - col));
    h = Math.max(1, Math.min(h, rows - row));
    this.selection = { col, row, w, h };
    this.draw();

    const gids = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const index = (row + y) * ts.columns + (col + x);
        gids.push(index < ts.tilecount ? ts.firstgid + index : 0);
      }
    }
    this.opts.onStamp({ tileset: ts, width: w, height: h, gids });
  }

  scrollToSelection() {
    const s = this.selection;
    const ts = this.tileset;
    this.sheet.scrollLeft = s.col * ts.tilewidth * this.scale - 40;
    this.sheet.scrollTop = s.row * ts.tileheight * this.scale - 40;
  }

  draw() {
    const ts = this.tileset;
    if (!ts) return;
    const ctx = this.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.image?.complete && this.image.naturalWidth) {
      ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
    }
    const tw = ts.tilewidth * this.scale;
    const th = ts.tileheight * this.scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    for (let x = 1; x < ts.columns; x++) { ctx.beginPath(); ctx.moveTo(x * tw + 0.5, 0); ctx.lineTo(x * tw + 0.5, this.canvas.height); ctx.stroke(); }
    const rows = Math.ceil(ts.tilecount / ts.columns);
    for (let y = 1; y < rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * th + 0.5); ctx.lineTo(this.canvas.width, y * th + 0.5); ctx.stroke(); }

    const s = this.selection;
    if (s) {
      ctx.fillStyle = 'rgba(90, 160, 255, 0.25)';
      ctx.fillRect(s.col * tw, s.row * th, s.w * tw, s.h * th);
      ctx.strokeStyle = '#5aa0ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(s.col * tw + 1, s.row * th + 1, s.w * tw - 2, s.h * th - 2);
    }
  }

  /** Click a tile to select it; drag to select a rectangle of tiles (painted as one stamp). */
  bindCanvas() {
    const cellAt = e => {
      const r = this.canvas.getBoundingClientRect();
      const ts = this.tileset;
      return {
        col: Math.floor((e.clientX - r.left) / (ts.tilewidth * this.scale)),
        row: Math.floor((e.clientY - r.top) / (ts.tileheight * this.scale)),
      };
    };
    let start = null;
    const update = e => {
      const c = cellAt(e);
      this.selectRect(Math.min(start.col, c.col), Math.min(start.row, c.row), Math.abs(c.col - start.col) + 1, Math.abs(c.row - start.row) + 1);
    };
    this.canvas.addEventListener('mousedown', e => {
      if (!this.tileset || e.button !== 0) return;
      start = cellAt(e);
      update(e);
      const move = ev => update(ev);
      const up = ev => { update(ev); start = null; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }

  destroy() {
    this.panel.remove();
    this.style.remove();
  }
}

/** A searchable list of every image in the asset manifest. Clicking one calls onPick(asset). */
export class AssetBrowser {
  constructor(root, manifest, { onPick, isInMap }) {
    this.modal = el('div', 'assets-modal');
    const head = el('div', 'head');
    head.appendChild(el('strong', '', 'Add a sprite to the map'));
    this.search = el('input');
    this.search.placeholder = 'Search by name or folder (e.g. tree, deco, bridge, Terrain/Ground)';
    this.search.addEventListener('input', () => this.render());
    const close = el('button', '', 'Close (Esc)');
    close.addEventListener('click', () => this.close());
    head.append(this.search, close);
    this.grid = el('div', 'grid');
    this.modal.append(head, this.grid);
    this.modal.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });

    this.manifest = manifest;
    this.onPick = onPick;
    this.isInMap = isInMap;
    root.appendChild(this.modal);
    this.render();
    this.search.focus();
  }

  render() {
    this.grid.replaceChildren();
    if (!this.manifest?.assets?.length) {
      this.grid.appendChild(el('div', 'empty', 'No asset list found. Run "node tools/build-asset-manifest.mjs" in the project folder and reopen the editor.'));
      return;
    }
    const q = this.search.value.trim().toLowerCase();
    const matches = this.manifest.assets.filter(a => !q || a.path.toLowerCase().includes(q));
    let category = null;
    for (const a of matches) {
      if (a.category !== category) {
        category = a.category;
        this.grid.appendChild(el('div', 'cat', category || '(top level)'));
      }
      const card = el('div', 'card' + (this.isInMap(a) ? ' in-map' : ''));
      const img = el('img');
      img.loading = 'lazy';
      img.src = a.path.split('/').map(encodeURIComponent).join('/');
      card.appendChild(img);
      card.appendChild(el('div', 'n', a.name));
      const grid = a.tileCount > 1 ? `${a.columns}×${a.rows} of ${a.tileWidth}×${a.tileHeight}` : 'single image';
      card.appendChild(el('div', 's', `${a.width}×${a.height} · ${grid}`));
      card.title = a.path + (this.isInMap(a) ? '\n(already in this map)' : '');
      card.addEventListener('click', () => { this.onPick(a); this.close(); });
      this.grid.appendChild(card);
    }
    if (!matches.length) this.grid.appendChild(el('div', 'empty', 'Nothing matches that search.'));
  }

  close() {
    this.modal.remove();
    this.onClose?.();
  }
}
