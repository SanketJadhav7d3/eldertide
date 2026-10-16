// Undo / redo. Every edit is pushed as a command with `undo()` and `redo()`; a paint stroke (all the
// cells changed between mouse down and mouse up) is a single command.

const MAX_STEPS = 200;

export default class History {
  constructor(onChange) {
    this.done = [];
    this.undone = [];
    this.onChange = onChange;
  }

  /** Records a command that has already been applied. */
  push(command) {
    this.done.push(command);
    if (this.done.length > MAX_STEPS) this.done.shift();
    this.undone = [];
    this.onChange?.();
  }

  undo() {
    const command = this.done.pop();
    if (!command) return null;
    command.undo();
    this.undone.push(command);
    this.onChange?.();
    return command;
  }

  redo() {
    const command = this.undone.pop();
    if (!command) return null;
    command.redo();
    this.done.push(command);
    this.onChange?.();
    return command;
  }

  get canUndo() { return this.done.length > 0; }
  get canRedo() { return this.undone.length > 0; }
}

/**
 * Collects the cells changed during one stroke so it can be undone as one step.
 * The first "before" value of each cell is kept, so painting over a cell twice still undoes correctly.
 */
export class CellEdit {
  constructor(layer, label) {
    this.layer = layer;
    this.label = label;
    this.cells = new Map(); // "x,y" -> { x, y, before, after }
  }

  /** Sets a cell and remembers its old value. Returns true if it changed. */
  set(x, y, gid) {
    const before = this.layer.getTile(x, y);
    if (before === gid) return false;
    const key = `${x},${y}`;
    const entry = this.cells.get(key);
    if (entry) entry.after = gid;
    else this.cells.set(key, { x, y, before, after: gid });
    this.layer.setTile(x, y, gid);
    return true;
  }

  get isEmpty() {
    for (const c of this.cells.values()) if (c.before !== c.after) return false;
    return true;
  }

  undo() { for (const c of this.cells.values()) this.layer.setTile(c.x, c.y, c.before); }
  redo() { for (const c of this.cells.values()) this.layer.setTile(c.x, c.y, c.after); }
}
