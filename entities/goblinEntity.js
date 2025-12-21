
//      ▄████  ▒█████   ▄▄▄▄    ██▓     ██▓ ███▄    █ 
//     ██▒ ▀█▒▒██▒  ██▒▓█████▄ ▓██▒    ▓██▒ ██ ▀█   █ 
//    ▒██░▄▄▄░▒██░  ██▒▒██▒ ▄██▒██░    ▒██▒▓██  ▀█ ██▒
//    ░▓█  ██▓▒██   ██░▒██░█▀  ▒██░    ░██░▓██▒  ▐▌██▒
//    ░▒▓███▀▒░ ████▓▒░░▓█  ▀█▓░██████▒░██░▒██░   ▓██░
//     ░▒   ▒ ░ ▒░▒░▒░ ░▒▓███▀▒░ ▒░▓  ░░▓  ░ ▒░   ▒ ▒ 
//      ░   ░   ░ ▒ ▒░ ▒░▒   ░ ░ ░ ▒  ░ ▒ ░░ ░░   ░ ▒░
//    ░ ░   ░ ░ ░ ░ ▒   ░    ░   ░ ░    ▒ ░   ░   ░ ░ 
//          ░     ░ ░   ░          ░  ░ ░           ░ 

import Entity from './playerEntity.js'
import { GoblinStates } from './states.js';

export default class Goblin extends Entity {

  constructor(scene, x, y, width, height, offsetX, offsetY, pathLayer, finder, grid) {
    super(scene, x, y, 'goblin-entity', width, height, offsetX, offsetY, pathLayer, finder, grid);

    this.grid = grid;

    this.currentState = GoblinStates.IDLE_LEFT;
    this.health = 40;
    this.isDying = false; // Flag to ensure death animation sequence is initiated only once.

    this.createAttackRange(80);
    this.createRange(500);

    this.context = {
      target: null,
      isTargetInRange: false,
      isTargetInAttackRange: false,
      isMovingToTarget: false, // Flag for the final destination move command
    }
    this.lastTargetCheck = 0;
    this.attackFrames = [17, 24, 31];
    this.damage = 8;
    this.finalDestination = null; // The ultimate goal for the goblin
    this.hasReachedDestination = false;
  }

  moveToTile(tileX, tileY, grid, onCompleteCallback = null) {
    // This is a command, so set the flag to prevent AI override.
    this.context.isMovingToTarget = true;

    // The callback will clear the flag upon arrival.
    const arrivalCallback = () => {
      this.context.isMovingToTarget = false;
      if (onCompleteCallback) onCompleteCallback();
    };
    super.moveToTile(tileX, tileY, grid, arrivalCallback);
  }


  handleAttackOverlapWith(otherEntity) {
    //this.scene.physics.add.overlap(this.attackRange, otherEntity, 
      //(entity1, entity2) => { this.onAttackOverlap(entity1, entity2) }, null, this.scene);

    //this.scene.physics.add.overlap(this, otherEntity, 
      //() => { this.setAlpha(0.5) }, null, this.scene);
  }

  sustainDamage(amount) {
    if (this.isDying) return;
    this.health -= amount;
    this.setTint(0xff0000); // Use a red tint for a more visible "flash"
    
    this.scene.time.delayedCall(200, () => {
      this.clearTint(); 
    });

    if (this.health <= 0) {      
      this.isDying = true; // Mark as dying to prevent this block from running again.
      console.log(`${this.constructor.name} ${this.id} health dropped to 0. Initiating death sequence.`);
      this.stopMoving(); // Immediately stop any movement tweens.
      this.transitionStateTo('DEAD'); // Transition to DEAD state for animation handling
      this.setDepth(-1); // Set depth to appear behind other entities

      // Destroy physics bodies that are not the main sprite body
      if (this.attackRange) this.attackRange.destroy();
      if (this.range) this.range.destroy();

      // Disable main physics body but keep sprite visible for animation

      // Move this entity from the active army to the dying group
      this.scene.enemyArmy.goblins.remove(this);
      this.scene.dyingEntities.add(this);

      return; // Stop further damage processing for this frame
    }
  }

  attackTarget() {
    let currentFrame = this.anims.currentFrame;
    if (!currentFrame) return;
    let frameNumber = currentFrame.frame.name;

    this.attackFrames.forEach(attackFrame => {
      if (parseInt(frameNumber, 10) === attackFrame) {
        if (this.context.target)
          this.context.target.sustainDamage(this.damage);

          // change the tint of the target enemy
          this.context.target.setTint(0xff0000);
      }
    });

    this.stopMoving();


    // Decide which attack animation to use based on target position
    if (this.context.target) {
      const dy = this.context.target.y - this.y;
      const dx = this.context.target.x - this.x;

      // Prioritize vertical attacks if the target is mostly above or below
      if (Math.abs(dy) > Math.abs(dx)) {
        if (dy < 0) {
          this.transitionStateTo("ATTACK_UP");
        } else {
          this.transitionStateTo("ATTACK_DOWN");
        }
      } else { // Otherwise, use side attacks
        if (dx < 0) {
          this.transitionStateTo("ATTACK_LEFT");
        } else {
          this.transitionStateTo("ATTACK_RIGHT");
        }
      }
    } else {
      this.transitionStateTo("ATTACK_RIGHT");
    }
  }

  updateContext() {
    // If target is null or inactive, clear the context
    if (!this.context.target || !this.context.target.active) {
      this.context.target = null;
      this.context.isTargetInAttackRange = false;
      this.context.isTargetInRange = false;
      return;
    }

    this.context.isTargetInAttackRange = this.isInAttackRange(this.context.target);
    this.context.isTargetInRange = this.context.isTargetInAttackRange || this.isInRange(this.context.target);
  }

  decide() {
    // Priority 1: Attack if target is in attack range.
    if (this.context.target && this.context.isTargetInAttackRange) {
      if (this.context.isMovingToTarget) {
        this.stopMoving();
        this.context.isMovingToTarget = false;
      }
      this.attackTarget();
      return;
    }

    // Priority 2: If moving to a final destination, check for interruptions.
    if (this.context.isMovingToTarget) {
      if (this.context.target && this.context.isTargetInRange) {
        this.stopMoving();
        this.context.isMovingToTarget = false;
      } else {
        return; // Continue the long move.
      }
    }

    // Priority 3: If we have a target, decide whether to chase it.
    if (this.context.target) {
      // If it's in normal range OR we are in rampage mode, chase it.
      if (this.context.isTargetInRange || this.hasReachedDestination) {
        // Don't start a new follow path if a move tween is already running.
        if (!this.moveTween || !this.moveTween.isPlaying()) {
          this.followEntity(this.context.target);
        }
        return; // Return to let the follow action continue.
      }
    }

    // Priority 4: No target. Decide whether to move to destination or go idle.
    if (this.finalDestination) {
      if (!this.context.isMovingToTarget) {
        this.moveToTile(this.finalDestination.x, this.finalDestination.y, this.grid, () => {
          // On arrival at final destination:
          this.finalDestination = null; // We have arrived, clear the destination.
          this.hasReachedDestination = true;
        });
      }
    } else {
      // No target and no destination, go idle.
      this.transitionStateTo(this.currentState.includes("LEFT") ? "IDLE_LEFT" : "IDLE_RIGHT");
      this.stopMoving();
    }
  }

  update(time, delta, playerArmy) {
    super.update(time, delta); // Handles depth sorting

    // Ensure attack and sight ranges follow the goblin
    this.updatePhysicsBodies();

    // If the current target is dead/inactive, immediately look for a new one.
    if (this.context.target && this.context.target.health <= 0) {
      this.context.target = null;
      this.lastTargetCheck = 0; // Force a new target check immediately
    }

    if (time > this.lastTargetCheck + 1000) {
      if (!this.context.target && playerArmy) {
        if (this.hasReachedDestination) {
          // After reaching destination, find a random target anywhere on the map.
          const allTargets = [
            ...playerArmy.workers.getChildren(),
            ...playerArmy.warriors.getChildren(),
            ...playerArmy.archers.getChildren(),
            ...playerArmy.lancers.getChildren(),
            ...this.scene.towers.getChildren(),
            ...this.scene.houses.getChildren(),
            ...this.scene.barracks.getChildren(),
            ...this.scene.archeries.getChildren(),
            ...this.scene.monasteries.getChildren(),
          ];
          if (this.scene.castle && this.scene.castle.active) {
            allTargets.push(this.scene.castle);
          }
          const activeTargets = allTargets.filter(t => t.active && t.health > 0);
          if (activeTargets.length > 0) {
            this.context.target = Phaser.Math.RND.pick(activeTargets);
          }
        } else {
          // Before reaching destination, find the closest target within sight range.
          const enemyUnits = [playerArmy.workers, playerArmy.warriors, playerArmy.archers, playerArmy.lancers];
          const enemyStructures = [this.scene.towers, this.scene.houses, this.scene.barracks, this.scene.archeries, this.scene.monasteries];
          if (this.scene.castle) {
            const castleGroup = this.scene.physics.add.group(this.scene.castle);
            enemyStructures.push(castleGroup);
          }
          const { enemy: closestUnit } = this.findClosestEnemy(enemyUnits);
          const { enemy: closestStructure } = this.findClosestEnemy(enemyStructures);
          this.context.target = closestUnit || closestStructure;
        }
        if (this.context.target) this.context.isMovingToTarget = false; // If we found a target, we are no longer just moving to the destination.
      }
      this.lastTargetCheck = time;
    }

    if (this.currentState !== 'DEAD') {
      this.updateContext();
      this.decide();
    }

    switch (this.currentState) {
      case "RUN_RIGHT":
        this.setFlipX(false);
        this.play('goblin-run-anim', true);
        break; // Added break
      case "RUN_LEFT":
        this.setFlipX(true);
        this.play('goblin-run-anim', true);
        break; // Added break
      case "IDLE_LEFT":
        this.setFlipX(true);
        this.play('goblin-idle-anim', true);
        break; // Added break
      case "IDLE_RIGHT":
        this.setFlipX(false);
        this.play('goblin-idle-anim', true);
        break; // Added break
      case "ATTACK_LEFT":
        this.setFlipX(true);
        this.play('goblin-attack-anim', true);
        break; // Added break
      case "ATTACK_RIGHT":
        this.setFlipX(false);
        this.play('goblin-attack-anim', true);
        break; // Added break
      case "ATTACK_UP":
        this.setFlipX(this.context.target && this.context.target.x < this.x); // Face target
        this.play('goblin-attack-up-anim', true);
        break; // Added break
      case "ATTACK_DOWN":
        this.setFlipX(this.context.target && this.context.target.x < this.x); // Face target
        this.play('goblin-attack-down-anim', true);
        break; // Added break
      case 'DEAD':
        // This block is entered when the state is DEAD.
        // The `isDying` flag ensures the death animation setup runs only once.
        if (this.isDying) {
          this.isDying = false; // Prevent this block from running again

          // Play the first death animation
          this.play('dead-anim-1', true);

          // When the first animation completes, play the second one
          this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'dead-anim-1', () => {
            // Add a delay before playing the second animation
            this.scene.time.delayedCall(5000, () => {
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
        break; // Added break
    }
  }
}
