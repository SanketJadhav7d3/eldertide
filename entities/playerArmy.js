

import Warrior from './warriorEntity.js';
import Worker from './workerEntity.js';
import Archer from './archerEntity.js';

// var tileX = pathLayer.worldToTileX(player.x);
// var tileY = pathLayer.worldToTileX(player.y);

// const path = finder.findPath(tileX, tileY, 20, 22, grid);

// let index = 0;

export default class PlayerArmy {
  constructor(scene, pathLayer, finder, grid) {
    this.scene = scene;
    this.pathLayer = pathLayer;
    this.finder = finder;
    this.grid = grid;

    this.warriors = scene.physics.add.group();
    this.workers = scene.physics.add.group();
    this.archers = scene.physics.add.group();

    this.spawnWorker(13, 10);
    this.spawnWorker(15, 10);


    this.spawnWarrior(20, 20);

    this.debugGraphics = this.scene.add.graphics().setDepth(100);
  } 

  spawnWarrior(tileX, tileY) {
    const width = 40;   // Example: Make the body narrower
    const height = 75;  // Example: Make the body shorter
    const offsetX = 12;  // Example: Push the body to the right
    const offsetY = 15; // Example: Push the body down
    var warrior = new Warrior(this.scene, tileX * 64, tileY * 64, width, height, offsetX, offsetY, this.pathLayer, this.finder, this.grid);
    this.warriors.add(warrior);
  }

  spawnWorker(tileX, tileY) {
    const width = 40;   // Example: Make the body narrower
    const height = 52;  // Example: Make the body shorter
    const offsetX = 12;  // Example: Push the body to the right
    const offsetY = 25; // Example: Push the body down
    var worker = new Worker(this.scene, tileX * 64, tileY * 64, width, height, offsetX, offsetY, this.pathLayer, this.finder, this.grid);
    this.workers.add(worker);
  }

  protectTower(index, tower) {
    // go to that tower and protect it 
    // warrior.moveToTile(towerPos[0], towerPos[1]);
    var warrior = this.warriors.getChildren()[index]
    warrior.protectEntity(tower);
  }

  follow(index, mouseX, mouseY) {
    var warrior = this.warriors.getChildren()[index]
    warrior.followMouse(mouseX, mouseY);
  }

  handleWarriorAttackOverlapWithGroup(otherGroup) {
    this.warriors.children.iterate((warrior) => {
      otherGroup.children.iterate((child) => {
        warrior.handleAttackOverlapWith(child);
      });
    });
  }

  update(time, delta, enemyArmy) {
    this.debugGraphics.clear();

    this.warriors.children.iterate((child) => {
      if (child) { // Only update active warriors
        child.update(time, delta, enemyArmy);
        // const unitBody = child.body;
        // const unitBounds = new Phaser.Geom.Rectangle(unitBody.x, unitBody.y, unitBody.width, unitBody.height);
        //
        // this.debugGraphics.fillStyle(0xff0000, 0.5);
        // this.debugGraphics.fillRect(unitBounds.x, unitBounds.y, unitBounds.width, unitBounds.height);
      }
    });

    this.workers.children.iterate((child) => { // Workers are destroyed immediately, so active check is less critical here but good practice
      if (child) {
        child.update(time, delta, enemyArmy);
        // const unitBody = child.body;
        // const unitBounds = new Phaser.Geom.Rectangle(unitBody.x, unitBody.y, unitBody.width, unitBody.height);
        // this.debugGraphics.fillStyle(0x00ff00, 0.5);
        // this.debugGraphics.fillRect(unitBounds.x, unitBounds.y, unitBounds.width, unitBounds.height);
      }
    });

    // this.archers.children.iterate((child) => {
      // child.update();
    // });
  }
}
