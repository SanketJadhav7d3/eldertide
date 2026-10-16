
import Entity from './playerEntity.js'
import { StructureStates } from './states.js';
import Warrior from './warriorEntity.js';
import Lancer from './lancerEntity.js';
import Archer from './archerEntity.js';
import Worker from './workerEntity.js';
import Projectile from './projectile.js';
import { THREAT_WEIGHTS } from './combatUnit.js';

export default class Structure extends Entity {

  constructor(scene, x, y, texture, bodyWidth, bodyHeight, bodyOffsetY, textureMap = {}, cost = {}, grid = null) {
    // The width and height passed to the parent Entity constructor are now for the physics body.
    super(scene, x, y, texture, bodyWidth, bodyHeight, 0, bodyOffsetY, null, null, grid);

    // Structures should be active (targetable) from the moment they are placed.
    this.active = true;

    // Set the physics body size and offset based on the new parameters.
    this.body.setSize(bodyWidth, bodyHeight);
    this.body.setOffset(this.width / 2 - bodyWidth / 2, bodyOffsetY);
    this.applyBodyGeometry();
    this.body.immovable = true; // Make sure structures don't get pushed by units
    this.visualOffset = 30;
    this.assignedWorkers = new Set();
    this.setInteractive(this.scene.input.makePixelPerfect());
    this.textureMap = textureMap;
    this.cost = cost;
    this.grid = grid;

    this.depthOffset = 40;

    this.blockHeight = 3;
    this.blockWidth = 3;

    this.fireEffects = [];
    this.fireEffectCoordinates = []; // Default to no fires
  }

  /**
   * Physics body of a building for the texture `textureKey`, in unscaled frame pixels
   * (offset from the frame's top-left). Classes with SPRITE_BOUNDS get a body that spans exactly
   * the visible (non-transparent) pixels of that texture; other classes use their FOOTPRINT box,
   * centred horizontally.
   */
  static bodyGeometry(textureKey, frameWidth, frameHeight) {
    const bounds = this.SPRITE_BOUNDS && this.SPRITE_BOUNDS[textureKey];
    if (bounds) {
      return {
        width: bounds.x1 - bounds.x0,
        height: bounds.y1 - bounds.y0,
        offsetX: bounds.x0,
        offsetY: bounds.y0,
      };
    }
    const { bodyWidth, bodyHeight, bodyOffsetY } = this.FOOTPRINT;
    return {
      width: bodyWidth,
      height: bodyHeight,
      offsetX: frameWidth / 2 - bodyWidth / 2,
      offsetY: bodyOffsetY,
    };
  }

  /**
   * The ground rectangle (world px) a building of this class occupies when its sprite, showing
   * `textureKey`, is placed at (x, y). Matches the physics body from applyBodyGeometry().
   */
  static groundRect(x, y, textureKey, frameWidth, frameHeight) {
    const geometry = this.bodyGeometry(textureKey, frameWidth, frameHeight);
    const { scale } = this.FOOTPRINT;
    return new Phaser.Geom.Rectangle(
      x + scale * (geometry.offsetX - frameWidth / 2),
      y + scale * (geometry.offsetY - frameHeight / 2),
      geometry.width * scale,
      geometry.height * scale
    );
  }

  // Base update method for depth sorting
  update(time, delta) {
    if (!this.active && this.currentState !== StructureStates.DESTROYED) return; // Prevent inactive structures from updating, but allow destroyed state to update texture

    // Dynamically set depth based on y-coordinate
    this.setDepth(this.y + this.depthOffset);
    this.updateBuildProgress(delta);
    this.updateTexture();

    // // Draw the physics body for debugging
    // if (this.scene.debugGraphics) {
    //   this.scene.debugGraphics.lineStyle(2, 0x00ff00, 1); // Green outline
    //   this.scene.debugGraphics.strokeRect(this.body.x, this.body.y, this.body.width, this.body.height);
    // }

    // --- Debug line for depth sorting ---
    //if (this.scene.debugGraphics) {
      //this.scene.debugGraphics.lineStyle(1, 0xffff00, 1); // Yellow line, 1px thick
      //this.scene.debugGraphics.lineBetween(this.x - 160, this.y + this.depthOffset, this.x + 160, this.y + this.depthOffset);
    //}
  }

  updateTexture() {
    if (!this.textureMap || Object.keys(this.textureMap).length === 0) return;

    const textureKey = this.textureMap[this.currentState];

    if (textureKey && this.texture.key !== textureKey) {
      this.setTexture(textureKey);
      this.applyBodyGeometry();
    }
  }

  /** Sizes and positions the physics body for the texture currently shown. */
  applyBodyGeometry() {
    const cls = this.constructor;
    if (!cls.FOOTPRINT || !this.body) return;
    // Textures without known bounds (e.g. destroyed rubble) keep the body as it is.
    if (cls.SPRITE_BOUNDS && !cls.SPRITE_BOUNDS[this.texture.key]) return;

    const geometry = cls.bodyGeometry(this.texture.key, this.width, this.height);
    this.body.setSize(geometry.width, geometry.height, false);
    this.body.setOffset(geometry.offsetX, geometry.offsetY);
  }

  /**
   * Makes tiles behind the structure unwalkable.
   * @param {Array<Array<number>>} relativeTiles - An array of [x, y] offsets from the structure's center tile.
   */
  blockTiles(relativeTiles) {
    if (!this.grid || !relativeTiles) return;

    const originTileX = Math.floor(this.x / 64);
    const originTileY = Math.floor(this.y / 64);

    for (var dx=originTileX-this.blockWidth; dx<=originTileX+this.blockWidth; dx++)
      for (var dy=originTileY-this.blockHeight; dy<=originTileY+this.blockHeight; dy++) { 
        this.grid.setWalkableAt(dx, dy, false);
        console.log('block tiles', dx, dy);
      }

  }

  addWorker(worker) {
    this.assignedWorkers.add(worker);
  }

  removeWorker(worker) {
    this.assignedWorkers.delete(worker);
  }

  updateBuildProgress(delta) {
    if (this.currentState !== StructureStates.CONSTRUCT || this.assignedWorkers.size === 0) {
      return;
    }

    // Each worker contributes to build progress over time
    this.buildProgress += this.assignedWorkers.size * 10 * (delta / 1000); // 10 points per second per worker

    if (this.buildProgress >= this.maxBuildProgress) {
      this.buildProgress = this.maxBuildProgress;
      this.currentState = StructureStates.BUILT;
      console.log(`${this.constructor.name} construction complete!`);
    }
  }

  flashRed() {
    this.setTint(0xff0000);
    this.scene.time.delayedCall(150, () => this.clearTint());
  }

  highlight() {
    // add a light blue tint here
    this.setTint(0x87cefa);
    this.scene.time.delayedCall(300, () => this.clearTint());
  }

  startBurning() {
    if (!this.fireEffectCoordinates || this.fireEffectCoordinates.length === 0) return;

    this.fireEffectCoordinates.forEach(coord => {
        const fireX = this.x + coord.x;
        const fireY = this.y + coord.y;

        const fire = this.scene.add.sprite(fireX, fireY, 'fire').play('fire-anim');
        // Ensure fire is on top of the rubble, which is at this.depth
        fire.setDepth(this.depth + 1);
        if (coord.scale) {
            fire.setScale(coord.scale);
        }
        this.fireEffects.push(fire);
    });

    // After a delay, destroy the fire effects.
    this.scene.time.delayedCall(8000, () => { // Let it burn for 8 seconds
        this.fireEffects.forEach(f => {
            this.scene.tweens.add({
                targets: f,
                alpha: 0,
                duration: 1000,
                onComplete: () => f.destroy()
            });
        });
        this.fireEffects = [];
    });
  }

  sustainDamage(amount) {
    // Prevent damage if the structure is already destroyed.
    // This allows damage during both CONSTRUCT and BUILT states.
    if (this.currentState === StructureStates.DESTROYED) return;

    this.health -= amount;
    this.setTint(0xff0000); // Use a red tint for a more visible "flash"
    this.scene.time.delayedCall(200, () => this.clearTint());

    if (this.health <= 0) {
      this.currentState = StructureStates.DESTROYED;
      this.active = false; // Mark as inactive for targeting
      this.body.enable = false; // No more collisions
      this.onDestroyed();
    }
  }

  /** Hook for subclasses that need to clean up when destroyed (e.g. refund queued units). */
  onDestroyed() {}
}

export class Tree extends Structure {
  constructor(scene, x, y) {
    // Define the available tree types
    const treeTypes = [
      { texture: 'tree-cuttable', anim: 'cuttable-tree-idle-anim', depthOffset: -18 },
      { texture: 'deco-tree-01', anim: 'deco-tree-01-idle-anim', depthOffset: -20 },
      { texture: 'deco-tree-02', anim: 'deco-tree-02-idle-anim', depthOffset: -16 },
      { texture: 'deco-tree-03', anim: 'deco-tree-03-idle-anim', depthOffset: -24 },
      { texture: 'deco-tree-04', anim: 'deco-tree-04-idle-anim', depthOffset: -24 }
    ];

    // Randomly select a tree type
    const selectedTreeType = Phaser.Math.RND.pick(treeTypes);

    // The physics body should be small, representing just the trunk.
    const bodyWidth = 32;
    const bodyHeight = 32;
    const bodyOffsetY = 0; // Position the body at the base of the large sprite.

    // We use the 'tree' texture loaded as a spritesheet.
    super(scene, x, y, selectedTreeType.texture, bodyWidth, bodyHeight, bodyOffsetY);

    // Trees are not built; they just exist.
    this.currentState = 'IDLE'; // A custom state for trees.
    this.health = 100; // Health for chopping.
    this.logHealthThreshold = 30; // Health at which the tree becomes a log.
    this.animationKey = selectedTreeType.anim; // Store the animation key
    this.setFrame(0); // Start with the first frame of the spritesheet.
    //this.setScale(0.8); // Adjust scale to fit the world.

    this.setOrigin(0.5, 1); // Set the origin to the bottom-center


    this.depthOffset = selectedTreeType.depthOffset; // Use the base of the trunk for depth sorting.
    this.setInteractive(this.scene.input.makePixelPerfect());
    // The animation will be started with a delay from the scene.

    this.woodCollected = false; // Flag to ensure collection animation only triggers once.
  }

  sustainDamage(amount) {
    // Don't call super.sustainDamage() because we want to control the 'active' state differently.
    if (this.currentState === StructureStates.DESTROYED) return;

    this.health = Math.max(0, this.health - amount); // Ensure health doesn't go below 0
    this.flashRed();

    if (this.health <= 0) {
      this.currentState = StructureStates.DESTROYED;
      this.active = false; // Mark as inactive for harvesting.
      this.body.enable = false; // Disable collisions.
      this.destroy(); // Disappear immediately.
    } else if (this.health <= this.logHealthThreshold) {
      // If health is below the threshold but not zero, it becomes a log.
      this.currentState = 'CHOPPED';
    }
  }

  update(time, delta) {
    super.update(time, delta); // This will call the depth setting from the parent Structure

    // --- Debug line for depth sorting ---
    //if (this.scene.debugGraphics) {
      //this.scene.debugGraphics.lineStyle(1, 0xffff00, 1); // Yellow line, 1px thick
      //this.scene.debugGraphics.lineBetween(this.x - 60, this.y + this.depthOffset, this.x + 60, this.y + this.depthOffset);
    //}

    if (this.currentState === 'CHOPPED') {
      // When chopped, show the log pile animation and stop it at the last frame.
      if (this.anims.currentAnim?.key !== 'wood-spawn-anim') {
        this.play('wood-spawn-anim');
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.anims.stop());
      }
    } else if (this.currentState === 'IDLE') {
      this.play(this.animationKey, true);
    }
  }
}

export class GoldMine extends Structure {
  constructor(scene, x, y) {
    // The physics body should represent the base of the mine.
    const bodyWidth = 64;
    const bodyHeight = 32;
    const bodyOffsetY = 32; // Position the body at the base of the sprite.

    // We use the 'gold-mine' texture.
    super(scene, x, y, 'gold-mine', bodyWidth, bodyHeight, bodyOffsetY);

    // Gold mines are not built; they are pre-placed on the map.
    this.currentState = 'IDLE'; // Custom state for gold mines.
    this.health = 1000; // Represents total gold available.

    this.setOrigin(0.5, 0.5);
    this.depthOffset = 32;
    this.setInteractive(this.scene.input.makePixelPerfect());
  }

  sustainDamage(amount) {
    if (!this.active) return 0;

    // Flash white when hit to distinguish from combat damage.
    this.setTint(0xffffff);
    this.scene.time.delayedCall(150, () => this.clearTint());

    const extractedAmount = Math.min(this.health, amount);
    this.health -= extractedAmount;

    if (this.health <= 0) {
      this.active = false;
      this.body.enable = false;
      this.destroy(); // Remove the mine when it's depleted.
    }

    // Return the amount of gold successfully mined.
    return extractedAmount;
  }
}

/**
 * Shared production-queue logic for structures that train units (Castle, Barracks, Archery).
 * Subclasses provide: spawnOffsets(), getUnitStats(type) and spawnUnit(type, pos),
 * and may override spawnFallback().
 */
class ProductionStructure extends Structure {
  spawnOffsets() {
    return [{ x: 0, y: 0 }];
  }

  // Used when every candidate spawn spot is blocked or occupied.
  spawnFallback() {
    return { x: this.spawnPoint.x, y: this.spawnPoint.y };
  }

  getUnitStats(unitType) {
    throw new Error(`${this.constructor.name}.getUnitStats not implemented`);
  }

  spawnUnit(unitType, pos) {
    throw new Error(`${this.constructor.name}.spawnUnit not implemented`);
  }

  findOpenSpawnPoint() {
    const baseSpawnX = this.spawnPoint.x;
    const baseSpawnY = this.spawnPoint.y;

    const army = this.scene.playerArmy;
    const allPlayerUnits = [
      ...army.warriors.getChildren(),
      ...army.lancers.getChildren(),
      ...army.workers.getChildren(),
      ...army.archers.getChildren(),
    ];

    for (const offset of this.spawnOffsets()) {
      const spawnX = baseSpawnX + offset.x;
      const spawnY = baseSpawnY + offset.y;

      // Skip spots where another unit is too close (32px personal space).
      const isOccupied = allPlayerUnits.some(unit =>
        Phaser.Math.Distance.Between(spawnX, spawnY, unit.x, unit.y) < 32);

      if (!isOccupied) {
        const tileX = Math.floor(spawnX / 32);
        const tileY = Math.floor(spawnY / 32);
        if (this.grid.isWalkableAt(tileX, tileY)) return { x: spawnX, y: spawnY };
      }
    }

    return this.spawnFallback();
  }

  addToProductionQueue(unitType, count = 1) {
    for (let i = 0; i < count; i++) {
      this.productionQueue.push(unitType);
    }
  }

  /**
   * Pays for a unit and queues it. Returns false (and charges nothing) if the player can't afford it.
   */
  queueUnit(unitType) {
    const cost = this.getUnitStats(unitType).cost;
    const resources = this.scene.resourceManager;
    if (!resources.hasEnough(cost)) return false;
    resources.spend(cost);
    this.addToProductionQueue(unitType, 1);
    return true;
  }

  /**
   * Cancels the most recently queued unit of `unitType` and refunds its full cost.
   * Cancelling the unit currently being trained resets the training progress.
   */
  cancelQueuedUnit(unitType) {
    const index = this.productionQueue.lastIndexOf(unitType);
    if (index === -1) return false;
    this.productionQueue.splice(index, 1);
    if (index === 0) this.productionProgress = 0;
    this.refund(unitType);
    return true;
  }

  refund(unitType) {
    const cost = this.getUnitStats(unitType).cost;
    for (const resource in cost) {
      this.scene.resourceManager.add(resource, cost[resource]);
    }
  }

  /** A destroyed building gives back everything still waiting in its queue. */
  onDestroyed() {
    this.productionQueue.forEach(unitType => this.refund(unitType));
    this.productionQueue = [];
    this.productionProgress = 0;
  }

  updateProduction(delta) {
    if (this.productionQueue.length === 0) return;

    const unitType = this.productionQueue[0]; // Peek at the front of the queue
    const unitStats = this.getUnitStats(unitType);

    this.productionProgress += delta;
    if (this.productionProgress >= unitStats.buildTime) {
      this.productionProgress = 0;
      this.productionQueue.shift();
      this.spawnUnit(unitType, this.findOpenSpawnPoint());
    }
  }
}

export class Castle extends ProductionStructure {
  // Ground footprint used for placement checks: the physics body (px) and sprite scale.
  static FOOTPRINT = { bodyWidth: 280, bodyHeight: 100, bodyOffsetY: 150, scale: 0.8 };
  // Visible-pixel bounds of each texture (x0,y0 inclusive; x1,y1 exclusive), measured from the
  // images. The physics body and placement footprint span exactly these pixels.
  static SPRITE_BOUNDS = {
    'castle-tiles': { x0: 12, y0: 45, x1: 308, y1: 250 },
    'castle-construct-tiles': { x0: 16, y0: 140, x1: 304, y1: 247 },
  };

  static COST = {
    wood: 300,
    gold: 150,
  };
  static WORKER_STATS = {
    cost: { meat: 10 }, // Workers cost meat
    buildTime: 4000, // 4 seconds
  };

  constructor(scene, x, y, width, height, texture) {
    // Make the physics body shorter than the sprite to allow units to walk behind it.
    const { bodyWidth, bodyHeight, bodyOffsetY } = Castle.FOOTPRINT;

    const textureMap = {
      [StructureStates.CONSTRUCT]: 'castle-construct-tiles',
      [StructureStates.BUILT]: 'castle-tiles',
      [StructureStates.DESTROYED]: 'castle-destroyed-tiles'
    };

    super(scene, x, y, textureMap[StructureStates.CONSTRUCT], bodyWidth, bodyHeight, bodyOffsetY, textureMap, Castle.COST, scene.grid);
    this.currentState = StructureStates.CONSTRUCT;
    this.buildProgress = 0;
    this.maxBuildProgress = 200; // Castles should take longer to build
    this.health = 2000;
    
    this.fireEffectCoordinates = [
      { x: 0, y: -85, scale: 1.0 },
      { x: -90, y: -50, scale: 0.8 },
      { x: 0, y: 80, scale: 0.5 },
      { x: 90, y: 0, scale: 0.5 }
    ];

    this.productionQueue = [];
    this.productionProgress = 0;
    this.spawnPoint = { x: this.x, y: this.y + 40 }; // Fixed so units appear in front of the castle.

    this.on('pointerdown', (pointer) => {
      if (this.currentState === StructureStates.BUILT) {
        console.log('Castle selected. Opening production UI...');
        this.scene.events.emit('castle-selected', this);
        this.highlight();
      } else {
        console.log('Castle is still under construction.');
      }
    });

    // Initial depth for construction phase
    this.depthOffset = 40;

    // Define and block the tiles behind the castle
    const unwalkableTiles = [
      [-3, -2], [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2], [3, -2],
      [-3, -1], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [3, -1],
      [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0]
    ];

    //this.blockTiles(unwalkableTiles);
  }

  spawnOffsets() {
    return [
      { x: 0, y: 120 },    // Directly in front
      { x: -60, y: 120 },  // Left
      { x: 60, y: 120 },   // Right
      { x: -120, y: 120 }, // Far left
      { x: 120, y: 120 },  // Far right
    ];
  }

  spawnFallback() {
    return { x: this.spawnPoint.x, y: this.spawnPoint.y + 120 };
  }

  getUnitStats(unitType) {
    return Castle.WORKER_STATS;
  }

  spawnUnit(unitType, pos) {
    if (unitType === 'worker') {
      this.scene.playerArmy.spawnWorker(pos.x / 64, pos.y / 64);
    }
  }

  update(time, delta) {
    // Set depth offset based on the current state
    if (this.currentState === StructureStates.BUILT) {
      this.depthOffset = 80; // Final depth for the built castle
    } else {
      this.depthOffset = 40; // Depth during construction
    }
    super.update(time, delta); // Call base update for depth sorting
    if (this.currentState === StructureStates.BUILT) {
      this.updateProduction(delta);
    }
  }
}

export class House extends Structure {
  // Ground footprint used for placement checks: the physics body (px) and sprite scale.
  static FOOTPRINT = { bodyWidth: 100, bodyHeight: 80, bodyOffsetY: 100, scale: 0.8 };
  // Visible-pixel bounds of each texture (x0,y0 inclusive; x1,y1 exclusive), measured from the
  // images. The physics body and placement footprint span exactly these pixels.
  static SPRITE_BOUNDS = {
    'house-tiles': { x0: 10, y0: 24, x1: 118, y1: 172 },
    'house-construct-tiles': { x0: 16, y0: 90, x1: 112, y1: 184 },
  };

  static COST = {
    wood: 50,
  };

  constructor(scene, x, y, width, height, texture) {
    // Define a smaller physics body for the house.
    const { bodyWidth, bodyHeight, bodyOffsetY } = House.FOOTPRINT;
    const textureMap = {
      [StructureStates.CONSTRUCT]: 'house-construct-tiles',
      [StructureStates.BUILT]: 'house-tiles',
      [StructureStates.DESTROYED]: 'house-destroyed-tiles'
    };
    super(scene, x, y, textureMap[StructureStates.CONSTRUCT], bodyWidth, bodyHeight, bodyOffsetY, textureMap, House.COST, scene.grid);
    this.currentState = StructureStates.CONSTRUCT;
    this.buildProgress = 0;
    this.maxBuildProgress = 80; // Houses can be faster to build
    this.health = 500;

    this.on('pointerdown', (pointer) => {
      console.log('you clicked house');
    });

    // Define and block the tiles behind the house
    const unwalkableTiles = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0], [0, 0], [1, 0]
    ];
    //this.blockTiles(unwalkableTiles);

    this.fireEffectCoordinates = [
      { x: -20, y: 20, scale: 0.6 },
      { x: 30, y: -10, scale: 0.7 }
    ];
  }

  update(time, delta) {
    // For House, the depth can remain the same for both states
    if (this.currentState === StructureStates.BUILT) {
      this.depthOffset = 60;
    } else {
      this.depthOffset = 10;
    }
    super.update(time, delta); // Call base update for depth sorting

    // --- Debug line for depth sorting ---
    // ...
  }
}

export class Tower extends Structure {
  // Ground footprint used for placement checks: the physics body (px) and sprite scale.
  static FOOTPRINT = { bodyWidth: 80, bodyHeight: 50, bodyOffsetY: 180, scale: 0.8 };

  static COST = {
    wood: 300,
    gold: 100,
  };

  // A built tower shoots the most threatening enemy within `range` px (barrels first, then
  // bombers, then goblins; closest wins within a type).
  static ATTACK_STATS = {
    range: 450,
    damage: 20,
    cooldown: 1200, // ms between shots
    scanInterval: 250, // ms between target scans while idle
    muzzleOffsetY: 70, // arrows leave from the tower top, this many px above its centre
  };

  constructor(scene, x, y, width, height) {
    // Define a smaller physics body for the tower.
    const { bodyWidth, bodyHeight, bodyOffsetY } = Tower.FOOTPRINT;
    const textureMap = {
      [StructureStates.CONSTRUCT]: 'tower-construct-tiles',
      [StructureStates.BUILT]: 'tower-tiles',
      [StructureStates.DESTROYED]: 'tower-destroyed-tiles'
    };
    super(scene, x, y, 'tower-construct-tiles', bodyWidth, bodyHeight, bodyOffsetY, textureMap, Tower.COST, scene.grid);
    this.currentState = StructureStates.CONSTRUCT;
    this.visualOffset = 80;

    this.buildProgress = 0;
    this.maxBuildProgress = 100;

    this.health = 800;

    // array of warriors protecting the tower
    this.warriorsProtecting = [];

    this.lastShotTime = 0;
    this.nextScanTime = 0;

    this.on('pointerdown', (pointer) => {
      console.log('you clicked tower');
    });


    // Initial depth for construction phase
    this.depthOffset = 40;

    // Define and block the tiles behind the tower
    const unwalkableTiles = [
      [-1, -2], [0, -2], [1, -2], [-1, -1], [0, -1], [1, -1], [0, 0]
    ];
    //this.blockTiles(unwalkableTiles);

    this.fireEffectCoordinates = [
      { x: 0, y: -85, scale: 1.0 },
      { x: 0, y: 80, scale: 0.5 }
    ];
  }

  update(time, delta) {
    // Set depth offset based on the current state
    if (this.currentState === StructureStates.BUILT) {
      this.depthOffset = 80; // Final depth for the built tower
    } else {
      this.depthOffset = 40; // Depth during construction
    }
    super.update(time, delta); // Call base update for depth sorting

    if (this.currentState === StructureStates.BUILT) {
      this.updateAttack(time);
    }
  }

  updateAttack(time) {
    const stats = Tower.ATTACK_STATS;
    if (time < this.lastShotTime + stats.cooldown || time < this.nextScanTime) return;
    this.nextScanTime = time + stats.scanInterval;

    const target = this.findTarget(stats.range);
    if (!target) return;

    // Same arrow the archers use; it leads moving targets and does its damage on impact.
    const arrow = new Projectile(this.scene, this.x, this.y - stats.muzzleOffsetY,
      'arrow-projectile', target, stats.damage);
    arrow.play('arrow-flying');
    arrow.launch();
    this.lastShotTime = time;
  }

  findTarget(range) {
    const enemyArmy = this.scene.enemyArmy;
    let best = null;
    let bestScore = Infinity;
    for (const [groupName, weight] of THREAT_WEIGHTS) {
      for (const enemy of enemyArmy[groupName].getChildren()) {
        if (!enemy.active || enemy.health <= 0 || enemy.currentState === 'DEAD') continue;
        const distance = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
        if (distance > range) continue;
        const score = distance * weight;
        if (score < bestScore) {
          bestScore = score;
          best = enemy;
        }
      }
    }
    return best;
  }
}

export class Barracks extends ProductionStructure {
  // Ground footprint used for placement checks: the physics body (px) and sprite scale.
  static FOOTPRINT = { bodyWidth: 150, bodyHeight: 160, bodyOffsetY: 80, scale: 1 };
  // Visible-pixel bounds of each texture (x0,y0 inclusive; x1,y1 exclusive), measured from the
  // images. The physics body and placement footprint span exactly these pixels.
  static SPRITE_BOUNDS = {
    'barracks-tiles': { x0: 4, y0: 58, x1: 188, y1: 245 },
    'barracks-construct-tiles': { x0: 12, y0: 96, x1: 179, y1: 244 },
  };

  static COST = {
    wood: 300,
    gold: 150,
  };
  static WARRIOR_STATS = {
    cost: { gold: 0, meat: 15 }, // Assuming 'meat' is a resource
    buildTime: 5000, // 5 seconds in milliseconds
  };
  static LANCER_STATS = {
    cost: { gold: 0, meat: 25 }, // More expensive than a warrior
    buildTime: 7000, // 7 seconds
  };

  constructor(scene, x, y, width, height, texture) {
    // Define a smaller physics body for the barracks.
    const { bodyWidth, bodyHeight, bodyOffsetY } = Barracks.FOOTPRINT;
    const textureMap = {
      [StructureStates.CONSTRUCT]: 'barracks-construct-tiles',
      [StructureStates.BUILT]: 'barracks-tiles',
      [StructureStates.DESTROYED]: 'barracks-destroyed-tiles'
    };
    super(scene, x, y, textureMap[StructureStates.CONSTRUCT], bodyWidth, bodyHeight, bodyOffsetY, textureMap, Barracks.COST, scene.grid);
    this.currentState = StructureStates.CONSTRUCT;
    this.buildProgress = 0;
    this.maxBuildProgress = 120; // Slower than a house
    this.health = 1000;
    this.setScale(Barracks.FOOTPRINT.scale);

    this.productionQueue = [];
    this.productionProgress = 0;
    this.spawnPoint = { x: this.x, y: this.y + 80 }; // Fixed (independent of the body height) so units appear in front.

    this.on('pointerdown', (pointer) => {
      if (this.currentState === StructureStates.BUILT) {
        console.log('Barracks selected. Opening production UI...');
        // Emit an event for the UI to listen to.
        // This decouples the game entity from the UI implementation.
        this.scene.events.emit('barracks-selected', this);
        this.highlight();
      } else {
        console.log('Barracks is still under construction.');
      }
    });

    // Define and block the tiles behind the barracks
    const unwalkableTiles = [
      [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
      [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0]
    ];
    //this.blockTiles(unwalkableTiles);

    this.fireEffectCoordinates = [
      { x: -50, y: 0, scale: 0.8 },
      { x: 50, y: 20, scale: 0.8 }
    ];
  }

  spawnOffsets() {
    return [
      { x: 0, y: 40 },    // Directly in front
      { x: -50, y: 40 },  // Left
      { x: 50, y: 40 },   // Right
      { x: -100, y: 40 }, // Far left
      { x: 100, y: 40 },  // Far right
      { x: 0, y: 90 },    // Front row 2
      { x: -50, y: 90 },
      { x: 50, y: 90 },
    ];
  }

  getUnitStats(unitType) {
    return unitType === 'warrior' ? Barracks.WARRIOR_STATS : Barracks.LANCER_STATS;
  }

  spawnUnit(unitType, pos) {
    const scene = this.scene;
    if (unitType === 'warrior') {
      const warrior = new Warrior(scene, pos.x, pos.y, 40, 75, 0, 0, scene.pathLayer, scene.finder, scene.grid);
      scene.playerArmy.warriors.add(warrior);
    } else if (unitType === 'lancer') {
      const lancer = new Lancer(scene, pos.x, pos.y, 40, 75, 0, 0, scene.pathLayer, scene.finder, scene.grid);
      scene.playerArmy.lancers.add(lancer);
    }
    scene.sound.play('warrior-trained-sound');
  }

  update(time, delta) {
    // For Barracks, the depth can remain the same for both states
    if (this.currentState === StructureStates.BUILT) {
      this.depthOffset = 100;
    } else {
      this.depthOffset = -40;
    }
    super.update(time, delta); // Call base update for depth sorting
    if (this.currentState === StructureStates.BUILT) {
      this.updateProduction(delta);
    }
  }
}

export class Archery extends ProductionStructure {
  // Ground footprint used for placement checks: the physics body (px) and sprite scale.
  static FOOTPRINT = { bodyWidth: 150, bodyHeight: 160, bodyOffsetY: 80, scale: 1.2 };
  // Visible-pixel bounds of each texture (x0,y0 inclusive; x1,y1 exclusive), measured from the
  // images. The physics body and placement footprint span exactly these pixels.
  static SPRITE_BOUNDS = {
    'archery-tiles': { x0: 3, y0: 61, x1: 186, y1: 240 },
    'archery-construct-tiles': { x0: 3, y0: 115, x1: 181, y1: 239 },
  };

  static COST = {
    wood: 300,
    gold: 100,
  };
  static ARCHER_STATS = {
    cost: { wood: 25, meat: 15 },
    buildTime: 6000, // 6 seconds
  };

  constructor(scene, x, y, width, height, texture) {
    // Define a smaller physics body for the archery range.
    const { bodyWidth, bodyHeight, bodyOffsetY } = Archery.FOOTPRINT;
    const textureMap = {
      [StructureStates.CONSTRUCT]: 'archery-construct-tiles',
      [StructureStates.BUILT]: 'archery-tiles',
      [StructureStates.DESTROYED]: 'archery-destroyed-tiles'
    };
    super(scene, x, y, textureMap[StructureStates.CONSTRUCT], bodyWidth, bodyHeight, bodyOffsetY, textureMap, Archery.COST, scene.grid);
    this.currentState = StructureStates.CONSTRUCT;
    this.buildProgress = 0;
    this.maxBuildProgress = 120; // Slower than a house
    this.health = 1000;
    this.setScale(Archery.FOOTPRINT.scale);
    this.productionQueue = [];
    this.productionProgress = 0;
    this.spawnPoint = { x: this.x, y: this.y + 116 }; // Fixed (independent of the body height) so units appear in front.

    this.on('pointerdown', (pointer) => {
      if (this.currentState === StructureStates.BUILT) {
        console.log('Archery selected. Opening production UI...');
        this.scene.events.emit('archery-selected', this);
        this.highlight();
      } else {
        console.log('Archery is still under construction.');
      }
    });

    // Define and block the tiles behind the archery range
    const unwalkableTiles = [
      [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
      [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0]
    ];
    //this.blockTiles(unwalkableTiles);

    this.fireEffectCoordinates = [
      { x: -40, y: 10, scale: 0.7 },
      { x: 40, y: 10, scale: 0.7 }
    ];
  }

  spawnOffsets() {
    return [
      { x: 0, y: 60 },    // Directly in front
      { x: -50, y: 60 },  // Left
      { x: 50, y: 60 },   // Right
      { x: -100, y: 60 }, // Far left
      { x: 100, y: 60 },  // Far right
      { x: 0, y: 110 },   // Front row 2
      { x: -50, y: 110 },
      { x: 50, y: 110 },
    ];
  }

  getUnitStats(unitType) {
    return Archery.ARCHER_STATS;
  }

  spawnUnit(unitType, pos) {
    const scene = this.scene;
    if (unitType === 'archer') {
      const archer = new Archer(scene, pos.x, pos.y, 40, 75, 0, 0, scene.pathLayer, scene.finder, scene.grid);
      scene.playerArmy.archers.add(archer);
    }
  }

  update(time, delta) {
    // For Archery, the depth can remain the same for both states
    if (this.currentState === StructureStates.BUILT) {
      this.depthOffset = 130;
    } else {
      this.depthOffset = -10;
    }
    super.update(time, delta); // Call base update for depth sorting
    if (this.currentState === StructureStates.BUILT) {
      this.updateProduction(delta);
    }
  }
}

export class Monastery extends Structure {
  // Ground footprint used for placement checks: the physics body (px) and sprite scale.
  static FOOTPRINT = { bodyWidth: 150, bodyHeight: 160, bodyOffsetY: 80, scale: 0.8 };
  // Visible-pixel bounds of each texture (x0,y0 inclusive; x1,y1 exclusive), measured from the
  // images. The physics body and placement footprint span exactly these pixels.
  static SPRITE_BOUNDS = {
    'monastery-tiles': { x0: 16, y0: 45, x1: 176, y1: 310 },
    'monastery-construct-tiles': { x0: 12, y0: 96, x1: 179, y1: 244 },
  };

  static COST = {
    wood: 400,
    gold: 70,
  };

  constructor(scene, x, y, width, height, texture) {
    // Define a smaller physics body for the monastery.
    const { bodyWidth, bodyHeight, bodyOffsetY } = Monastery.FOOTPRINT;
    const textureMap = {
      [StructureStates.CONSTRUCT]: 'monastery-construct-tiles',
      [StructureStates.BUILT]: 'monastery-tiles',
      [StructureStates.DESTROYED]: 'monastery-destroyed-tiles'
    };
    super(scene, x, y, textureMap[StructureStates.CONSTRUCT], bodyWidth, bodyHeight, bodyOffsetY, textureMap, Monastery.COST, scene.grid);
    this.currentState = StructureStates.CONSTRUCT;
    this.buildProgress = 0;
    this.maxBuildProgress = 150; // Even slower
    this.health = 1200;

    this.on('pointerdown', (pointer) => {
      console.log('you clicked monastery');
    });

    // Define and block the tiles behind the monastery
    const unwalkableTiles = [
      [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
      [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0]
    ];
    //this.blockTiles(unwalkableTiles);

    this.fireEffectCoordinates = [
      { x: -60, y: 20, scale: 0.9 },
      { x: 60, y: 20, scale: 0.9 }
    ];
  }

  update(time, delta) {
    // For Monastery, the depth can remain the same for both states
    if (this.currentState === StructureStates.BUILT) {
      this.depthOffset = 105;
    } else {
      this.depthOffset = -30;
    }
    super.update(time, delta); // Call base update for depth sorting
  }
}

export class Towers {
  constructor(scene, towerPoints) {
    this.towerPoints = towerPoints;
    this.scene = scene;
    this.towersGroup = this.scene.physics.add.staticGroup();

    this.towerPoints.forEach(object => {

      let obj = new Tower(this.scene, object.x, object.y, 100, 100);

      // game logic 
      // playerArmy.warriors.children.iterate((child) => {
        // this.physics.add.collider(child, obj);
        // obj.handleOverlapWith(child);
      // });

      this.towersGroup.add(obj);
    });
  }

  update(time, delta) {
    this.towersGroup.children.iterate((child) => {
      child.update(time, delta);
    });
  }
}
