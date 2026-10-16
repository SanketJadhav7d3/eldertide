// The object layers a map can have, by name. The map editor creates and draws them; the game reads them
// when it loads a map. They are ordinary Tiled object layers, so a map made in Tiled can use them too:
// just give the layer one of these names.
//
//   shape "rect"  -> rectangles (Tiled: rectangle objects)
//   shape "point" -> points     (Tiled: point objects); x, y is the spot itself
//   shape "tile"  -> images     (Tiled: tile objects, i.e. a tile with a gid); x, y is the image's bottom-left

export const MAP_LAYERS = {
  collision: {
    name: 'collision-layer',
    shape: 'rect',
    label: 'Collision',
    description: 'Rectangles where nothing can be built (fences, cliffs, ...)',
    color: 0xff6b6b,
  },
  goldMines: {
    name: 'gold-mine-layer',
    shape: 'point',
    label: 'Gold mines',
    description: 'A gold mine is placed on each point',
    color: 0xffd24a,
  },
  enemySpawns: {
    name: 'enemy-spawn-layer',
    shape: 'point',
    label: 'Enemy spawns',
    description: 'Goblin waves enter the map at these points',
    color: 0xff4fd8,
  },
  playerStart: {
    name: 'player-start-layer',
    shape: 'point',
    label: 'Player start',
    description: 'One point: where the camera starts (put it on the player\'s land)',
    color: 0x4ad2ff,
    single: true,
  },
  sprites: {
    name: 'sprite-layer',
    shape: 'tile',
    label: 'Sprites',
    description: 'Images placed freely (not on the tile grid): rocks, bushes, decorations, ...',
    color: 0x7dff6b,
  },
};

/** The MAP_LAYERS entry for a layer name, or null for any other layer. */
export function layerKind(name) {
  return Object.values(MAP_LAYERS).find(kind => kind.name === name) ?? null;
}
