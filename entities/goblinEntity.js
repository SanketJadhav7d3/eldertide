
//      ▄████  ▒█████   ▄▄▄▄    ██▓     ██▓ ███▄    █ 
//     ██▒ ▀█▒▒██▒  ██▒▓█████▄ ▓██▒    ▓██▒ ██ ▀█   █ 
//    ▒██░▄▄▄░▒██░  ██▒▒██▒ ▄██▒██░    ▒██▒▓██  ▀█ ██▒
//    ░▓█  ██▓▒██   ██░▒██░█▀  ▒██░    ░██░▓██▒  ▐▌██▒
//    ░▒▓███▀▒░ ████▓▒░░▓█  ▀█▓░██████▒░██░▒██░   ▓██░
//     ░▒   ▒ ░ ▒░▒░▒░ ░▒▓███▀▒░ ▒░▓  ░░▓  ░ ▒░   ▒ ▒ 
//      ░   ░   ░ ▒ ▒░ ▒░▒   ░ ░ ░ ▒  ░ ▒ ░░ ░░   ░ ▒░
//    ░ ░   ░ ░ ░ ░ ▒   ░    ░   ░ ░    ▒ ░   ░   ░ ░ 
//          ░     ░ ░   ░          ░  ░ ░           ░ 

import EnemyUnit from './enemyUnit.js';
import { GoblinStates } from './states.js';

export default class Goblin extends EnemyUnit {

  constructor(scene, x, y, width, height, offsetX, offsetY, pathLayer, finder, grid) {
    super(scene, x, y, 'goblin-entity', width, height, offsetX, offsetY, pathLayer, finder, grid);

    this.grid = grid;

    this.currentState = GoblinStates.IDLE_LEFT;
    this.health = 40;
    this.isDying = false; // Flag to ensure death animation sequence is initiated only once.

    this.createAttackRange(80);
    this.createRange(500);
    this.attackFrames = [17, 24, 31];
    this.damage = 4;
  }


  handleAttackOverlapWith(otherEntity) {
    //this.scene.physics.add.overlap(this.attackRange, otherEntity, 
      //(entity1, entity2) => { this.onAttackOverlap(entity1, entity2) }, null, this.scene);

    //this.scene.physics.add.overlap(this, otherEntity, 
      //() => { this.setAlpha(0.5) }, null, this.scene);
  }

  getArmyGroup() {
    return this.scene.enemyArmy.goblins;
  }

  attackTarget() {
    if (!this.anims.currentFrame) return;
    this.applyAttackFrameDamage(this.context.target, this.damage, this.attackFrames);

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

  update(time, delta, playerArmy) {
    super.update(time, delta); // Handles depth sorting

    this.runAI(time, playerArmy);

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
        this.playDeathAnimation(5000);
        break; // Added break
    }
  }
}
