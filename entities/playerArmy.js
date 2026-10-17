

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

    this.debugGraphics = this.scene.add.graphics().setDepth(100);
  }

  /**
   * The units the player starts with: two workers, a warrior, two lancers and two archers.
   * With a map's player start point (world px) they stand around it, each on the nearest walkable
   * cell; maps without one keep the original fixed spots.
   */
  spawnStartingUnits(start = null) {
    // [spawn method, offset from the start point in 64px tiles]; workers in front, soldiers behind.
    const units = [
      ['spawnWorker', -1, 0], ['spawnWorker', 1, 0],
      ['spawnWarrior', 0, 2], ['spawnLancer', -1.5, 2], ['spawnLancer', 1.5, 2],
      ['spawnArcher', -0.75, 3.25], ['spawnArcher', 0.75, 3.25],
    ];

    if (!start) {
      const fixed = [[13, 10], [15, 10], [20, 20], [22, 22], [20, 22], [25, 24], [20, 24]];
      units.forEach(([spawn], i) => this[spawn](...fixed[i]));
      return;
    }

    const taken = new Set();
    for (const [spawn, dx, dy] of units) {
      const cell = this.freeWalkableCell(Math.floor((start.x + dx * 64) / 32), Math.floor((start.y + dy * 64) / 32), taken);
      if (!cell) continue;
      taken.add(`${cell.x},${cell.y}`);
      // The spawn methods take 64px tile coordinates; aim for the middle of the 32px cell.
      this[spawn]((cell.x * 32 + 16) / 64, (cell.y * 32 + 16) / 64);
    }
  }

  /** The walkable 32px cell nearest to (x, y) that isn't in `taken`, searching outward ring by ring. */
  freeWalkableCell(x, y, taken, maxRadius = 8) {
    const grid = this.grid;
    for (let r = 0; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // only this ring
          const cx = x + dx;
          const cy = y + dy;
          if (cx < 0 || cy < 0 || cx >= grid.width || cy >= grid.height) continue;
          if (grid.isWalkableAt(cx, cy) && !taken.has(`${cx},${cy}`)) return { x: cx, y: cy };
        }
      }
    }
    return null;
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
    var warrior = this.warriors.getChildren()[index]
    warrior.guard(tower);
  }

  follow(index, mouseX, mouseY) {
    var warrior = this.warriors.getChildren()[index]
    warrior.followMouse(mouseX, mouseY);
  }

  handleWarriorAttackOverlapWithGroup(otherGroup) {
    this.warriors.children.iterate((warrior) => {
      otherGroup.getChildren().slice().forEach((child) => {
        if (!child.scene) return; // destroyed earlier this frame
        warrior.handleAttackOverlapWith(child);
      });
    });
  }

  update(time, delta, enemyArmy) {
    this.debugGraphics.clear();

    this.warriors.getChildren().slice().forEach((child) => {
      if (!child.scene) return; // destroyed earlier this frame
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

    this.workers.getChildren().slice().forEach((child) => {
      if (!child.scene) return; // destroyed earlier this frame
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

    this.lancers.getChildren().slice().forEach((child) => {
      if (!child.scene) return; // destroyed earlier this frame
      if (child) {
        child.update(time, delta, enemyArmy);
      }
    });

    this.archers.getChildren().slice().forEach((child) => {
      if (!child.scene) return; // destroyed earlier this frame
      if (child) child.update(time, delta, enemyArmy);
    });
  }
}
