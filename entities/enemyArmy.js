

import Goblin from './goblinEntity.js';
import Barrel from './barrelEntity.js';
import Bomber from './bomberEntity.js';

export default class EnemyArmy {

  constructor(scene, pathLayer, finder, grid) {
    this.scene = scene;
    this.pathLayer = pathLayer;
    this.finder = finder;
    this.grid = grid;

    this.bombers = scene.physics.add.group();
    this.goblins = scene.physics.add.group();
    this.barrels = scene.physics.add.group();
    
    // TODO: Move initial spawns to a dedicated WaveManager.
    // For now, spawning one barrel as part of the "first wave".
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

  spawnBomber(tileX, tileY) {
    const width = 32;
    const height = 48;
    const offsetX = 16;
    const offsetY = 32;
    var bomber = new Bomber(this.scene, tileX * 64, tileY * 64, width, height, offsetX, offsetY, this.pathLayer, this.finder, this.grid);
    bomber.finalDestination = { x: 22, y: 30 }; // Same as other enemies for now
    this.bombers.add(bomber);
  }

  spawnBarrel(tileX, tileY) {
    const width = 32;
    const height = 32;
    const offsetX = 16;
    const offsetY = 32;
    var barrel = new Barrel(this.scene, tileX * 64, tileY * 64, width, height, offsetX, offsetY, this.pathLayer, this.finder, this.grid);
    barrel.finalDestination = { x: 22, y: 30 }; // Same as goblin for now
    this.barrels.add(barrel);
  }

  update(time, delta, playerArmy) {
    // this.p1.update();
    // this.p2.update();

    this.goblins.children.iterate((child) => {
      // The 'active' check is removed. The entity's update loop is now always called,
      // allowing death animations to complete. The entity is removed from this group
      // in its sustainDamage method anyway.
      if (child)
        child.update(time, delta, playerArmy);
    });

    this.bombers.children.iterate((child) => {
      if (child) // Update even if not "active" to allow death sequence
        child.update(time, delta, playerArmy);
    });

    this.barrels.children.iterate((child) => {
      if (child) // Update even if not "active" to allow explosion sequence
        child.update(time, delta, playerArmy);
    });
  }
}
