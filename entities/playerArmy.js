

import Warrior from './warriorEntity.js';
import Worker from './workerEntity.js'; // This is unused in the new function, but keep for context
import Archer from './archerEntity.js';
import Lancer from './lancerEntity.js';
import { Stances } from './states.js';

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
    this.lancers = scene.physics.add.group();

    this.spawnWorker(13, 10);
    this.spawnWorker(15, 10);


    this.spawnWarrior(20, 20);
    this.spawnLancer(22, 22);
    this.spawnLancer(20, 22);
    this.spawnArcher(25, 24);
    this.spawnArcher(20, 24);

    this.debugGraphics = this.scene.add.graphics().setDepth(100);
  } 

  spawnWarrior(tileX, tileY) {
    const width = 40;   // Example: Make the body narrower
    const height = 75;  // Example: Make the body shorter
    const offsetX = 0;  // Example: Push the body to the right
    const offsetY = 0; // Example: Push the body down
    var warrior = new Warrior(this.scene, tileX * 64, tileY * 64, width, height, offsetX, offsetY, this.pathLayer, this.finder, this.grid);
    this.warriors.add(warrior);
  }
  

  spawnWorker(tileX, tileY) {
    const width = 40;   // Example: Make the body narrower
    const height = 52;  // Example: Make the body shorter
    const offsetX = 0;  // Example: Push the body to the right
    const offsetY = 0; // Example: Push the body down
    var worker = new Worker(this.scene, tileX * 64, tileY * 64, width, height, offsetX, offsetY, this.pathLayer, this.finder, this.grid);
    this.workers.add(worker);
  }

  spawnLancer(tileX, tileY) {
    const width = 40;
    const height = 75;
    const offsetX = 0;
    const offsetY = 0;
    var lancer = new Lancer(this.scene, tileX * 64, tileY * 64, width, height, offsetX, offsetY, this.pathLayer, this.finder, this.grid);
    this.lancers.add(lancer);
  }

  spawnArcher(tileX, tileY) {
    const width = 40;
    const height = 75;
    const offsetX = 0;
    const offsetY = 0;
    var archer = new Archer(this.scene, tileX * 64, tileY * 64, width, height, offsetX, offsetY, this.pathLayer, this.finder, this.grid);
    this.archers.add(archer);
  }

  _placeUnitsOnPerimeter(units, centerX, centerY, side, spacing) {
    if (units.length === 0) return;

    const halfSide = Math.floor(side / 2);
    const perimeterPositions = [];
    // Top
    for (let i = -halfSide; i <= halfSide; i++) perimeterPositions.push({ x: i, y: -halfSide });
    // Bottom (if not a single line)
    if (side > 1) {
      for (let i = -halfSide; i <= halfSide; i++) perimeterPositions.push({ x: i, y: halfSide });
    }
    // Left (excluding corners)
    for (let i = -halfSide + 1; i < halfSide; i++) perimeterPositions.push({ x: -halfSide, y: i });
    // Right (excluding corners)
    for (let i = -halfSide + 1; i < halfSide; i++) perimeterPositions.push({ x: halfSide, y: i });

    units.forEach((unit, index) => {
      // Cycle through perimeter points if more units than points
      const point = perimeterPositions[index % perimeterPositions.length];
      const x = centerX + point.x * spacing;
      const y = centerY + point.y * spacing;
      const tileX = Math.floor(x / 32);
      const tileY = Math.floor(y / 32);

      // unit.setStance(Stances.DEFENSIVE);
      unit.moveToTile(tileX, tileY, this.grid);
    });
  }

  setDefensiveFormation(units, centerX, centerY) {
    const spacing = 48; // pixels between units in formation

    const archers = units.filter(u => u instanceof Archer);
    const lancers = units.filter(u => u instanceof Lancer);
    const warriors = units.filter(u => u instanceof Warrior);

    let lastSide = 0;

    // Place archers in a central block
    if (archers.length > 0) {
      lastSide = Math.ceil(Math.sqrt(archers.length));
      const halfSide = Math.floor(lastSide / 2);
      archers.forEach((unit, index) => {
        const row = Math.floor(index / lastSide);
        const col = index % lastSide;
        const x = centerX + (col - halfSide) * spacing;
        const y = centerY + (row - halfSide) * spacing;
        const tileX = Math.floor(x / 32);
        const tileY = Math.floor(y / 32);

        // unit.setStance(Stances.DEFENSIVE);
        unit.moveToTile(tileX, tileY, this.grid);
      });
    }

    // Place lancers in a perimeter
    if (lancers.length > 0) {
      const lancerSide = lastSide + 2;
      this._placeUnitsOnPerimeter(lancers, centerX, centerY, lancerSide, spacing);
      lastSide = lancerSide;
    }

    // Place warriors in an outer perimeter
    if (warriors.length > 0) {
      const warriorSide = lastSide + 2;
      this._placeUnitsOnPerimeter(warriors, centerX, centerY, warriorSide, spacing);
      lastSide = warriorSide;
    }
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
      // The entity's update loop is always called, even if not 'active',
      // to allow death animations to complete.
      if (child) {
        child.update(time, delta, enemyArmy);
        // const unitBody = child.body;
        // const unitBounds = new Phaser.Geom.Rectangle(unitBody.x, unitBody.y, unitBody.width, unitBody.height);
        //
        // this.debugGraphics.fillStyle(0xff0000, 0.5);
        // this.debugGraphics.fillRect(unitBounds.x, unitBounds.y, unitBounds.width, unitBounds.height);
      }
    });

    this.workers.children.iterate((child) => {
      // The entity's update loop is always called, even if not 'active',
      // to allow death animations to complete.
      if (child) {
        child.update(time, delta, enemyArmy);
        // const unitBody = child.body;
        // const unitBounds = new Phaser.Geom.Rectangle(unitBody.x, unitBody.y, unitBody.width, unitBody.height);
        // this.debugGraphics.fillStyle(0x00ff00, 0.5);
        // this.debugGraphics.fillRect(unitBounds.x, unitBounds.y, unitBounds.width, unitBounds.height);
      }
    });

    this.lancers.children.iterate((child) => {
      if (child) {
        child.update(time, delta, enemyArmy);
      }
    });

    this.archers.children.iterate((child) => {
      if (child) child.update(time, delta, enemyArmy);
    });
  }
}
