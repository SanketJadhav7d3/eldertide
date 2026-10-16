import CombatUnit from './combatUnit.js'
import { ArcherStates, Stances } from './states.js';
import Projectile from './projectile.js';
import { BALANCE } from '../balance.js';

export default class Archer extends CombatUnit {
  constructor(scene, x, y, width, height, offsetX, offsetY, pathLayer, finder, grid) {
    super(scene, x, y, 'archer-entity', width, height, offsetX, offsetY, pathLayer, finder, grid);

    this.currentState = ArcherStates.IDLE_RIGHT;
    this.health = BALANCE.units.archer.health;
    this.isDying = false; // Flag to ensure death sequence runs only once

    // Archers have a long range but no "attack" range. They attack from their sight range.
    this.createRange(BALANCE.units.archer.sightBoxPx); // Sight and attack range

    // AI Context
    this.lastTargetCheck = 2000; // Timer for target acquisition
    this.targetCheckInterval = 250; // Check more often for responsiveness
    this.attackCooldown = BALANCE.units.archer.cooldownMs;
    this.lastAttackTime = 0;

    // Projectile details
    this.arrowReleaseFrame = 4; // Release the arrow earlier in the animation
    this.damage = BALANCE.units.archer.damage;

    this.depthOffset = 26;
  }

  // Archers shoot from anywhere inside their sight range.
  isTargetAttackable(target) {
    return this.isInRange(target);
  }

  attackTarget() {
    // Check cooldown
    const now = this.scene.time.now;
    if (now < this.lastAttackTime + this.attackCooldown) {
      // Reloading: stand idle facing the target instead of looping the shooting animation.
      this.transitionStateTo(this.context.target && this.context.target.x < this.x
        ? ArcherStates.IDLE_LEFT : ArcherStates.IDLE_RIGHT);
      return;
    }

    if (this.currentState.includes('RUN')) this.stopMoving();

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
        // Ensure the target is still valid (active and alive) at the moment of release.
        if (!currentTarget || !currentTarget.active || currentTarget.health <= 0) {
          this.off(Phaser.Animations.Events.ANIMATION_UPDATE);
          return;
        }

        // Use the captured target to create and fire the projectile.
        const arrow = new Projectile(this.scene, this.x, this.y, 'arrow-projectile', currentTarget, this.damage);
        // Manually play animation and launch, now that it's removed from the constructor.
        arrow.play('arrow-flying');
        arrow.launch();

        this.off(Phaser.Animations.Events.ANIMATION_UPDATE);
        this.lastAttackTime = now; // Start cooldown after firing
      }
    });
  }

  getArmyGroup() {
    return this.scene.playerArmy.archers;
  }

  update(time, delta, enemyArmy) {
    super.update(time, delta);
    this.runAI(time, enemyArmy);

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
        this.playDeathAnimation(2000);
        break;
    }
  }
}
