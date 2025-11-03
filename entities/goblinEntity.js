
//      ▄████  ▒█████   ▄▄▄▄    ██▓     ██▓ ███▄    █ 
//     ██▒ ▀█▒▒██▒  ██▒▓█████▄ ▓██▒    ▓██▒ ██ ▀█   █ 
//    ▒██░▄▄▄░▒██░  ██▒▒██▒ ▄██▒██░    ▒██▒▓██  ▀█ ██▒
//    ░▓█  ██▓▒██   ██░▒██░█▀  ▒██░    ░██░▓██▒  ▐▌██▒
//    ░▒▓███▀▒░ ████▓▒░░▓█  ▀█▓░██████▒░██░▒██░   ▓██░
//     ░▒   ▒ ░ ▒░▒░▒░ ░▒▓███▀▒░ ▒░▓  ░░▓  ░ ▒░   ▒ ▒ 
//      ░   ░   ░ ▒ ▒░ ▒░▒   ░ ░ ░ ▒  ░ ▒ ░░ ░░   ░ ▒░
//    ░ ░   ░ ░ ░ ░ ▒   ░    ░   ░ ░    ▒ ░   ░   ░ ░ 
//          ░     ░ ░   ░          ░  ░ ░           ░ 

import Entity from './playerEntity.js'
import { GoblinStates } from './states.js';

export default class Goblin extends Entity {

  constructor(scene, x, y, width, height, offsetX, offsetY, pathLayer, finder, grid) {
    super(scene, x, y, width, height, offsetX, offsetY, 'goblin-entity', pathLayer, finder, grid);

    this.grid = grid;

    this.currentState = GoblinStates.IDLE_LEFT;
    this.health = 40;

    this.createAttackRange(100);
    this.createRange(500);

    // killing warrior has higher priority than destroying tower
    this.context = {
      isWarriorInRange: false,
      isWarriorInAttackRange: false,
      isTowerInRange: false,
      isTowerInAttackRange: false,
      warrior: null, 
      tower: null
    }

    this.attackFrames = [17, 24, 31];
    this.damage = 3;
  }

  handleAttackOverlapWith(otherEntity) {
    //this.scene.physics.add.overlap(this.attackRange, otherEntity, 
      //(entity1, entity2) => { this.onAttackOverlap(entity1, entity2) }, null, this.scene);

    //this.scene.physics.add.overlap(this, otherEntity, 
      //() => { this.setAlpha(0.5) }, null, this.scene);
  }

  sustainDamage() {
    this.health -= this.damage;
    this.setTint(0xff0000); 
    
    setTimeout(() => {
      this.clearTint(); 
    }, 10);
  }

  onAttackOverlap(entity1, entity2) {
    if (entity2.texture.key == "warrior-entity" && !this.context.isWarriorInRange) {
      this.context.isWarriorInRange = true;
      this.context.warrior = entity2;
      // attack the warrior
    }
    else if (entity2.texture.key == "tower-entity" && !this.context.isTowerInRange) {
      this.context.isTowerInRange = true;
      this.context.tower = entity2;
    }
  }

  attackWarrior() {
    // go to the warrior
    // attack it
    let currentFrame = this.anims.currentFrame;
    if (!currentFrame) return;
    let frameNumber = currentFrame.frame.name;

    this.attackFrames.forEach(attackFrame => {
      if (frameNumber == attackFrame) {
        if (this.context.warrior)
          this.context.warrior.sustainDamage();
      }
    });

    this.stopMoving();

    if (this.posTaken[0] == 0 && this.posTaken[1] == 1)
      this.transitionStateTo("ATTACK_RIGHT");
    else if (this.posTaken[0] == 0 && this.posTaken[1] == -1)
      this.transitionStateTo("ATTACK_LEFT");
    else if (this.posTaken == 1 && this.posTaken[1] == 0)
      this.transitionStateTo("ATTACK_LEFT");
    else if (this.posTaken == -1 && this.posTaken[1] == 0)
      this.transitionStateTo("ATTACK_RIGHT");
    else
      this.transitionStateTo("ATTACK_LEFT");

    // var warriorPos = this.context.warrior.getPosTile();
    // this.followEntity(this.context.warrior);
  }

  attackTower(tower) {
    // to the tower
    // attack it
    var toweraPos = this.context.tower.getPosTile();
    // this.moveToTile(towerPos[0], towerPos[1], this.grid);
  }

  isInAttackRange(enemy) {
    return this.scene.physics.world.overlap(this.attackRange, enemy);
  }

  isInRange(enemy) {
    return this.scene.physics.world.overlap(this.range, enemy);
  }

  // by value
  updateContext(enemy) {

    if (this.context.warrior != null) {
      // check for health of the enemy

      // is contextual warrior in attack range
      if (!this.isInAttackRange(this.context.warrior)) {
        // is not in attack range
        this.context.isWarriorInAttackRange = false;

        if (!this.isInRange(this.context.warrior)) {
          // is not in range and by default not in attack range
          this.context.isWarriorInRange = false;
          this.context.warrior = null;
        } else {
          // is in range and not in attack range
          this.context.isWarriorInRange = true;
          // idotic
          // this.context.warrior = enemy;
        }
      } else {
        this.context.isWarriorInAttackRange = true;
        this.context.isWarriorInRange = true;
        // this.context.warrior = enemy;

      }
    } else {
      // make the enemy the contextual warrior
      if (this.isInRange(enemy)) {
        this.context.isWarriorInRange = true;
        this.context.warrior = enemy;
        if (this.isInAttackRange(enemy)) {
          this.context.isWarriorInAttackRange = true;
        }
      } else {
        this.context.isWarriorInAttackRange = false;
        this.context.isWarriorInRange = false;
        this.context.warrior = null;
      }
    } 
  }

  decide() {

    if (this.context.isWarriorInAttackRange) {
      this.attackWarrior();
    } else if (this.context.isWarriorInRange && !this.context.isWarriorInAttackRange) {
      this.followEntity(this.context.warrior);
    } else {
      var words = this.currentState.split('_')
      var dir = words[words.length-1]
      if (dir == "FRONT" || dir == "BACK") dir = "LEFT";
      this.currentState = "IDLE_" + dir;
      this.stopMoving();
    }
  }

  update(playerArmy) {

    // update depth
    this.depth = (this.y / window.innerHeight) * 5;

    // check if context warrior is dead or not 
    if (!playerArmy.warriors.contains(this.context.warrior)) {
      this.context.isWarriorInRange = false;
      this.context.isWarriorInAttackRange = false;
      this.context.warrior = null;
    }

    playerArmy.warriors.children.iterate((child) => {
      // if there is overlap between the goblin and the warrior
      // check if there is already any warrior in range
      // if yes then don't update unless if the new warrior is not attacking the goblin
      this.updateContext(child);
    });


    this.decide();

    switch (this.currentState) {
      case "RUN_RIGHT": 
        // this.flipX = false;
        this.setFlipX(false);
        this.play('goblin-run-anim', true);
        break;

      case "RUN_LEFT":
        // this.flipX = true;
        this.setFlipX(true);
        this.play('goblin-run-anim', true);
        break;

      case "IDLE_LEFT":
        this.setFlipX(true);
        this.play('goblin-idle-anim', true);
        break;

      case "IDLE_RIGHT":
        this.setFlipX(false);
        this.play('goblin-idle-anim', true);
        break; 

      case "ATTACK_LEFT":
        this.setFlipX(true);
        this.play('goblin-attack-right-anim', true);
        break;

      case "ATTACK_RIGHT":
        this.setFlipX(false);
        this.play('goblin-attack-right-anim', true);
        break;

      case "ATTACK_FRONT":
        this.play('goblin-attack-front-anim', true);
        break;

      case "ATTACK_BACK":
        this.play('goblin-attack-back-anim', true);
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
