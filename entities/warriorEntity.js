
// ▄▄▌ ▐ ▄▌ ▄▄▄· ▄▄▄  ▄▄▄  ▪        ▄▄▄      ▄▄▄ . ▐ ▄ ▄▄▄▄▄▪  ▄▄▄▄▄ ▄· ▄▌
// ██· █▌▐█▐█ ▀█ ▀▄ █·▀▄ █·██ ▪     ▀▄ █·    ▀▄.▀·•█▌▐█•██  ██ •██  ▐█▪██▌
// ██▪▐█▐▐▌▄█▀▀█ ▐▀▀▄ ▐▀▀▄ ▐█· ▄█▀▄ ▐▀▀▄     ▐▀▀▪▄▐█▐▐▌ ▐█.▪▐█· ▐█.▪▐█▌▐█▪
// ▐█▌██▐█▌▐█ ▪▐▌▐█•█▌▐█•█▌▐█▌▐█▌.▐▌▐█•█▌    ▐█▄▄▌██▐█▌ ▐█▌·▐█▌ ▐█▌· ▐█▀·.
//  ▀▀▀▀ ▀▪ ▀  ▀ .▀  ▀.▀  ▀▀▀▀ ▀█▄▀▪.▀  ▀     ▀▀▀ ▀▀ █▪ ▀▀▀ ▀▀▀ ▀▀▀   ▀ •

import Entity from './playerEntity.js'
import { WarriorStates, Stances } from './states.js';


export default class Warrior extends Entity {
  constructor(scene, x, y, width, height, offsetX, offsetY, pathLayer, finder, grid) {
    super(scene, x, y, 'warrior-entity', width, height, offsetX, offsetY, pathLayer, finder, grid);

    this.currentState = WarriorStates.IDLE_RIGHT;
    this.health = 100; 

    this.createAttackRange(120);
    this.createRange(500);

    // attack enemy
    this.context = {
      target: null,
      isTargetInRange: false,
      isTargetInAttackRange: false,
      isMovingToTarget: false, // Flag for player-issued move commands
      isPlayerCommandedTarget: false, // Flag for player-issued attack commands
    }
    this.lastTargetCheck = 0;

    this.attackFrames = [15, 21, 27, 33];
    this.damage = 10;

    this.depthOffset = 26;
  }

  updateContext(enemy) {
    if (!this.context.target || !this.context.target.active) {
      this.context.target = null;
      this.context.isTargetInAttackRange = false;
      this.context.isTargetInRange = false;
      return;
    }

    this.context.isTargetInAttackRange = this.isInAttackRange(this.context.target);


    this.context.isTargetInRange = this.context.isTargetInAttackRange || this.isInRange(this.context.target);
  }

  attackEnemy() {
    let currentFrame = this.anims.currentFrame;
    if (!currentFrame) return;
    let frameNumber = currentFrame.frame.name;

    this.attackFrames.forEach(attackFrame => {
      if (frameNumber == attackFrame) {
        if (this.context.target) this.context.target.sustainDamage(this.damage);
      }
    });

    this.stopMoving(); // Ensure any prior movement is stopped before attacking.

    // Face the target
    if (this.context.target && this.context.target.x < this.x) {
      this.transitionStateTo("UPWARD_SLASH_LEFT");
    } else {
      this.transitionStateTo("UPWARD_SLASH_RIGHT");
    }
  }

  decide() {
    // Highest priority: If a target is in attack range, ATTACK.
    if (this.context.target && this.context.isTargetInAttackRange) {
      if (this.context.isMovingToTarget) {
        this.stopMoving();
        this.context.isMovingToTarget = false;
      }
      this.attackEnemy();
      return;
    }

    // If moving due to a player command (like moving into formation), let it continue.
    if (this.context.isMovingToTarget) {
      return;
    }

    // Stance-based logic
    if (this.stance === Stances.AGGRESSIVE) {
      // Standard AI: Chase if target is in sight range.
      if (this.context.target && this.context.isTargetInRange) {
        if (!this.moveTween || !this.moveTween.isPlaying()) {
          this.followEntity(this.context.target);
        }
      } else {
        // If it's a player-commanded target, chase it even if it's out of sight range.
        if (this.context.target && this.context.isPlayerCommandedTarget) {
          if (!this.moveTween || !this.moveTween.isPlaying()) {
            this.followEntity(this.context.target);
          }
        } else {
          // No target, or an AI-acquired target is out of range. Go idle.
          this.context.target = null;
          this.transitionStateTo(this.currentState.includes("LEFT") ? "IDLE_LEFT" : "IDLE_RIGHT");
          this.stopMoving();
        }
      }
    } else if (this.stance === Stances.DEFENSIVE) {
      // Defensive: Don't chase. If we are here, it means no enemy is in attack range.
      // So, just go idle and hold position.
      this.context.target = null; // Drop any target that is not in attack range.
      this.transitionStateTo(this.currentState.includes("LEFT") ? "IDLE_LEFT" : "IDLE_RIGHT");
      this.stopMoving();
    }
  }

  moveToTile(tileX, tileY, grid, onCompleteCallback = null) {
    // This is a player-issued command, so set the flag to prevent AI override.
    this.context.isMovingToTarget = true;

    // The callback will clear the flag upon arrival.
    const arrivalCallback = () => {
      this.context.isMovingToTarget = false;
      if (onCompleteCallback) onCompleteCallback();
    };


    // Call the parent's moveToTile to handle the actual movement.
    super.moveToTile(tileX, tileY, grid, arrivalCallback);
  }

  protectEntity(entity) {
    // go to the entity
    var entityPos = entity.getPosTile();
    this.moveToTile(entityPos[0], entityPos[1] - 1, this.grid, () => {
      // On arrival, clear the movement flag so AI can take over.
      this.context.isMovingToTarget = false;
    });
    // Set the flag to indicate a player-issued command is active.
    this.context.isMovingToTarget = true;
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
      console.log(`${this.constructor.name} ${this.id} health dropped to 0. Initiating death sequence.`);

      this.stopMoving(); // Immediately stop any movement tweens.
      this.transitionStateTo('DEAD');
      this.setDepth(-1); // Set depth to appear behind other entities

      if (this.attackRange) this.attackRange.destroy();
      if (this.range) this.range.destroy();

      // remove from player army and add it to the dying entities
      this.scene.playerArmy.warriors.remove(this);
      this.scene.dyingEntities.add(this);

      return;

    } 
  }

  update(time, delta, enemyArmy) {
    super.update(time, delta); // Handles depth sorting
    // --- Debug line for depth sorting ---
    //if (this.scene.debugGraphics) {
      //this.scene.debugGraphics.lineStyle(1, 0xffff00, 1); // Yellow line, 1px thick
      //this.scene.debugGraphics.lineBetween(this.x - 60, this.y + 20, this.x +  60, this.y + 20);
    //}

    this.updatePhysicsBodies();

    // If the current target is dead/inactive, immediately look for a new one.
    if (this.context.target && this.context.target.health <= 0) {
      this.context.target = null;
      this.lastTargetCheck = 0; // Force a new check immediately
    }

    // Only search for a new target periodically to save performance
    if (time > this.lastTargetCheck + 1000) {
      if (!this.context.target && enemyArmy) { // If we don't have a target, find the closest one (unit or structure)
        const enemyUnits = [enemyArmy.goblins, enemyArmy.bombers, enemyArmy.barrels]; // Add other enemy unit groups here

        const { enemy: closestUnit } = this.findClosestEnemy(enemyUnits);

        // Simple prioritization: attack units over structures if both are present.
        this.context.target = closestUnit;
        if (this.context.target) this.context.isPlayerCommandedTarget = false; // AI-acquired target

      }
      this.lastTargetCheck = time;
    }

    if (this.currentState !== 'DEAD') {
      this.updateContext();
      this.decide();
    }


    switch (this.currentState) {
      case 'RUN_RIGHT':
        this.setFlipX(false);
        this.play('warrior-run-anim', true);
        break; // Added break
      case 'RUN_LEFT':
        this.setFlipX(true);
        this.play('warrior-run-anim', true);
        break; // Added break
      case 'IDLE_LEFT':
        this.setFlipX(true);
        this.play('warrior-idle-anim', true);
        break; // Added break
      case 'IDLE_RIGHT':
        this.setFlipX(false);
        this.play('warrior-idle-anim', true);
        break; // Added break
      case 'UPWARD_SLASH_LEFT':
        this.setFlipX(true);
        this.play('warrior-upward-slash-anim', true);
        break; // Added break
      case 'UPWARD_SLASH_RIGHT':
        this.setFlipX(false);
        this.play('warrior-upward-slash-anim', true);
        break; // Added break
      case 'DOWNWARD_SLASH_RIGHT':
        this.setFlipX(false);
        this.play('warrior-downward-slash-right-anim', true);
        break; // Added break
      case 'DOWNWARD_SLASH_LEFT':
        this.setFlipX(true);
        this.play('warrior-downward-slash-right-anim', true);
        break; // Added break
      case 'UPWARD_SLASH_FRONT':
        this.setFlipX(false);
        this.play('warrior-upward-slash-front-anim', true);
        break; // Added break
      case 'DOWNWARD_SLASH_FRONT':
        this.setFlipX(false);
        this.play('warrior-downward-slash-front-anim', true);
        break; // Added break
      case 'UPWARD_SLASH_BACK':
        this.setFlipX(false);
        this.play('warrior-upward-slash-back-anim', true);
        break; // Added break
      case 'DOWNWARD_SLASH_BACK':
        this.setFlipX(false);
        this.play('warrior-downward-slash-back-anim', true);
        break; // Added break
      case 'DEFEND':
        this.play('warrior-defend-anim', true);
        break;
      case 'DEAD':
        if (this.isDying) {
          this.isDying = false; // Prevent this block from running again
          this.anims.stop(); // Stop any previous animation

          // Play the first death animation
          this.play('dead-anim-1', true);

          // When the first animation completes, play the second one
          this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'dead-anim-1', () => {
            // Add a 500ms delay before playing the second animation
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
        break; // Added break
    }
  }
}
