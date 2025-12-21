// ▄▄▄       ██▓     ██▓  ▄████▄   ██▀███  
// ▒████▄    ▓██▒    ▓██▒▒██▀ ▀█  ▓██ ▒ ██▒
// ▒██  ▀█▄  ▒██░    ▒██▒▒▓█    ▄ ▓██ ░▄█ ▒
// ░██▄▄▄▄██ ░██░    ░██░▒▓▓▄ ▄██▒▒██▀▀█▄  
//  ▓█   ▓██▒░██████▒░██░▒ ▓███▀ ░░██▓ ▒██▒
//  ▒▒   ▓▒█░░ ▒░▓  ░░▓  ░ ░▒ ▒  ░░ ▒▓ ░▒▓░
//   ▒   ▒▒ ░░ ░ ▒  ░ ▒ ░  ░  ▒     ░▒ ░ ▒░
//   ░   ▒     ░ ░    ▒ ░░          ░░   ░ 
//       ░  ░    ░  ░ ░  ░ ░         ░     
//                      ░                   

import Entity from './playerEntity.js'
import { LancerStates, Stances } from './states.js';


export default class Lancer extends Entity {
  constructor(scene, x, y, width, height, offsetX, offsetY, pathLayer, finder, grid) {
    // The Lancer uses multiple spritesheets for its animations.
    // We must start with a valid texture key. 'archer-idle' is a good default.
    // The actual texture will be changed by `this.play('animation-key')`.
    super(scene, x, y, 'lancer-idle', width, height, offsetX, offsetY, pathLayer, finder, grid);

    this.currentState = LancerStates.IDLE_RIGHT;
    this.health = 70; // Less than a warrior, more than a basic archer.
    this.isDying = false;

    this.createAttackRange(150); // Lancers have more reach than warriors.
    this.createRange(500);

    // attack enemy context
    this.context = {
      target: null,
      isTargetInRange: false,
      isTargetInAttackRange: false,
      isMovingToTarget: false, // Flag for player-issued move commands
      isPlayerCommandedTarget: false,
    }
    this.lastTargetCheck = 0;

    // The hit frame index within the attack animations.
    // Assuming a 6-frame animation, the 4th frame (index 3) is the impact.
    this.attackFrames = [3];
    this.damage = 15; // Higher damage than a warrior.

    this.depthOffset = 26;
  }

  updateContext() {
    if (!this.context.target || !this.context.target.active) {
      this.context.target = null;
      this.context.isTargetInAttackRange = false;
      this.context.isTargetInRange = false;
      return;
    }

    this.context.isTargetInAttackRange = this.isInAttackRange(this.context.target);
    this.context.isTargetInRange = this.context.isTargetInAttackRange || this.isInRange(this.context.target);
  }

  attackTarget() {
    let currentFrame = this.anims.currentFrame;
    if (!currentFrame) return;
    let frameNumber = currentFrame.frame.name;

    this.attackFrames.forEach(attackFrame => {
      if (parseInt(frameNumber, 10) === attackFrame) {
        if (this.context.target) this.context.target.sustainDamage(this.damage);
      }
    });

    this.stopMoving(); // Ensure any prior movement is stopped before attacking.

    // Decide which attack animation to use based on target position (similar to Goblin).
    if (this.context.target) {
      const dx = this.context.target.x - this.x;
      const dy = this.context.target.y - this.y;
      const angle = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
      const normalizedAngle = (angle + 360) % 360;

      let state;

      if (normalizedAngle > 337.5 || normalizedAngle <= 22.5) { // Right
        state = LancerStates.ATTACK_RIGHT;
      } else if (normalizedAngle > 22.5 && normalizedAngle <= 67.5) { // Down-Right
        state = LancerStates.ATTACK_DOWN_RIGHT;
      } else if (normalizedAngle > 67.5 && normalizedAngle <= 112.5) { // Down
        state = LancerStates.ATTACK_DOWN;
      } else if (normalizedAngle > 112.5 && normalizedAngle <= 157.5) { // Down-Left
        state = LancerStates.ATTACK_DOWN_LEFT;
      } else if (normalizedAngle > 157.5 && normalizedAngle <= 202.5) { // Left
        state = LancerStates.ATTACK_LEFT;
      } else if (normalizedAngle > 202.5 && normalizedAngle <= 247.5) { // Up-Left
        state = LancerStates.ATTACK_UP_LEFT;
      } else if (normalizedAngle > 247.5 && normalizedAngle <= 292.5) { // Up
        state = LancerStates.ATTACK_UP;
      } else { // Up-Right (292.5 to 337.5)
        state = LancerStates.ATTACK_UP_RIGHT;
      }
      this.transitionStateTo(state);
    } else {
      // Default attack if no target somehow.
      this.transitionStateTo(LancerStates.ATTACK_RIGHT);
    }
  }

  decide() {
    // Highest priority: If a target is in attack range, ATTACK.
    if (this.context.target && this.context.isTargetInAttackRange) {
      if (this.context.isMovingToTarget) {
        this.stopMoving();
        this.context.isMovingToTarget = false;
      }
      this.attackTarget();
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
          this.transitionStateTo(this.currentState.includes("LEFT") ? LancerStates.IDLE_LEFT : LancerStates.IDLE_RIGHT);
          this.stopMoving();
        }
      }
    } else if (this.stance === Stances.DEFENSIVE) {
      // Defensive: Don't chase. If we are here, it means no enemy is in attack range.
      // So, just go idle and hold position.
      this.context.target = null; // Drop any target that is not in attack range.
      this.transitionStateTo(this.currentState.includes("LEFT") ? LancerStates.IDLE_LEFT : LancerStates.IDLE_RIGHT);
      this.stopMoving();
    }
  }

  moveToTile(tileX, tileY, grid, onCompleteCallback = null) {
    this.context.isMovingToTarget = true;
    const arrivalCallback = () => {
      this.context.isMovingToTarget = false;
      if (onCompleteCallback) onCompleteCallback();
    };
    super.moveToTile(tileX, tileY, grid, arrivalCallback);
  }

  protectEntity(entity) {
    var entityPos = entity.getPosTile();
    this.moveToTile(entityPos[0], entityPos[1] - 1, this.grid, () => {
      this.context.isMovingToTarget = false;
    });
    this.context.isMovingToTarget = true;
  }

  sustainDamage(amount) {
    if (this.isDying) return;
    this.health -= amount;
    this.setTint(0xff0000);
    this.scene.time.delayedCall(200, () => {
      this.clearTint();
    });

    if (this.health <= 0) {
      this.isDying = true;
      this.stopMoving(); // Immediately stop any movement tweens.
      this.transitionStateTo(LancerStates.DEAD);
      this.setDepth(-1);

      if (this.attackRange) this.attackRange.destroy();
      if (this.range) this.range.destroy();

      if (this.scene.playerArmy.lancers) {
        this.scene.playerArmy.lancers.remove(this);
      }
      this.scene.dyingEntities.add(this);
    }
  }

  update(time, delta, enemyArmy) {
    super.update(time, delta);
    this.updatePhysicsBodies();

    if (this.currentState === LancerStates.DEAD) {
      // The death animation logic is handled in the switch statement below.
    } else {
      // If the current target is dead/inactive, immediately look for a new one.
      if (this.context.target && (this.context.target.health <= 0 || !this.context.target.active)) {
        this.context.target = null;
        this.lastTargetCheck = 0; // Force a new check immediately.
      }

      // Only search for a new target periodically to save performance.
      if (time > this.lastTargetCheck + 1000) {
        if (!this.context.target) { // If we don't have a target, find the closest one.
          const enemyUnits = [enemyArmy.goblins, enemyArmy.bombers, enemyArmy.barrels]; // Add other enemy unit groups here.
          const { enemy: closestUnit } = this.findClosestEnemy(enemyUnits);
          this.context.target = closestUnit;
          if (this.context.target) this.context.isPlayerCommandedTarget = false; // AI-acquired target
        }
        this.lastTargetCheck = time;
      }
      
      this.updateContext();
      this.decide();
    }

    switch (this.currentState) {
      case LancerStates.RUN_RIGHT:
        this.setFlipX(false);
        this.play('lancer-run-anim', true);
        break;
      case LancerStates.RUN_LEFT:
        this.setFlipX(true);
        this.play('lancer-run-anim', true);
        break;
      case LancerStates.IDLE_LEFT:
        this.setFlipX(true);
        this.play('lancer-idle-anim', true);
        break;
      case LancerStates.IDLE_RIGHT:
        this.setFlipX(false);
        this.play('lancer-idle-anim', true);
        break;
      case LancerStates.ATTACK_LEFT:
        this.setFlipX(true);
        this.play('lancer-attack-right-anim', true);
        break;
      case LancerStates.ATTACK_RIGHT:
        this.setFlipX(false);
        this.play('lancer-attack-right-anim', true);
        break;
      case LancerStates.ATTACK_UP:
        this.setFlipX(false);
        this.play('lancer-attack-up-anim', true);
        break;
      case LancerStates.ATTACK_DOWN:
        this.setFlipX(false);
        this.play('lancer-attack-down-anim', true);
        break;
      case LancerStates.ATTACK_UP_RIGHT:
        this.setFlipX(false);
        this.play('lancer-attack-up-right-anim', true);
        break;
      case LancerStates.ATTACK_UP_LEFT:
        this.setFlipX(true);
        this.play('lancer-attack-up-right-anim', true);
        break;
      case LancerStates.ATTACK_DOWN_RIGHT:
        this.setFlipX(false);
        this.play('lancer-attack-down-right-anim', true);
        break;
      case LancerStates.ATTACK_DOWN_LEFT:
        this.setFlipX(true);
        this.play('lancer-attack-down-right-anim', true);
        break;
      case LancerStates.DEAD:
        if (this.isDying) {
          this.isDying = false; // Prevent this block from running again.
          this.anims.stop(); // Stop any previous animation.

          // Play the first death animation.
          this.play('dead-anim-1', true);

          // When the first animation completes, play the second one.
          this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'dead-anim-1', () => {
            this.scene.time.delayedCall(2000, () => {
              // Check if the entity has been destroyed in the meantime.
              if (this.scene) {
                this.play('dead-anim-2', true);
                // After the second animation completes, destroy the game object.
                this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'dead-anim-2', () => {
                  this.destroy();
                });
              }
            });
          });
        }
        break;
    }
  }
}