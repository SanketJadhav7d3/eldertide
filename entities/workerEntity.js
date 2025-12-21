

import Entity from './playerEntity.js'
import { WorkerStates } from './states.js';

export default class Worker extends Entity {
  constructor(scene, x, y, width, height, offsetX, offsetY, pathLayer, finder, grid) {

    super(scene, x, y, 'worker-entity', width, height, offsetX, offsetY, pathLayer, finder, grid);

    this.currentState = WorkerStates.IDLE_LEFT;
    this.health = 30;
    this.targetObject = null; // Can be a structure or a resource
    this.continuousTask = null; // e.g., 'wood', 'meat', 'gold'
    this.isDying = false; // Flag to ensure death sequence runs only once
  }

  stopCurrentTask() {
    console.log("Worker is stopping its current task.");
    this.continuousTask = null;
    // Stop any movement tweens
    this.stopMoving();

    // If the worker was building, remove it from the structure's list
    if (this.targetObject && this.targetObject.removeWorker) {
      this.targetObject.removeWorker(this);
    }
    this.targetObject = null;

    // Transition to an idle state if not already idle
    if (!this.currentState.includes("IDLE")) {
      this.transitionStateTo(this.currentState.includes("LEFT") ? "IDLE_LEFT" : "IDLE_RIGHT");
    }
  }

  sustainDamage(amount) {
    if (this.isDying) return;
    this.health -= amount;
    this.setTint(0xff0000); // Use a red tint for a more visible "flash"

    this.scene.time.delayedCall(200, () => {
      this.clearTint();
    });

    if (this.health <= 0) {      
      this.isDying = true;
      this.stopCurrentTask();
      this.transitionStateTo('DEAD');
      this.setDepth(-1); // Set depth to appear behind other entities


      // Move from active army to dying group
      this.scene.playerArmy.workers.remove(this);
      this.scene.dyingEntities.add(this);
    }
  }

  buildStructure(structure) {
    this.continuousTask = null; // Building is a one-off task
    this.stopCurrentTask(); // Stop whatever the worker was doing before.

    // Highlight the target structure
    if (structure && typeof structure.highlight === 'function') {
      structure.highlight();
    }

    // Define what happens when the worker arrives at the build site
    const onArrival = () => {
      this.transitionStateTo(this.targetObject.x > this.x ? "HAMMER_RIGHT" : "HAMMER_LEFT");
      // Add this worker to the structure's list of builders
      this.targetObject.addWorker(this);
    };

    this.targetObject = structure;
    const structureTile = structure.getPosTile();
    // Find the best adjacent tile to move to for building
    const allWorkers = this.scene.playerArmy.workers.getChildren();
    const occupiedTiles = new Set(allWorkers
      .filter(w => w !== this && w.targetObject === structure)
      .map(w => `${w.targetTile.x},${w.targetTile.y}`));

    const adjacentTiles = [
      //{ x: structureTile[0], y: structureTile[1] - 1 }, // Top
      { x: structureTile[0] - 2, y: structureTile[1] }, // Left
      { x: structureTile[0] + 2, y: structureTile[1] }, // Right
      //{ x: structureTile[0], y: structureTile[1] + 1 }, // Bottom
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
      this.moveToAndExecuteTask(bestTile.x, bestTile.y, this.grid, onArrival);
    } else {
      console.warn("No walkable tile found next to the structure for building.");
      // Revert to idle state if no build position is available
      this.targetObject = null;
    }
  }

  moveToAndExecuteTask(tileX, tileY, grid, onCompleteCallback) {
    // This is an internal move command for a task, so we don't stop the current task.
    super.moveToTile(tileX, tileY, grid, onCompleteCallback);
  }

  moveToTile(tileX, tileY, grid, onCompleteCallback = null) {
    // When a worker is given a generic move order, it should stop its current task.
    this.stopCurrentTask();
    super.moveToTile(tileX, tileY, grid, onCompleteCallback);
  }

  cutTree(tree) {
    this.stopCurrentTask();
    this.continuousTask = 'wood';

    if (tree) {
      // Highlight the target tree
      if (typeof tree.highlight === 'function') {
        tree.highlight();
      }

      this.targetObject = tree;
      const treeTile = tree.getPosTile();

      // Find a walkable adjacent tile (similar to building)
      const adjacentTiles = [
        //{ x: treeTile[0] - 1, y: treeTile[1] - 1 },

        //{ x: treeTile[0], y: treeTile[1]},
        { x: treeTile[0] + 2, y: treeTile[1] - 2},
        { x: treeTile[0] - 2, y: treeTile[1] - 2},

        //{ x: treeTile[0] - 1, y: treeTile[1] },
        //{ x: treeTile[0] + 1, y: treeTile[1] },
        //{ x: treeTile[0] - 1, y: treeTile[1] + 1 },
        //{ x: treeTile[0], y: treeTile[1] + 1 },
        //{ x: treeTile[0] + 1, y: treeTile[1] + 1 },
      ];

      let bestTile = null;
      let minWorkerDist = Infinity;
      const workerTile = this.getPosTile();

      // Find the closest valid adjacent tile for the worker to stand on
      for (const tile of adjacentTiles) {
        if (this.grid.isWalkableAt(tile.x, tile.y)) {
          const distance = Phaser.Math.Distance.Between(workerTile[0], workerTile[1], tile.x, tile.y);
          if (distance < minWorkerDist) {
            minWorkerDist = distance;
            bestTile = tile;
          }
        }
      }

      if (bestTile) {
        const onArrival = () => {
          // Stop listening to old animation events to prevent multiple triggers
          this.off(Phaser.Animations.Events.ANIMATION_UPDATE);

          // When the worker arrives, listen for the animation update
          this.on(Phaser.Animations.Events.ANIMATION_UPDATE, (anim, frame) => {
            // Check if it's the correct animation and frame
            if (anim.key === 'worker-cut-anim' && frame.index === 4) {              
              // On the impact frame, damage the tree
              if (this.targetObject && typeof this.targetObject.sustainDamage === 'function') {
                // Grant resources to the player for each successful hit.
                const woodPerHit = 5; // Define how much wood is granted per swing.
                this.scene.resourceManager.add('wood', woodPerHit);
                this.targetObject.sustainDamage(10); // Deal 10 damage per swing
              }
            }
          });

          this.transitionStateTo(this.targetObject.x > this.x ? "CUT_RIGHT" : "CUT_LEFT");
        };
        this.moveToAndExecuteTask(bestTile.x, bestTile.y, this.grid, onArrival);
      } else {
        console.warn("No walkable tile found next to the tree.");
        this.targetObject = null;
      }
    }
  }

  mineGold(goldMine) {
    this.stopCurrentTask();
    this.continuousTask = 'gold';

    if (goldMine) {
      if (typeof goldMine.highlight === 'function') {
        goldMine.highlight();
      }

      this.targetObject = goldMine;
      const mineTile = goldMine.getPosTile();

      // Find a walkable adjacent tile
      const adjacentTiles = [
        { x: mineTile[0] - 2, y: mineTile[1] }, // Left
        { x: mineTile[0] + 2, y: mineTile[1] }, // Right
        { x: mineTile[0], y: mineTile[1] + 2 }, // Bottom
      ];

      let bestTile = null;
      let minWorkerDist = Infinity;
      const workerTile = this.getPosTile();

      for (const tile of adjacentTiles) {
        if (this.grid.isWalkableAt(tile.x, tile.y)) {
          const distance = Phaser.Math.Distance.Between(workerTile[0], workerTile[1], tile.x, tile.y);
          if (distance < minWorkerDist) {
            minWorkerDist = distance;
            bestTile = tile;
          }
        }
      }

      if (bestTile) {
        const onArrival = () => {
          this.off(Phaser.Animations.Events.ANIMATION_UPDATE);
 
          // When the worker arrives, listen for the animation update
          this.on(Phaser.Animations.Events.ANIMATION_UPDATE, (anim, frame) => {
            // Check if it's the correct animation and frame
            if (anim.key === 'worker-hammer-anim' && frame.index === 4) {
              if (this.targetObject && this.targetObject.active && typeof this.targetObject.sustainDamage === 'function') {
                // On the impact frame, damage the gold mine and get the extracted amount
                const goldExtracted = this.targetObject.sustainDamage(10);
                if (goldExtracted > 0) {
                  // Add the extracted gold to the player's resources
                  this.scene.resourceManager.add('gold', goldExtracted);
                }
              }
            }
          });
          this.transitionStateTo(this.targetObject.x > this.x ? "HAMMER_RIGHT" : "HAMMER_LEFT");
        };
        this.moveToAndExecuteTask(bestTile.x, bestTile.y, this.grid, onArrival);
      } else {
        console.warn("No walkable tile found next to the gold mine.");
        this.targetObject = null;
      }
    }
  }

  harvestMeat(sheep) {
    this.stopCurrentTask();
    this.continuousTask = 'meat';

    if (sheep) {
      // Highlight the target sheep
      if (typeof sheep.highlight === 'function') {
        sheep.highlight();
      }

      this.targetObject = sheep;
      const sheepTile = sheep.getPosTile();

      // Only consider tiles directly to the left and right of the sheep.
      const adjacentTiles = [
        { x: sheepTile[0] - 1, y: sheepTile[1] }, // Left
        { x: sheepTile[0] + 1, y: sheepTile[1] }, // Right
      ];

      let bestTile = null;
      let minWorkerDist = Infinity;
      const workerTile = this.getPosTile();

      for (const tile of adjacentTiles) {
        if (this.grid.isWalkableAt(tile.x, tile.y)) {
          const distance = Phaser.Math.Distance.Between(workerTile[0], workerTile[1], tile.x, tile.y);
          if (distance < minWorkerDist) {
            minWorkerDist = distance;
            bestTile = tile;
          }
        }
      }

      if (bestTile) {
        const onArrival = () => {
          this.off(Phaser.Animations.Events.ANIMATION_UPDATE);

          // Use the 'cut' animation for harvesting meat
          this.on(Phaser.Animations.Events.ANIMATION_UPDATE, (anim, frame) => {
            if (anim.key === 'worker-cut-anim' && frame.index === 4) {
              if (this.targetObject && this.targetObject.active && typeof this.targetObject.sustainDamage === 'function') {
                // The sustainDamage method on the sheep will handle both the initial kill
                // and the subsequent resource extraction.
                const meatExtracted = this.targetObject.sustainDamage(10); // Damage amount also represents extraction amount
                // If meat was extracted, add it to the resource manager.
                if (meatExtracted > 0) this.scene.resourceManager.add('meat', meatExtracted);
              }
            }
          });

          this.transitionStateTo(this.targetObject.x > this.x ? "CUT_RIGHT" : "CUT_LEFT");
        };
        this.moveToAndExecuteTask(bestTile.x, bestTile.y, this.grid, onArrival);
      } else {
        console.warn("No walkable tile found next to the sheep.");
        this.targetObject = null;
      }
    }
  }

  findAndStartNextTask(resourceType) {
    let closestResource = null;
    let minDistance = Infinity;
    let resourceGroup = null;

    // The gathering methods (cutTree, etc.) will call stopCurrentTask and set the continuous task.
    // This function just needs to find the next target and initiate the action.
    if (resourceType === 'wood') {
        resourceGroup = this.scene.trees;
    } else if (resourceType === 'meat') {
        resourceGroup = this.scene.sheeps;
    } else if (resourceType === 'gold') {
        resourceGroup = this.scene.goldMines;
    }

    if (resourceGroup) {
        resourceGroup.getChildren().forEach(resource => {
            // Check if the resource is active and thus available.
            if (resource.active) {
                const distance = Phaser.Math.Distance.Between(this.x, this.y, resource.x, resource.y);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestResource = resource;
                }
            }
        });
    }

    if (closestResource) {
        console.log(`Worker found a new ${resourceType} target.`);
        if (resourceType === 'wood') {
            this.cutTree(closestResource);
        } else if (resourceType === 'meat') {
            this.harvestMeat(closestResource);
        } else if (resourceType === 'gold') {
            this.mineGold(closestResource);
        }
    } else {
        console.log(`Worker could not find any more ${resourceType}. Going idle.`);
        this.stopCurrentTask(); // This will clear continuousTask and set state to idle.
    }
  }

  update(time, delta, enemyArmy) {

    super.update(time, delta);

    this.setDepth(this.y + this.depthOffset);

    // Check if the current target is invalid (destroyed, depleted, or finished)
    if (this.targetObject && !this.targetObject.active) {
        if (this.continuousTask) {
            this.findAndStartNextTask(this.continuousTask);
        } else {
            this.stopCurrentTask();
        }
        return; // Return early to prevent other state logic from running this frame.
    }

    // If building is complete, go idle.
    if ((this.currentState.includes("HAMMER")) && this.targetObject && this.targetObject.constructor.name !== 'GoldMine' && this.targetObject.currentState !== 'CONSTRUCT') {
      this.stopCurrentTask();
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

        this.isDying = false; // Prevent this block from running again
        this.anims.stop(); // Stop any previous animation

        // Play the first death animation
        this.play('dead-anim-1', true);

        // When the first animation completes, play the second one
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'dead-anim-1', () => {
          // Add a delay before playing the second animation
          this.scene.time.delayedCall(2000, () => {
            // Check if the entity has been destroyed in the meantime.
            if (this.scene) {
              this.play('dead-anim-2', true);
              // After the second animation completes, destroy the game object
              this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'dead-anim-2', () => {
                this.destroy();
              });
            }
          });
        });
      }
    }
  }
}
