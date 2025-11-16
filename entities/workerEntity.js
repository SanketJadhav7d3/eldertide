

import Entity from './playerEntity.js'
import { WorkerStates } from './states.js';

export default class Worker extends Entity {
  constructor(scene, x, y, width, height, offsetX, offsetY, pathLayer, finder, grid) {

    super(scene, x, y, width, height, offsetX, offsetY, 'worker-entity', pathLayer, finder, grid);

    this.currentState = WorkerStates.IDLE_LEFT;
    this.health = 30;
    this.targetStructure = null;
    this.isDying = false; // Flag to ensure death sequence runs only once
  }

  stopCurrentTask() {
    console.log("Worker is stopping its current task.");
    // Stop any movement tweens
    this.stopMoving();

    // If the worker was building, remove it from the structure's list
    if (this.targetStructure) {
      this.targetStructure.removeWorker(this);
    }
    this.targetStructure = null;

    // Transition to an idle state if not already idle
    if (!this.currentState.includes("IDLE")) {
      this.transitionStateTo(this.currentState.includes("LEFT") ? "IDLE_LEFT" : "IDLE_RIGHT");
    }
  }

  sustainDamage(amount) {
    this.health -= amount;
    this.setTint(0xff0000); // Use a red tint for a more visible "flash"

    this.scene.time.delayedCall(200, () => {
      this.clearTint();
    });

    if (this.health <= 0) {
      this.stopCurrentTask();
      this.isDying = true;
      this.transitionStateTo('DEAD');
      this.setDepth(-1); // Set depth to appear behind other entities


      // Move from active army to dying group
      this.scene.playerArmy.workers.remove(this);
      this.scene.dyingEntities.add(this);
    }
  }

  buildStructure(structure) {
    this.stopCurrentTask(); // Stop whatever the worker was doing before.

    // Define what happens when the worker arrives at the build site
    const onArrival = () => {
      this.transitionStateTo(this.targetStructure.x > this.x ? "HAMMER_RIGHT" : "HAMMER_LEFT");
      // Add this worker to the structure's list of builders
      this.targetStructure.addWorker(this);
    };

    this.targetStructure = structure;
    const structureTile = structure.getPosTile();
    // Find the best adjacent tile to move to for building
    const allWorkers = this.scene.playerArmy.workers.getChildren();
    const occupiedTiles = new Set(allWorkers
      .filter(w => w !== this && w.targetStructure === structure)
      .map(w => `${w.targetTile.x},${w.targetTile.y}`));

    const adjacentTiles = [
      //{ x: structureTile[0], y: structureTile[1] - 1 }, // Top
      { x: structureTile[0] - 1, y: structureTile[1] }, // Left
      { x: structureTile[0] + 1, y: structureTile[1] }, // Right
      { x: structureTile[0], y: structureTile[1] + 1 }, // Bottom
    ];

    let bestTile = null;
    let minDistance = Infinity;

    const workerTile = this.getPosTile(); // Get the current worker's tile position
    for (const tile of adjacentTiles) {
      // Check if the tile is walkable using the grid
      const tileKey = `${tile.x},${tile.y}`;
      if (this.grid.isWalkableAt(tile.x, tile.y) && !occupiedTiles.has(tileKey)) {
        const distance = Phaser.Math.Distance.Between(workerTile[0], workerTile[1], tile.x, tile.y);
        if (distance < minDistance) {
          minDistance = distance;
          bestTile = tile;
        }
      }
    }

    if (bestTile) {
      this.targetTile = { x: bestTile.x, y: bestTile.y };
      this.moveToBuildSite(bestTile.x, bestTile.y, this.grid, onArrival);
    } else {
      console.warn("No walkable tile found next to the structure for building.");
      // Optional: Revert to idle state if no build position is available
      this.targetStructure = null;
    }
  }

  moveToBuildSite(tileX, tileY, grid, onCompleteCallback) {
    // This is an internal move command for building, so we don't stop the current task.
    super.moveToTile(tileX, tileY, grid, onCompleteCallback);
  }

  moveToTile(tileX, tileY, grid, onCompleteCallback = null) {
    // When a worker is given a generic move order, it should stop building.
    this.stopCurrentTask();
    super.moveToTile(tileX, tileY, grid, onCompleteCallback);
  }

  cutTree(tree) {
    console.log("Worker is going to cut a tree.");
    // Future logic: move to tree, play 'CUT' animation
  }

  mineGold(goldmine) {
    console.log("Worker is going to mine gold.");
    // Future logic: move to goldmine, play 'HAMMER' animation
  }

  update(time, delta, enemyArmy) {

    this.setDepth(this.y);

    // If the worker is in a build state but the target is gone or complete, switch to idle.
    if ((this.currentState === "HAMMER_LEFT" || this.currentState === "HAMMER_RIGHT") && (!this.targetStructure || this.targetStructure.currentState !== 'CONSTRUCT')) {
      this.stopCurrentTask();
      this.transitionStateTo(this.currentState === "HAMMER_LEFT" ? "IDLE_LEFT" : "IDLE_RIGHT");
    }

    if (this.currentState === "RUN_RIGHT") {
      // this.flipX = false;
      this.setFlipX(false);
      this.play('worker-run-anim', true);
    }

    if (this.currentState == "RUN_LEFT") {
      // this.flipX = true;
      this.setFlipX(true);
      this.play('worker-run-anim', true);
    }

    if (this.currentState == "IDLE_LEFT") {
      this.setFlipX(true);
      this.play('worker-idle-anim', true);
    }

    if (this.currentState == "IDLE_RIGHT") {
      this.setFlipX(false);
      this.play('worker-idle-anim', true);
    }

    if (this.currentState == "CUT_RIGHT") {
      this.setFlipX(false);
      this.play('worker-cut-anim', true);
    }

    if (this.currentState == "CUT_LEFT") {
      this.setFlipX(true);
      this.play('worker-cut-anim', true);
    }

    if (this.currentState == "HAMMER_LEFT") {
      this.setFlipX(true);
      this.play('worker-hammer-anim', true);
    }

    if (this.currentState == "HAMMER_RIGHT") {
      this.setFlipX(false);
      this.play('worker-hammer-anim', true);
    }

    if (this.currentState === 'DEAD') {
      if (this.isDying) {

        console.log('worker died');

        this.isDying = false; // Prevent this block from running again
        this.anims.stop(); // Stop any previous animation

        // Play the first death animation
        this.play('dead-anim-1', true);

        // When the first animation completes, play the second one
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'dead-anim-1', () => {
          // Add a delay before playing the second animation
          this.scene.time.delayedCall(2000, () => {
            this.play('dead-anim-2', true);
            // After the second animation completes, destroy the game object
            this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'dead-anim-2', () => {
              this.destroy();
            });
          });
        });
      }
    }
  }
}
