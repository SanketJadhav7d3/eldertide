
//  ▄▄▄▄    ▒█████   ███▄ ▄███▓ ▄▄▄▄   ▓█████  ██▀███  
// ▓█████▄ ▒██▒  ██▒▓██▒▀█▀ ██▒▓█████▄ ▓█   ▀ ▓██ ▒ ██▒
// ▒██▒ ▄██▒██░  ██▒▓██    ▓██░▒██▒ ▄██▒███   ▓██ ░▄█ ▒
// ▒██░█▀  ▒██   ██░▒██    ▒██ ▒██░█▀  ▒▓█  ▄ ▒██▀▀█▄  
// ░▓█  ▀█▓░ ████▓▒░▒██▒   ░██▒░▓█  ▀█▓░▒████▒░██▓ ▒██▒
// ░▒▓███▀▒░ ▒░▒░▒░ ░ ▒░   ░  ░░▒▓███▀▒░░ ▒░ ░░ ▒▓ ░▒▓░
// ▒░▒   ░   ░ ▒ ▒░ ░  ░      ░▒░▒   ░  ░ ░  ░  ░▒ ░ ▒░
//  ░    ░ ░ ░ ░ ▒  ░      ░    ░    ░    ░     ░░   ░ 
//  ░          ░ ░         ░    ░         ░  ░   ░     
//       ░                           ░

import Entity from './playerEntity.js'
import { BomberStates } from './states.js';
import Bomb from './bomb.js';

export default class Bomber extends Entity {
  constructor(scene, x, y, width, height, offsetX, offsetY, pathLayer, finder, grid) {
    super(scene, x, y, 'bomber-entity', width, height, offsetX, offsetY, pathLayer, finder, grid);

    this.currentState = BomberStates.IDLE_RIGHT;
    this.health = 40;
    this.isDying = false;

    // Bombers have a medium range.
    this.createRange(600); // Sight and attack range are the same.

    // AI Context
    this.context = {
      target: null,
      isTargetInRange: false, // For bombers, "in range" means "in attack range"
      isMovingToTarget: false,
    }
    this.lastTargetCheck = 0; // Timer for target acquisition
    this.attackCooldown = 2500; // 2.5 seconds between throws
    this.lastAttackTime = 0;

    // Bomb details
    this.bombReleaseFrame = 4; // Frame in 'bomber-throw-anim' to release the bomb
    this.damage = 25; // Bombs are powerful
    this.finalDestination = null;
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

  updateContext() {
    if (!this.context.target || !this.context.target.active) {
      this.context.target = null;
      this.context.isTargetInRange = false;
      return;
    }
    // For a bomber, being in range is being in attack range.
    this.context.isTargetInRange = this.isInRange(this.context.target);
  }

  attackTarget() {
    // Check cooldown
    const now = this.scene.time.now;
    if (now < this.lastAttackTime + this.attackCooldown) {
      return; // Still on cooldown
    }

    this.stopMoving();

    // Capture the target at the moment the attack is initiated.
    // This prevents a race condition where the target could be cleared before the projectile is fired.
    const currentTarget = this.context.target;

    // Face the target
    if (currentTarget.x > this.x) {
      this.transitionStateTo(BomberStates.THROW_RIGHT);
    } else {
      this.transitionStateTo(BomberStates.THROW_LEFT);
    }

    // Listen for the specific frame to release the bomb
    this.off(Phaser.Animations.Events.ANIMATION_UPDATE); // Clear previous listeners
    this.on(Phaser.Animations.Events.ANIMATION_UPDATE, (anim, frame) => {
      if (anim.key === 'bomber-throw-anim' && frame.index === this.bombReleaseFrame) {
        new Bomb(this.scene, this.x, this.y, currentTarget, this.damage);
        this.lastAttackTime = now; // Start cooldown after firing
      }
    });
  }

  decide() {
    // Priority 1: Attack if target is in range.
    if (this.context.target && this.context.isTargetInRange) {
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
        this.transitionStateTo(this.currentState.includes("LEFT") ? BomberStates.IDLE_LEFT : BomberStates.IDLE_RIGHT);
        this.stopMoving();
    }
  }

  sustainDamage(amount) {
    if (this.isDying) return;
    this.health -= amount;
    this.setTint(0xff0000);
    this.scene.time.delayedCall(200, () => this.clearTint());

    if (this.health <= 0) {
      this.isDying = true;
      this.stopMoving(); // Immediately stop any movement tweens.
      this.transitionStateTo('DEAD');
      this.setDepth(-1);

      if (this.range) this.range.destroy();

      // Move from active army to dying group
      if (this.scene.enemyArmy.bombers) {
        this.scene.enemyArmy.bombers.remove(this);
      }
      this.scene.dyingEntities.add(this);
    }
  }

  update(time, delta, playerArmy) {
    super.update(time, delta);
    this.updatePhysicsBodies();

    if (this.currentState !== 'DEAD') {
      if (this.context.target && (this.context.target.health <= 0 || !this.context.target.active)) {
        this.context.target = null;
        this.lastTargetCheck = 0;
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
          if (this.context.target) this.context.isMovingToTarget = false;
        }
        this.lastTargetCheck = time;
      }

      this.updateContext();
      this.decide();
    }

    switch (this.currentState) {
      case BomberStates.IDLE_LEFT:
        this.setFlipX(true);
        this.play('bomber-idle-anim', true);
        break;
      case BomberStates.IDLE_RIGHT:
        this.setFlipX(false);
        this.play('bomber-idle-anim', true);
        break;
      case BomberStates.RUN_LEFT:
        this.setFlipX(true);
        this.play('bomber-run-anim', true);
        break;
      case BomberStates.RUN_RIGHT:
        this.setFlipX(false);
        this.play('bomber-run-anim', true);
        break;
      case BomberStates.THROW_LEFT:
        this.setFlipX(true);
        this.play('bomber-throw-anim', true);
        break;
      case BomberStates.THROW_RIGHT:
        this.setFlipX(false);
        this.play('bomber-throw-anim', true);
        break;
      case BomberStates.DEAD:
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
      break;
    }
  }
}
