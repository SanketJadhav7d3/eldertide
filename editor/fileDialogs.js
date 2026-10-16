// Saving, listing and opening maps. There are three ways to write a map, tried in this order:
//
//  1. "server": the project's own server is running (node tools/editor-server.mjs). Maps are written
//     by the server into map.tmj or maps/<name>.tmj.
//  2. "folder": any other static server (VS Code Live Server, Vite, ...) in Chrome or Edge. The first
//     save asks you to pick the project folder once; the browser then writes maps/<name>.tmj itself
//     (File System Access API). The folder is remembered, though the browser may ask to confirm access
//     again in a new session.
//  3. "download": browsers without that API (e.g. Firefox). The map is downloaded and you copy it into
//     the maps/ folder yourself.

const CSS = `
#map-editor-ui .file-modal { position: fixed; left: 50%; top: 80px; transform: translateX(-50%); width: min(640px, calc(100vw - 32px)); max-height: calc(100vh - 160px); display: flex; flex-direction: column; pointer-events: auto; background: rgba(20, 24, 31, 0.98); border: 1px solid #4a5468; border-radius: 8px; z-index: 20; }
#map-editor-ui .file-modal .head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #3a4150; }
#map-editor-ui .file-modal .head strong { flex: 1; }
#map-editor-ui .file-modal .body { padding: 10px 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
#map-editor-ui .file-modal .hint { color: #9fb3c8; font-size: 12px; }
#map-editor-ui .file-modal .warn { color: #ffd24a; font-size: 12px; }
#map-editor-ui .file-modal .map-row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 1px solid #3a4150; border-radius: 6px; background: #262c38; cursor: pointer; }
#map-editor-ui .file-modal .map-row:hover { border-color: #6b8cc4; background: #2e3646; }
#map-editor-ui .file-modal .map-row.current { border-color: #4f7a4f; }
#map-editor-ui .file-modal .map-row .n { flex: 1; font-weight: 600; }
#map-editor-ui .file-modal .map-row .p, #map-editor-ui .file-modal .map-row .d { font-size: 11px; color: #7f8da0; }
#map-editor-ui .file-modal .tag { font-size: 10px; border: 1px solid #4f7a4f; color: #9fdf9f; border-radius: 3px; padding: 0 4px; }
#map-editor-ui .file-modal .name-row { display: flex; gap: 8px; align-items: center; }
#map-editor-ui .file-modal input[type=text] { flex: 1; background: #2c3444; color: #e8e8e8; border: 1px solid #4a5468; border-radius: 4px; padding: 6px 8px; font: inherit; }
#map-editor-ui .file-modal .foot { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 12px; border-top: 1px solid #3a4150; }
#map-editor-ui button.primary { background: #3b5b8c; border-color: #6b8cc4; }
`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Turns what the user typed into a safe file name ("My Island!" -> "My-Island"). */
export function toMapFileName(name) {
  return name.trim().replace(/\.tmj$/i, '').replace(/\s+/g, '-').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
}

/**
 * Pretty-prints a map like Tiled does (indented), but keeps each tile `data` array on one line so files
 * stay small and diff nicely.
 */
export function formatMapJson(json) {
  return JSON.stringify(json, null, 1).replace(/\[\s*(-?\d+(?:,\s*-?\d+)*)\s*\]/g, (m, nums) => `[${nums.replace(/\s+/g, '')}]`);
}

// The picked project folder is kept in IndexedDB so it does not have to be picked every time.
const DB_NAME = 'map-editor';
const STORE = 'handles';

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}

async function fileExists(dir, name) {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

export class MapStore {
  constructor() {
    this.mode = 'download';
    this.folder = null; // FileSystemDirectoryHandle of the project (folder mode)
  }

  get hasServer() { return this.mode === 'server'; }
  /** True when maps can be written into the project (server, or a project folder picked in this browser). */
  get canWrite() { return this.mode !== 'download'; }

  /** Works out how maps can be saved here. Returns the mode. */
  async detect() {
    try {
      const r = await fetch('api/maps', { cache: 'no-store' });
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return (this.mode = 'server');
    } catch { /* no server */ }
    if (typeof window.showDirectoryPicker === 'function') {
      this.mode = 'folder';
      try { this.folder = (await idb('readonly', s => s.get('project'))) ?? null; } catch { this.folder = null; }
      return this.mode;
    }
    return (this.mode = 'download');
  }

  /** A short explanation of where maps go, for the dialogs. */
  describe() {
    if (this.mode === 'server') return 'Maps are saved in the project\'s maps/ folder.';
    if (this.mode === 'folder') {
      return this.folder
        ? `Maps are saved in the maps/ folder of "${this.folder.name}".`
        : 'The first save asks you to pick the project folder (the one that contains map.tmj and index.html). The browser remembers it.';
    }
    return 'This browser cannot write files, so maps are downloaded. Put them in the project\'s maps/ folder, or run "node tools/editor-server.mjs".';
  }

  /**
   * Folder mode: makes sure we have read/write access to the project folder, asking the user to pick it
   * the first time. Must be called from a click or key press (browsers only show the dialog then).
   */
  async ensureFolder() {
    if (this.folder) {
      const opts = { mode: 'readwrite' };
      if ((await this.folder.queryPermission(opts)) === 'granted') return this.folder;
      if ((await this.folder.requestPermission(opts)) === 'granted') return this.folder;
      this.folder = null; // refused: pick again
    }
    const dir = await window.showDirectoryPicker({ id: 'map-editor-project', mode: 'readwrite' });
    if (!(await fileExists(dir, 'map.tmj')) || !(await fileExists(dir, 'index.html'))) {
      throw new Error(`"${dir.name}" is not the game's project folder (it has no map.tmj / index.html). Pick the folder that contains them`);
    }
    this.folder = dir;
    try { await idb('readwrite', s => s.put(dir, 'project')); } catch { /* it just will not be remembered */ }
    return dir;
  }

  async list() {
    if (this.mode === 'server') {
      const r = await fetch('api/maps', { cache: 'no-store' });
      if (!r.ok) throw new Error(`Could not list maps (${r.status})`);
      return r.json();
    }
    const maps = [{ path: 'map.tmj', name: 'map', isDefault: true }];
    if (this.mode === 'folder') {
      const root = await this.ensureFolder();
      try {
        const dir = await root.getDirectoryHandle('maps');
        const found = [];
        for await (const [name, handle] of dir.entries()) {
          if (handle.kind !== 'file' || !name.endsWith('.tmj') || name.startsWith('.')) continue;
          const file = await handle.getFile();
          found.push({ path: `maps/${name}`, name: name.replace(/\.tmj$/, ''), size: file.size, modified: new Date(file.lastModified).toISOString() });
        }
        maps.push(...found.sort((x, y) => x.name.localeCompare(y.name)));
      } catch { /* no maps folder yet */ }
    }
    return maps;
  }

  /**
   * Folder mode: rewrites maps/index.json, the list of maps the game's map picker reads when the page is
   * served by a server that cannot list folders.
   */
  async writeIndex(mapsDir) {
    const maps = [];
    for await (const [name, handle] of mapsDir.entries()) {
      if (handle.kind === 'file' && name.endsWith('.tmj') && !name.startsWith('.')) maps.push(name);
    }
    const writable = await (await mapsDir.getFileHandle('index.json', { create: true })).createWritable();
    await writable.write(`${JSON.stringify({ maps: maps.sort() }, null, 2)}\n`);
    await writable.close();
  }

  /** Writes the map. Returns { downloaded } so the caller can say what happened. */
  async save(path, json) {
    const content = formatMapJson(json);
    if (this.mode === 'server') {
      const r = await fetch('api/maps/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(result.error ?? `Save failed (${r.status})`);
      return { downloaded: false, ...result };
    }
    if (this.mode === 'folder') {
      const root = await this.ensureFolder();
      const parts = path.split('/');
      const name = parts.pop();
      let dir = root;
      for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
      // Keep the previous version, like the server does.
      if (await fileExists(dir, name)) {
        const old = await (await dir.getFileHandle(name)).getFile();
        const backups = await (await root.getDirectoryHandle('maps', { create: true })).getDirectoryHandle('.backup', { create: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backup = await (await backups.getFileHandle(`${name.replace(/\.tmj$/, '')}-${stamp}.tmj`, { create: true })).createWritable();
        await backup.write(await old.text());
        await backup.close();
      }
      const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await writable.write(content);
      await writable.close();
      if (path.startsWith('maps/')) await this.writeIndex(dir);
      return { downloaded: false, path };
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    a.download = path.split('/').pop();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return { downloaded: true };
  }
}

class Modal {
  constructor(root, title) {
    if (!document.getElementById('map-editor-file-css')) {
      const style = el('style');
      style.id = 'map-editor-file-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.node = el('div', 'file-modal');
    const head = el('div', 'head');
    head.appendChild(el('strong', '', title));
    const close = el('button', '', 'Close (Esc)');
    close.addEventListener('click', () => this.close());
    head.appendChild(close);
    this.body = el('div', 'body');
    this.foot = el('div', 'foot');
    this.node.append(head, this.body, this.foot);
    this.node.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); e.stopPropagation(); });
    root.appendChild(this.node);
  }

  close() {
    this.node.remove();
    this.onClose?.();
  }
}

function describeMap(m) {
  const parts = [];
  if (m.modified) parts.push(new Date(m.modified).toLocaleString());
  if (m.size) parts.push(`${Math.max(1, Math.round(m.size / 1024))} KB`);
  return parts.join(' · ');
}

/** Lists the saved maps; picking one calls onOpen(path). Also offers "New map" and opening a file. */
export class OpenDialog extends Modal {
  constructor(root, { maps, canWrite, note, currentPath, onOpen, onNew, onOpenFile }) {
    super(root, 'Open a map');
    this.body.appendChild(el('div', canWrite ? 'hint' : 'warn', note));
    for (const m of maps) {
      const row = el('div', 'map-row' + (m.path === currentPath ? ' current' : ''));
      row.appendChild(el('span', 'n', m.name));
      if (m.isDefault) row.appendChild(el('span', 'tag', 'the game plays this'));
      row.appendChild(el('span', 'p', m.path));
      row.appendChild(el('span', 'd', describeMap(m)));
      row.addEventListener('click', () => { this.close(); onOpen(m.path); });
      this.body.appendChild(row);
    }
    if (!maps.length) this.body.appendChild(el('div', 'hint', 'No maps yet.'));

    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = '.tmj,.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      this.close();
      onOpenFile(file.name, await file.text());
    });
    const fromDisk = el('button', '', 'Open a .tmj file…');
    fromDisk.addEventListener('click', () => fileInput.click());
    const blank = el('button', 'primary', 'New map');
    blank.addEventListener('click', () => { this.close(); onNew(); });
    this.foot.append(fileInput, fromDisk, blank);
  }
}

/** Asks for a name and calls onSave(path) with "maps/<name>.tmj". */
export class SaveAsDialog extends Modal {
  constructor(root, { maps, canWrite, note, suggestedName, onSave }) {
    super(root, 'Save map as');
    this.body.appendChild(el('div', canWrite ? 'hint' : 'warn', `${note} Names may use letters, numbers, - and _.`));
    const nameRow = el('div', 'name-row');
    this.input = el('input');
    this.input.type = 'text';
    this.input.placeholder = 'map name, e.g. river-crossing';
    this.input.value = suggestedName ?? '';
    this.preview = el('span', 'hint', '');
    nameRow.append(this.input, this.preview);
    this.body.appendChild(nameRow);
    this.warning = el('div', 'warn', '');
    this.body.appendChild(this.warning);

    const existing = maps.filter(m => m.path.startsWith('maps/'));
    if (existing.length) {
      this.body.appendChild(el('div', 'hint', 'Existing maps (click to reuse the name):'));
      for (const m of existing) {
        const row = el('div', 'map-row');
        row.appendChild(el('span', 'n', m.name));
        row.appendChild(el('span', 'd', describeMap(m)));
        row.addEventListener('click', () => { this.input.value = m.name; this.update(); this.input.focus(); });
        this.body.appendChild(row);
      }
    }

    this.maps = maps;
    const save = el('button', 'primary', 'Save');
    const submit = () => {
      const name = toMapFileName(this.input.value);
      if (!name) { this.warning.textContent = 'Please type a name.'; return; }
      this.close();
      onSave(`maps/${name}.tmj`);
    };
    save.addEventListener('click', submit);
    this.input.addEventListener('input', () => this.update());
    this.input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    this.foot.appendChild(save);
    this.update();
    this.input.focus();
    this.input.select();
  }

  update() {
    const name = toMapFileName(this.input.value);
    this.preview.textContent = name ? `maps/${name}.tmj` : '';
    const taken = this.maps.some(m => m.path === `maps/${name}.tmj`);
    this.warning.textContent = taken ? 'A map with this name exists and will be replaced (a backup is kept).' : '';
  }
}
