"""A text picture of the game, for debugging and tests."""

from __future__ import annotations

from .game import Building, Game, Resource, Unit

UNIT_CHARS = {"worker": "w", "warrior": "s", "lancer": "l", "archer": "a"}  # player 1: upper case
BUILDING_CHARS = {"castle": "C", "house": "H", "tower": "T", "barracks": "B", "archery": "R"}
RESOURCE_CHARS = {"tree": "^", "mine": "$", "sheep": "o"}


def render(game: Game, crop: tuple | None = None) -> str:
    """One character per cell: '~' water, '.' land, '^' tree, '$' gold mine, 'o' sheep,
    w/s/l/a = worker/warrior/lancer/archer (player 0 lower case, player 1 upper case),
    buildings by letter with player 0 in lower case (c/h/t/b/r) and player 1 in upper case."""
    x0, y0, x1, y1 = crop or (0, 0, game.width, game.height)
    rows = []
    for y in range(y0, y1):
        row = []
        for x in range(x0, x1):
            e = game.entity_at(x, y)
            if isinstance(e, Unit):
                ch = UNIT_CHARS[e.kind]
                row.append(ch.upper() if e.owner == 1 else ch)
            elif isinstance(e, Building):
                ch = BUILDING_CHARS[e.kind]
                row.append(ch if e.owner == 1 else ch.lower())
            elif isinstance(e, Resource):
                row.append(RESOURCE_CHARS[e.kind])
            else:
                row.append("." if game.map.walkable[y, x] else "~")
        rows.append("".join(row))
    header = (f"tick {game.tick_count}  P0 {game.resources[0]} pop {game.population(0)}  "
              f"P1 {game.resources[1]} pop {game.population(1)}")
    return header + "\n" + "\n".join(rows)
