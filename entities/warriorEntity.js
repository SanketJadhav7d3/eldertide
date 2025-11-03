
// ▄▄▌ ▐ ▄▌ ▄▄▄· ▄▄▄  ▄▄▄  ▪        ▄▄▄      ▄▄▄ . ▐ ▄ ▄▄▄▄▄▪  ▄▄▄▄▄ ▄· ▄▌
// ██· █▌▐█▐█ ▀█ ▀▄ █·▀▄ █·██ ▪     ▀▄ █·    ▀▄.▀·•█▌▐█•██  ██ •██  ▐█▪██▌
// ██▪▐█▐▐▌▄█▀▀█ ▐▀▀▄ ▐▀▀▄ ▐█· ▄█▀▄ ▐▀▀▄     ▐▀▀▪▄▐█▐▐▌ ▐█.▪▐█· ▐█.▪▐█▌▐█▪
// ▐█▌██▐█▌▐█ ▪▐▌▐█•█▌▐█•█▌▐█▌▐█▌.▐▌▐█•█▌    ▐█▄▄▌██▐█▌ ▐█▌·▐█▌ ▐█▌· ▐█▀·.
//  ▀▀▀▀ ▀▪ ▀  ▀ .▀  ▀.▀  ▀▀▀▀ ▀█▄▀▪.▀  ▀     ▀▀▀ ▀▀ █▪ ▀▀▀ ▀▀▀ ▀▀▀   ▀ •

import Entity from './playerEntity.js'
import { WarriorStates } from './states.js';

export default class Warrior extends Entity {
  constructor(scene, x, y, width, height, offsetX, offsetY, pathLayer, finder, grid) {
    super(scene, x, y, width, height, offsetX, offsetY, 'warrior-entity', pathLayer, finder, grid);
    this.currentState = WarriorStates.IDLE_RIGHT;
    this.health = 100;

    this.createAttackRange(100);
    this.createRange(500);

    // attack enemy
    this.context = {
      isEnemyInRange: false,
      isEnemyInAttackRange: false,
      enemy: null, 
    }

    this.attackFrames = [15, 21, 27, 33];
    this.damage = 2;
  }


  updateContext(enemy) {
    if (this.context.enemy != null) {
      // is contextual enemy in attack range
      if (!this.isInAttackRange(this.context.enemy)) {
        // is not in attack range
        this.context.isEnemyInAttackRange = false;
        if (!this.isInRange(this.context.enemy)) {
          // is not in range and by default not in attack range
          this.context.isEnemyInRange = false;
          this.context.enemy = null;
        } else {
          // is in range and not in attack range
          this.context.isEnemyInRange = true;
        }
      } else {
        this.context.isEnemyInRange = true;
        this.context.isEnemyInAttackRange = true;
      }
    } else {
      // make the enemy the contextual enemy
      if (this.isInRange(enemy)) {
        this.context.isEnemyInRange = true;
        this.context.enemy = enemy;
        if (this.isInAttackRange(enemy)) {
          this.context.isEnemyInAttackRange = true;
        }
      }
    } 
  }

  attackEnemy() {
    let currentFrame = this.anims.currentFrame;

    // for no reason
    if (!currentFrame) return;

    let frameNumber = currentFrame.frame.name;

    this.attackFrames.forEach(attackFrame => {
      if (frameNumber == attackFrame) {
        if (this.context.enemy) {
          // inflict damage on enemy
          this.context.enemy.sustainDamage();
        }
      }
    });

    this.stopMoving();
    this.setVelocity(0, 0);
    this.attackRange.setVelocity(0, 0);
    this.range.setVelocity(0, 0);

    // which side enemy is at
    this.transitionStateTo("UPWARD_SLASH_LEFT");
  }

  decide() {

    if (this.context.isEnemyInAttackRange) {
      this.attackEnemy();
    } else if (this.context.isEnemyInRange && !this.context.isEnemyInAttackRange) {
      this.followEntity(this.context.enemy);
    } else {
      this.currentState = "IDLE_LEFT";
      this.stopMoving();
    }
  }

  protectEntity(entity) {
    // go to the entity
    var entityPos = entity.getPosTile();
    this.moveToTile(entityPos[0], entityPos[1] - 1, this.grid);
  }

  sustainDamage() {
    this.health -= this.damage;
    this.setTint(0xff0000); 
    
    setTimeout(() => {
      this.clearTint(); 
    }, 10);
  }

  update(enemyArmy) {

    this.depth = (this.y / window.innerHeight) * 5;

    // check if context warrior is dead or not 
    if (!enemyArmy.goblins.contains(this.context.enemy)) {
      this.context.isEnemyInRange = false;
      this.context.isEnemyInAttackRange = false;
      this.context.enemy = null;
    }

    enemyArmy.goblins.children.iterate((child) => {
      this.updateContext(child);
    });

    //this.decide();

    switch (this.currentState) {
      case 'RUN_RIGHT':
        this.setFlipX(false);
        this.play('warrior-run-anim', true);
        break;

      case 'RUN_LEFT':
        this.setFlipX(true);
        this.play('warrior-run-anim', true);
        break;

      case 'IDLE_LEFT':
        this.setFlipX(true);
        this.play('warrior-idle-anim', true);
        break;

      case 'IDLE_RIGHT':
        this.setFlipX(false);
        this.play('warrior-idle-anim', true);
        break;

      case 'UPWARD_SLASH_LEFT':
        this.setFlipX(false);
        this.play('warrior-upward-slash-anim', true);
        break;

      case 'UPWARD_SLASH_RIGHT':
        this.setFlipX(true);
        this.play('warrior-upward-slash-anim', true);
        break;

      case 'DOWNWARD_SLASH_RIGHT':
        this.setFlipX(false);
        this.play('warrior-downward-slash-right-anim', true);
        break;

      case 'DOWNWARD_SLASH_LEFT':
        this.setFlipX(true);
        this.play('warrior-downward-slash-right-anim', true);
        break;

      case 'UPWARD_SLASH_FRONT':
        this.setFlipX(false);
        this.play('warrior-upward-slash-front-anim', true);
        break;

      case 'DOWNWARD_SLASH_FRONT':
        this.setFlipX(false);
        this.play('warrior-downward-slash-front-anim', true);
        break;

      case 'UPWARD_SLASH_BACK':
        this.setFlipX(false);
        this.play('warrior-upward-slash-back-anim', true);
        break;
      case 'DOWNWARD_SLASH_BACK':
        this.setFlipX(false);
        this.play('warrior-downward-slash-back-anim', true);
        break;
      case 'DEAD':
        this.setFlipX(false);
        this.play('dead-anim', true);
        break;
    }

    if (this.health <= 0) {
      this.disableBody(true, true);
      this.attackRange.destroy();
      this.range.destroy();
      this.destroy();
    }
  }
}
