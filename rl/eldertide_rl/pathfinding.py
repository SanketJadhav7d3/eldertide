"""8-direction A* on the cell grid, with costs in ticks (straight and diagonal steps differ)."""

from __future__ import annotations

import heapq
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
