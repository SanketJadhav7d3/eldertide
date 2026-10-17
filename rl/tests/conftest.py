import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from eldertide_rl.config import GameConfig  # noqa: E402
from eldertide_rl.game import Game  # noqa: E402
from eldertide_rl.mapdata import MapData  # noqa: E402


@pytest.fixture(scope="session")
def cfg():
    return GameConfig.from_balance()


def blank_map(width=24, height=16, water=()):
    walkable = np.ones((height, width), dtype=bool)
    for x, y in water:
        walkable[y, x] = False
    return MapData(width, height, walkable, walkable.copy(), walkable.copy(), walkable.copy(), (), None, ())


def make_game(cfg, width=24, height=16, water=(), seed=0):
    """An empty all-land map without the castle rule, for building small scenarios."""
    g = Game(blank_map(width, height, water), cfg, seed=seed)
    g.castle_rule = False
    g.resources = [{"wood": 10000, "meat": 10000, "gold": 10000} for _ in range(2)]
    return g


def run(game, ticks):
    for _ in range(ticks):
        game.tick()
