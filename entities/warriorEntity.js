
// ▄▄▌ ▐ ▄▌ ▄▄▄· ▄▄▄  ▄▄▄  ▪        ▄▄▄      ▄▄▄ . ▐ ▄ ▄▄▄▄▄▪  ▄▄▄▄▄ ▄· ▄▌
// ██· █▌▐█▐█ ▀█ ▀▄ █·▀▄ █·██ ▪     ▀▄ █·    ▀▄.▀·•█▌▐█•██  ██ •██  ▐█▪██▌
// ██▪▐█▐▐▌▄█▀▀█ ▐▀▀▄ ▐▀▀▄ ▐█· ▄█▀▄ ▐▀▀▄     ▐▀▀▪▄▐█▐▐▌ ▐█.▪▐█· ▐█.▪▐█▌▐█▪
// ▐█▌██▐█▌▐█ ▪▐▌▐█•█▌▐█•█▌▐█▌▐█▌.▐▌▐█•█▌    ▐█▄▄▌██▐█▌ ▐█▌·▐█▌ ▐█▌· ▐█▀·.
//  ▀▀▀▀ ▀▪ ▀  ▀ .▀  ▀.▀  ▀▀▀▀ ▀█▄▀▪.▀  ▀     ▀▀▀ ▀▀ █▪ ▀▀▀ ▀▀▀ ▀▀▀   ▀ •

import CombatUnit from './combatUnit.js'
import { WarriorStates, Stances } from './states.js';


export default class Warrior extends CombatUnit {
  constructor(scene, x, y, width, height, offsetX, offsetY, pathLayer, finder, grid) {
    super(scene, x, y, 'warrior-entity', width, height, offsetX, offsetY, pathLayer, finder, grid);

    this.currentState = WarriorStates.IDLE_RIGHT;
    this.health = 100; 

    this.createAttackRange(120);
    this.createRange(500);

    // attack enemy
    this.lastTargetCheck = 0;

    this.attackFrames = [15, 21, 27, 33];
    this.damage = 20;

    this.depthOffset = 26;
  }

  attackTarget() {
    if (!this.anims.currentFrame) return;
    this.applyAttackFrameDamage(this.context.target, this.damage, this.attackFrames);

    this.stopMoving(); // Ensure any prior movement is stopped before attacking.

    // Face the target
    if (this.context.target && this.context.target.x < this.x) {
      this.transitionStateTo("UPWARD_SLASH_LEFT");
    } else {
      this.transitionStateTo("UPWARD_SLASH_RIGHT");
    }
  }

  getArmyGroup() {
    return this.scene.playerArmy.warriors;
  }

  update(time, delta, enemyArmy) {
    super.update(time, delta); // Handles depth sorting
    // --- Debug line for depth sorting ---
    //if (this.scene.debugGraphics) {
      //this.scene.debugGraphics.lineStyle(1, 0xffff00, 1); // Yellow line, 1px thick
      //this.scene.debugGraphics.lineBetween(this.x - 60, this.y + 20, this.x +  60, this.y + 20);
    //}

    this.runAI(time, enemyArmy);

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
        this.playDeathAnimation(2000);
        break; // Added break
    }
  }
}
