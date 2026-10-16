
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

import EnemyUnit from './enemyUnit.js';
import { BomberStates } from './states.js';
import Bomb from './bomb.js';

export default class Bomber extends EnemyUnit {
  constructor(scene, x, y, width, height, offsetX, offsetY, pathLayer, finder, grid) {
    super(scene, x, y, 'bomber-entity', width, height, offsetX, offsetY, pathLayer, finder, grid);

    this.currentState = BomberStates.IDLE_RIGHT;
    this.health = 40;
    this.isDying = false;

    // Bombers have a medium range.
    this.createRange(600); // Sight and attack range are the same.

    // AI Context
    this.attackCooldown = 2500; // 2.5 seconds between throws
    this.lastAttackTime = 0;

    // Bomb details
    this.bombReleaseFrame = 4; // Frame in 'bomber-throw-anim' to release the bomb
    this.damage = 12; // Bombs are powerful
  }

  // Bombers throw from anywhere inside their sight range.
  isTargetAttackable(target) {
    return this.isInRange(target);
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
        // Ensure the target is still valid (active and alive) at the moment of release.
        if (!currentTarget || !currentTarget.active || currentTarget.health <= 0) {
          this.off(Phaser.Animations.Events.ANIMATION_UPDATE);
          return;
        }

        const bomb = new Bomb(this.scene, this.x, this.y, currentTarget, this.damage);
        bomb.play('bomb-projectile-mid-air-anim'); // Start bomb animation
        bomb.launch(); // Explicitly launch the bomb
        this.off(Phaser.Animations.Events.ANIMATION_UPDATE);
        this.lastAttackTime = now; // Start cooldown after firing
      }
    });
  }

  getArmyGroup() {
    return this.scene.enemyArmy.bombers;
  }

  update(time, delta, playerArmy) {
    super.update(time, delta);
    this.runAI(time, playerArmy);

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
        this.playDeathAnimation(2000);
      break;
    }
  }
}
