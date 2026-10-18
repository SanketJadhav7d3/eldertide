"""8-direction A* on the cell grid, with costs in ticks (straight and diagonal steps differ).

`path_to_rect` is what the simulator uses: every goal is "within `reach` of the rectangle x0..x1,
y0..y1" (an exact cell is a 1 x 1 rectangle with reach 0), so the search can be compiled with Numba.
It explores cells in exactly the same order as the general `find_path` given the matching goal and
heuristic, so both return the same paths. Without Numba (or with ELDERTIDE_NO_NUMBA=1) the same
algorithm runs in plain Python.
"""

from __future__ import annotations

import heapq
import math
import os
from typing import Callable

import numpy as np

STRAIGHT = ((1, 0), (-1, 0), (0, 1), (0, -1))
DIAGONAL = ((1, 1), (1, -1), (-1, 1), (-1, -1))


def neighbours(passable: np.ndarray, x: int, y: int, straight: int, diagonal: int, mirror: bool = False):
    """Passable neighbouring cells with their step cost. A diagonal step may not cut a corner: both
    cells it passes between must be passable too. `mirror` visits them in left-right mirrored order,
    so a player on the east side breaks ties exactly as one on the west side would."""
    h, w = passable.shape
    sign = -1 if mirror else 1
    for dx, dy in STRAIGHT:
        dx *= sign
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h and passable[ny, nx]:
            yield nx, ny, straight
    for dx, dy in DIAGONAL:
        dx *= sign
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h and passable[ny, nx] and passable[y, nx] and passable[ny, x]:
            yield nx, ny, diagonal


def octile(dx: int, dy: int, straight: int, diagonal: int) -> int:
    dx, dy = abs(dx), abs(dy)
    return straight * max(dx, dy) + (diagonal - straight) * min(dx, dy)


def find_path(
    passable: np.ndarray,
    start: tuple,
    is_goal: Callable[[int, int], bool],
    heuristic: Callable[[int, int], float],
    straight: int = 6,
    diagonal: int = 9,
    partial: bool = False,
    max_expansions: int = 20000,
    mirror: bool = False,
) -> list | None:
    """
    Cheapest path from `start` to any cell where is_goal(x, y) holds, as a list of cells after
    `start` (empty if start is already a goal). The start cell need not be passable.

    If no goal can be reached: returns None, or with `partial` the path to the reached cell with the
    lowest heuristic (the closest the unit can get).
    """
    sx, sy = start
    if is_goal(sx, sy):
        return []
    counter = 0
    open_heap = [(heuristic(sx, sy), 0, counter, sx, sy)]
    came_from = {(sx, sy): None}
    cost = {(sx, sy): 0}
    best = (heuristic(sx, sy), 0, (sx, sy))
    expansions = 0
    while open_heap and expansions < max_expansions:
        _, g, _, x, y = heapq.heappop(open_heap)
        if g > cost[(x, y)]:
            continue
        expansions += 1
        if is_goal(x, y):
            return _unwind(came_from, (x, y))
        h = heuristic(x, y)
        if (h, g) < best[:2]:
            best = (h, g, (x, y))
        for nx, ny, step in neighbours(passable, x, y, straight, diagonal, mirror):
            ng = g + step
            if ng < cost.get((nx, ny), 1 << 60):
                cost[(nx, ny)] = ng
                came_from[(nx, ny)] = (x, y)
                counter += 1
                heapq.heappush(open_heap, (ng + heuristic(nx, ny), ng, counter, nx, ny))
    if partial and best[2] != (sx, sy):
        return _unwind(came_from, best[2])
    return None


def _unwind(came_from: dict, cell: tuple) -> list:
    path = []
    while came_from[cell] is not None:
        path.append(cell)
        cell = came_from[cell]
    path.reverse()
    return path


# ---------------------------------------------------------------------------------------------------
# Goals as rectangles.

# Neighbour offsets in the order `neighbours` visits them: four straight steps, then four diagonals.
_SX = np.array([1, -1, 0, 0, 1, 1, -1, -1], dtype=np.int64)
_SY = np.array([0, 0, 1, -1, 1, -1, 1, -1], dtype=np.int64)
_SX_LIST = _SX.tolist()
_SY_LIST = _SY.tolist()


def rect_goal(x: int, y: int, rect: tuple, reach: float) -> bool:
    """True if cell (x, y) is within `reach` of the rectangle (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = rect
    dx = x - min(max(x, x0), x1)
    dy = y - min(max(y, y0), y1)
    return math.sqrt(dx * dx + dy * dy) <= reach + 1e-9


def rect_heuristic(x: int, y: int, rect: tuple, reach: float, straight: int, diagonal: int) -> float:
    """Ticks to the rectangle by the octile distance, less what `reach` covers (never negative)."""
    x0, y0, x1, y1 = rect
    dx = abs(x - min(max(x, x0), x1))
    dy = abs(y - min(max(y, y0), y1))
    big, small = (dx, dy) if dx > dy else (dy, dx)
    return max(0.0, straight * big + (diagonal - straight) * small - reach * straight)


def _astar_rect_py(passable, sx, sy, x0, y0, x1, y1, reach, straight, diagonal, partial, max_expansions, sign):
    h, w = passable.shape
    cells = passable.reshape(-1).tolist()
    rect = (x0, y0, x1, y1)
    start = sy * w + sx
    if rect_goal(sx, sy, rect, reach):
        return 1, []
    cost = [1 << 60] * (h * w)
    came = [-1] * (h * w)
    cost[start] = 0
    counter = 0
    h0 = rect_heuristic(sx, sy, rect, reach, straight, diagonal)
    heap = [(h0, 0, 0, start)]
    best_h, best_g, best = h0, 0, start
    expansions = 0
    while heap and expansions < max_expansions:
        _, g, _, node = heapq.heappop(heap)
        if g > cost[node]:
            continue
        expansions += 1
        x, y = node % w, node // w
        if rect_goal(x, y, rect, reach):
            return 1, _unwind_flat(came, node, start)
        hv = rect_heuristic(x, y, rect, reach, straight, diagonal)
        if hv < best_h or (hv == best_h and g < best_g):
            best_h, best_g, best = hv, g, node
        for k in range(8):
            nx, ny = x + _SX_LIST[k] * sign, y + _SY_LIST[k]
            if not (0 <= nx < w and 0 <= ny < h) or not cells[ny * w + nx]:
                continue
            if k >= 4:
                if not cells[y * w + nx] or not cells[ny * w + x]:
                    continue
                ng = g + diagonal
            else:
                ng = g + straight
            n = ny * w + nx
            if ng < cost[n]:
                cost[n] = ng
                came[n] = node
                counter += 1
                heapq.heappush(heap, (ng + rect_heuristic(nx, ny, rect, reach, straight, diagonal), ng, counter, n))
    if partial and best != start:
        return 1, _unwind_flat(came, best, start)
    return 0, []


def _unwind_flat(came, node, start):
    out = []
    while node != start:
        out.append(node)
        node = came[node]
    out.reverse()
    return out


try:
    if os.environ.get("ELDERTIDE_NO_NUMBA"):
        raise ImportError
    import numba
except ImportError:
    numba = None

if numba is not None:
    @numba.njit(cache=True, inline="always")
    def _lt(f1, g1, c1, f2, g2, c2):
        if f1 != f2:
            return f1 < f2
        if g1 != g2:
            return g1 < g2
        return c1 < c2

    @numba.njit(cache=True, inline="always")
    def _h_nb(x, y, x0, y0, x1, y1, reach, straight, diagonal):
        dx = abs(x - min(max(x, x0), x1))
        dy = abs(y - min(max(y, y0), y1))
        if dx > dy:
            big, small = dx, dy
        else:
            big, small = dy, dx
        return max(0.0, straight * big + (diagonal - straight) * small - reach * straight)

    @numba.njit(cache=True, inline="always")
    def _goal_nb(x, y, x0, y0, x1, y1, limit):
        dx = x - min(max(x, x0), x1)
        dy = y - min(max(y, y0), y1)
        return math.sqrt(dx * dx + dy * dy) <= limit

    @numba.njit(cache=True)
    def _astar_rect_nb(cells2d, sx, sy, x0, y0, x1, y1, reach, straight, diagonal, partial, max_expansions, sign):
        h, w = cells2d.shape
        n_cells = h * w
        cells = cells2d.reshape(-1)
        limit = reach + 1e-9
        if _goal_nb(sx, sy, x0, y0, x1, y1, limit):
            return 1, np.empty(0, dtype=np.int64)
        start = sy * w + sx
        cost = np.full(n_cells, 1 << 60, dtype=np.int64)
        came = np.full(n_cells, -1, dtype=np.int64)
        cap = 8 * n_cells + 8
        hf = np.empty(cap, dtype=np.float64)
        hg = np.empty(cap, dtype=np.int64)
        hc = np.empty(cap, dtype=np.int64)
        hn = np.empty(cap, dtype=np.int64)
        cost[start] = 0
        h0 = _h_nb(sx, sy, x0, y0, x1, y1, reach, straight, diagonal)
        hf[0] = h0
        hg[0] = 0
        hc[0] = 0
        hn[0] = start
        size = 1
        counter = 0
        best_h = h0
        best_g = 0
        best = start
        expansions = 0
        found = -1
        while size > 0 and expansions < max_expansions:
            g = hg[0]
            node = hn[0]
            size -= 1
            if size > 0:  # move the last item to the root and sift it down
                lf, lg, lc, ln = hf[size], hg[size], hc[size], hn[size]
                i = 0
                while True:
                    a = 2 * i + 1
                    if a >= size:
                        break
                    m = a
                    b = a + 1
                    if b < size and _lt(hf[b], hg[b], hc[b], hf[a], hg[a], hc[a]):
                        m = b
                    if _lt(hf[m], hg[m], hc[m], lf, lg, lc):
                        hf[i] = hf[m]
                        hg[i] = hg[m]
                        hc[i] = hc[m]
                        hn[i] = hn[m]
                        i = m
                    else:
                        break
                hf[i] = lf
                hg[i] = lg
                hc[i] = lc
                hn[i] = ln
            if g > cost[node]:
                continue
            expansions += 1
            x = node % w
            y = node // w
            if _goal_nb(x, y, x0, y0, x1, y1, limit):
                found = node
                break
            hv = _h_nb(x, y, x0, y0, x1, y1, reach, straight, diagonal)
            if hv < best_h or (hv == best_h and g < best_g):
                best_h = hv
                best_g = g
                best = node
            for k in range(8):
                nx = x + _SX[k] * sign
                ny = y + _SY[k]
                if nx < 0 or nx >= w or ny < 0 or ny >= h or cells[ny * w + nx] == 0:
                    continue
                if k >= 4:
                    if cells[y * w + nx] == 0 or cells[ny * w + x] == 0:
                        continue
                    ng = g + diagonal
                else:
                    ng = g + straight
                nn = ny * w + nx
                if ng < cost[nn]:
                    cost[nn] = ng
                    came[nn] = node
                    counter += 1
                    f = ng + _h_nb(nx, ny, x0, y0, x1, y1, reach, straight, diagonal)
                    i = size  # push and sift up
                    size += 1
                    while i > 0:
                        p = (i - 1) // 2
                        if _lt(f, ng, counter, hf[p], hg[p], hc[p]):
                            hf[i] = hf[p]
                            hg[i] = hg[p]
                            hc[i] = hc[p]
                            hn[i] = hn[p]
                            i = p
                        else:
                            break
                    hf[i] = f
                    hg[i] = ng
                    hc[i] = counter
                    hn[i] = nn
        if found < 0:
            if partial and best != start:
                found = best
            else:
                return 0, np.empty(0, dtype=np.int64)
        length = 0
        node = found
        while node != start:
            length += 1
            node = came[node]
        out = np.empty(length, dtype=np.int64)
        node = found
        for i in range(length - 1, -1, -1):
            out[i] = node
            node = came[node]
        return 1, out


def path_to_rect(passable: np.ndarray, start: tuple, rect: tuple, reach: float, straight: int = 6,
                 diagonal: int = 9, partial: bool = False, max_expansions: int = 20000,
                 mirror: bool = False, use_numba: bool | None = None) -> list | None:
    """
    Cheapest path from `start` to a cell within `reach` of the rectangle (x0, y0, x1, y1), as a list
    of cells after `start` ([] if start already qualifies). If none can be reached: None, or with
    `partial` the path to the reached cell closest to the goal.
    """
    sx, sy = int(start[0]), int(start[1])
    x0, y0, x1, y1 = (int(v) for v in rect)
    w = passable.shape[1]
    sign = -1 if mirror else 1
    if use_numba is None:
        use_numba = numba is not None
    if use_numba:
        cells = np.ascontiguousarray(passable, dtype=np.uint8)
        found, nodes = _astar_rect_nb(cells, sx, sy, x0, y0, x1, y1, float(reach), straight, diagonal,
                                      bool(partial), max_expansions, sign)
        nodes = nodes.tolist()
    else:
        found, nodes = _astar_rect_py(passable, sx, sy, x0, y0, x1, y1, float(reach), straight, diagonal,
                                      partial, max_expansions, sign)
    if not found:
        return None
    return [(n % w, n // w) for n in nodes]
