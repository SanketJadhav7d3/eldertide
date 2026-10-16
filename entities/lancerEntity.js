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

import CombatUnit from './combatUnit.js'
import { LancerStates, Stances } from './states.js';


export default class Lancer extends CombatUnit {
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
    this.lastTargetCheck = 0;

    // The hit frame index within the attack animations.
    // Assuming a 6-frame animation, the 4th frame (index 3) is the impact.
    this.attackFrames = [3];
    this.damage = 30; // Higher damage than a warrior.

    this.depthOffset = 26;
  }

  attackTarget() {
    if (!this.anims.currentFrame) return;
    this.applyAttackFrameDamage(this.context.target, this.damage, this.attackFrames);

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

  getArmyGroup() {
    return this.scene.playerArmy.lancers;
  }

  update(time, delta, enemyArmy) {
    super.update(time, delta);
    this.runAI(time, enemyArmy);

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
        this.playDeathAnimation(2000);
        break;
    }
  }
}