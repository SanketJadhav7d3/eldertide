import Entity from './playerEntity.js'
import { ArcherStates, Stances } from './states.js';
import Projectile from './projectile.js';

export default class Archer extends Entity {
  constructor(scene, x, y, width, height, offsetX, offsetY, pathLayer, finder, grid) {
    super(scene, x, y, 'archer-entity', width, height, offsetX, offsetY, pathLayer, finder, grid);

    this.currentState = ArcherStates.IDLE_RIGHT;
    this.health = 50;
    this.isDying = false; // Flag to ensure death sequence runs only once

    // Archers have a long range but no "attack" range. They attack from their sight range.
    this.createRange(800); // Balanced sight and attack range

    // AI Context
    this.context = {
      target: null,
      isTargetInRange: false, // For archers, "in range" means "in attack range"
      isMovingToTarget: false,
      isPlayerCommandedTarget: false,
    }
    this.lastTargetCheck = 2000; // Timer for target acquisition
    this.attackCooldown = 1500; // 1.5 seconds between shots
    this.lastAttackTime = 0;

    // Projectile details
    this.arrowReleaseFrame = 4; // Release the arrow earlier in the animation
    this.damage = 12; // Balanced damage

    this.depthOffset = 26;
  }

  updateContext() {
    if (!this.context.target || !this.context.target.active) {
      this.context.target = null;
      this.context.isTargetInRange = false;
      return;
    }
    // For an archer, being in range is being in attack range.
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

    // --- Determine attack direction ---
    const dx = currentTarget.x - this.x;
    const dy = currentTarget.y - this.y;
    // Angle in degrees, where 0 is to the right.
    const angle = Phaser.Math.RadToDeg(Math.atan2(dy, dx))

    // Normalize angle to 0-360
    const normalizedAngle = Phaser.Math.Wrap(angle, 0, 360);

    // Map angle to an 8-direction index (0=Right, 1=Down-Right, 2=Down, etc.)
    const directionIndex = Math.round(normalizedAngle / 45) % 8;

    const directionStates = [
      ArcherStates.SHOOT_RIGHT,      // 0
      ArcherStates.SHOOT_DOWN_RIGHT, // 1
      ArcherStates.SHOOT_DOWN,       // 2
      ArcherStates.SHOOT_DOWN_LEFT,  // 3
      ArcherStates.SHOOT_LEFT,       // 4
      ArcherStates.SHOOT_UP_LEFT,    // 5
      ArcherStates.SHOOT_UP,         // 6
      ArcherStates.SHOOT_UP_RIGHT    // 7
    ];

    const state = directionStates[directionIndex];
    this.transitionStateTo(state);

    // Listen for the specific frame to release the arrow
    this.off(Phaser.Animations.Events.ANIMATION_UPDATE); // Clear previous listeners
    this.on(Phaser.Animations.Events.ANIMATION_UPDATE, (anim, frame) => {
      // Check if it's any of the shooting animations
      if (anim.key.startsWith('archer-shoot-') && frame.index === this.arrowReleaseFrame) {
        // Use the captured target to create and fire the projectile.
        const arrow = new Projectile(this.scene, this.x, this.y, 'arrow-projectile', currentTarget, this.damage);
        // Manually play animation and launch, now that it's removed from the constructor.
        arrow.play('arrow-flying');
        arrow.launch();

        this.lastAttackTime = now; // Start cooldown after firing
      }
    });
  }

  decide() {
    // Priority 1: We have a target in range. Attack it.
    if (this.context.target && this.context.isTargetInRange) {
      if (this.context.isMovingToTarget) {
        this.stopMoving();
        this.context.isMovingToTarget = false;
      }
      this.attackTarget();
      return;
    }

    // Priority 2: A player-commanded move (not attack) is in progress.
    if (this.context.isMovingToTarget) {
      return; // Continue player-commanded move
    }

    // Priority 3: We have a target, but it's out of range.
    if (this.context.target) {
      // If it's a player-commanded target, OR we are in aggressive stance, chase it.
      if (this.context.isPlayerCommandedTarget || this.stance === Stances.AGGRESSIVE) {
        if (!this.moveTween || !this.moveTween.isPlaying()) {
          this.followEntity(this.context.target);
        }
      } else { // Defensive stance and target is out of range
        this.context.target = null; // Drop the target
        this.transitionStateTo(this.currentState.includes("LEFT") ? ArcherStates.IDLE_LEFT : ArcherStates.IDLE_RIGHT);
        this.stopMoving();
      }
    } else {
      // Priority 4: No target at all. Go idle.
      this.transitionStateTo(this.currentState.includes("LEFT") ? ArcherStates.IDLE_LEFT : ArcherStates.IDLE_RIGHT);
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

  sustainDamage(amount) {
    if (this.isDying) return;
    this.health -= amount;
    this.setTint(0xff0000); // Flash red
    this.scene.time.delayedCall(200, () => this.clearTint());

    if (this.health <= 0) {
      this.isDying = true;
      this.stopMoving(); // Immediately stop any movement tweens.
      this.transitionStateTo('DEAD');
      this.setDepth(-1); // Set depth to appear behind other entities

      if (this.range) this.range.destroy();

      // Move from active army to dying group
      this.scene.playerArmy.archers.remove(this);
      this.scene.dyingEntities.add(this);
    }
  }

  update(time, delta, enemyArmy) {
    super.update(time, delta);
    this.updatePhysicsBodies();

    if (this.currentState === ArcherStates.DEAD) {
      // Death animation logic is in the switch statement
    } else {
      if (this.context.target && (this.context.target.health <= 0 || !this.context.target.active)) {
        this.context.target = null;
        this.lastTargetCheck = 0;
      }

      // Check for targets more frequently for better responsiveness
      if (time > this.lastTargetCheck + 250) {
        if (!this.context.target) {
          const enemyUnits = [enemyArmy.goblins, enemyArmy.bombers, enemyArmy.barrels];
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
      case ArcherStates.RUN_RIGHT:
        this.setFlipX(false);
        this.play('archer-run-anim', true);
        break;
      case ArcherStates.RUN_LEFT:
        this.setFlipX(true);
        this.play('archer-run-anim', true);
        break;
      case ArcherStates.IDLE_LEFT:
        this.setFlipX(true);
        this.play('archer-idle-anim', true);
        break;
      case ArcherStates.IDLE_RIGHT:
        this.setFlipX(false);
        this.play('archer-idle-anim', true);
        break;
      case ArcherStates.SHOOT_RIGHT:
        this.setFlipX(false);
        this.play('archer-shoot-right-anim', true);
        break;
      case ArcherStates.SHOOT_LEFT:
        this.setFlipX(true);
        this.play('archer-shoot-right-anim', true);
        break;
      case ArcherStates.SHOOT_UP:
        this.setFlipX(false); // Assumes UP animation faces right/is centered
        this.play('archer-shoot-up-anim', true);
        break;
      case ArcherStates.SHOOT_DOWN:
        this.setFlipX(false); // Assumes DOWN animation faces right/is centered
        this.play('archer-shoot-down-anim', true);
        break;
      case ArcherStates.SHOOT_UP_LEFT:
        this.setFlipX(true);
        this.play('archer-shoot-up-right-anim', true);
        break;
      case ArcherStates.SHOOT_UP_RIGHT:
        // For up-right, we flip the up-left animation horizontally.
        this.setFlipX(false);
        this.play('archer-shoot-up-right-anim', true);
        break;
      case ArcherStates.SHOOT_DOWN_LEFT:
        this.setFlipX(true);
        this.play('archer-shoot-down-right-anim', true);
        break;
      case ArcherStates.SHOOT_DOWN_RIGHT:
        // For down-right, we flip the down-left animation horizontally.
        this.setFlipX(false);
        this.play('archer-shoot-down-right-anim', true);
        break;
      case ArcherStates.DEAD:
        if (this.isDying) {
          this.isDying = false;
          this.anims.stop();
          this.play('dead-anim-1', true);
          this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'dead-anim-1', () => {
            this.scene.time.delayedCall(2000, () => {
              // Check if the entity has been destroyed in the meantime.
              // A destroyed GameObject will have its `scene` property cleared.
              if (this.scene) {
                this.play('dead-anim-2', true);
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
