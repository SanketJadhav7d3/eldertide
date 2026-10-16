// Grid helpers for the painting tools.

/** Every cell on the straight line between two cells (Bresenham), so fast strokes leave no gaps. */
export function cellsOnLine(x0, y0, x1, y1) {
  const cells = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cells.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return cells;
}

/**
 * Cells connected to (x, y) that hold the same tile, limited to `bounds` (the map is infinite, so a
 * fill of empty space would otherwise never end). Returns null if the fill hit `maxCells`.
 */
export function floodFillCells(layer, x, y, bounds, maxCells = 40000) {
  const target = layer.getTile(x, y);
  const inBounds = (cx, cy) => cx >= bounds.x && cy >= bounds.y && cx < bounds.x + bounds.width && cy < bounds.y + bounds.height;
  if (!inBounds(x, y)) return [];
  const seen = new Set([`${x},${y}`]);
  const stack = [[x, y]];
  const cells = [];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    cells.push([cx, cy]);
    if (cells.length > maxCells) return null;
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      const key = `${nx},${ny}`;
      if (seen.has(key) || !inBounds(nx, ny) || layer.getTile(nx, ny) !== target) continue;
      seen.add(key);
      stack.push([nx, ny]);
    }
  }
  return cells;
}

/** The tile of a (possibly multi-tile) stamp that lands on cell (x, y) when the pattern starts at (ox, oy). */
export function stampTileAt(stamp, ox, oy, x, y) {
  const col = ((x - ox) % stamp.width + stamp.width) % stamp.width;
  const row = ((y - oy) % stamp.height + stamp.height) % stamp.height;
  return stamp.gids[row * stamp.width + col];
}
