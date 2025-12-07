

import Bomber from './bomberEntity.js';
import Goblin from './goblinEntity.js';

export default class EnemyArmy {

  constructor(scene, pathLayer, finder, grid) {
    this.scene = scene;
    this.pathLayer = pathLayer;
    this.finder = finder;
    this.grid = grid;

    this.bombers = scene.physics.add.group();
    this.goblins = scene.physics.add.group();
    // Initial spawns are now handled by the WaveManager.
  } 

  handleGoblinAttackOverlapWithGroup(otherGroup) {
    this.goblins.children.iterate((goblin) => {
      otherGroup.children.iterate((child) => {
        goblin.handleAttackOverlapWith(child);
      });
    });
  }

  spawnGoblin(tileX, tileY) {
    const width = 32;
    const height = 32;
    const offsetX = 16;
    const offsetY = 32;
    var goblin = new Goblin(this.scene, tileX * 64, tileY * 64, width, height, offsetX, offsetY, this.pathLayer, this.finder, this.grid);
    // Set the final destination for the goblin AI
    goblin.finalDestination = { x: 22, y: 30 };
    this.goblins.add(goblin);
  }

  update(time, delta, playerArmy) {
    // this.p1.update();
    // this.p2.update();

    this.goblins.children.iterate((child) => {
      if (child && child.active) // Only update active goblins
        child.update(time, delta, playerArmy);
    });
  }
}
