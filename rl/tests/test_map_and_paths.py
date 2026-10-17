import numpy as np

from eldertide_rl.config import DEFAULT_MAP, REPO_ROOT
from eldertide_rl.mapdata import load_map, mirror_west_half
from eldertide_rl.pathfinding import find_path, octile


def test_island_map_loads():
    m = load_map(DEFAULT_MAP)
    assert (m.width, m.height) == (64, 64)
    assert m.player_start == (19, 32)
    assert m.walkable[32, 19] and m.buildable[32, 19]
    assert not m.walkable[0, 0]  # ocean
    assert (m.buildable <= m.walkable).all() and (m.grass <= m.walkable).all()
    assert len(m.gold_mines) == 4


def test_mirrored_map_is_symmetric():
    m = mirror_west_half(load_map(DEFAULT_MAP))
    for grid in (m.walkable, m.buildable, m.grass, m.player_grass):
        assert np.array_equal(grid, grid[:, ::-1])
    mines = set(m.gold_mines)
    assert mines == {(m.width - 1 - x, y) for x, y in mines}


def test_other_maps_load():
    # The default map is an infinite map whose tiles start at negative coordinates.
    for path in [REPO_ROOT / "map.tmj", *sorted((REPO_ROOT / "maps").glob("*.tmj"))]:
        m = load_map(path)
        assert m.walkable.shape == (m.height, m.width) and m.walkable.any()
        assert all(0 <= x < m.width and 0 <= y < m.height for x, y in m.gold_mines)


def open_grid(w=10, h=10):
    return np.ones((h, w), dtype=bool)


def goal(x, y):
    return (lambda cx, cy: (cx, cy) == (x, y)), (lambda cx, cy: octile(cx - x, cy - y, 6, 9))


def test_straight_and_diagonal_paths():
    is_goal, h = goal(5, 0)
    assert find_path(open_grid(), (0, 0), is_goal, h) == [(1, 0), (2, 0), (3, 0), (4, 0), (5, 0)]
    is_goal, h = goal(3, 3)
    assert find_path(open_grid(), (0, 0), is_goal, h) == [(1, 1), (2, 2), (3, 3)]


def test_no_corner_cutting():
    grid = open_grid()
    grid[0, 1] = False  # wall right of the start
    is_goal, h = goal(1, 1)
    path = find_path(grid, (0, 0), is_goal, h)
    assert path == [(0, 1), (1, 1)]  # must go round the corner, not through it


def test_unreachable_goal_and_partial_path():
    grid = open_grid()
    grid[:, 5] = False  # a wall splitting the map
    is_goal, h = goal(8, 3)
    assert find_path(grid, (0, 3), is_goal, h) is None
    partial = find_path(grid, (0, 3), is_goal, h, partial=True)
    assert partial[-1] == (4, 3)  # as close as possible
