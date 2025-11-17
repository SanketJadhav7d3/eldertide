
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
    this.isDying = false; // Flag to ensure death animation sequence is initiated only once.

    this.createAttackRange(100);
    this.createRange(500);

    this.context = {
      target: null,
      isTargetInRange: false,
      isTargetInAttackRange: false,
    }
    this.lastTargetCheck = 0;
    this.attackFrames = [17, 24, 31];
    this.damage = 3;
  }

  handleAttackOverlapWith(otherEntity) {
    //this.scene.physics.add.overlap(this.attackRange, otherEntity, 
      //(entity1, entity2) => { this.onAttackOverlap(entity1, entity2) }, null, this.scene);

    //this.scene.physics.add.overlap(this, otherEntity, 
      //() => { this.setAlpha(0.5) }, null, this.scene);
  }

  sustainDamage(amount) {
    this.health -= amount;
    this.setTint(0xff0000); // Use a red tint for a more visible "flash"
    
    this.scene.time.delayedCall(200, () => {
      this.clearTint(); 
    });

    if (this.health <= 0) {
      console.log(`${this.constructor.name} ${this.id} health dropped to 0. Initiating death sequence.`);
      this.isDying = true; // Mark as dying to initiate death animation sequence
      this.transitionStateTo('DEAD'); // Transition to DEAD state for animation handling
      this.setDepth(-1); // Set depth to appear behind other entities

      // Destroy physics bodies that are not the main sprite body
      if (this.attackRange) this.attackRange.destroy();
      if (this.range) this.range.destroy();

      // Disable main physics body but keep sprite visible for animation

      // Move this entity from the active army to the dying group
      this.scene.enemyArmy.goblins.remove(this);
      this.scene.dyingEntities.add(this);

      return; // Stop further damage processing for this frame
    }
  }

  attackTarget() {
    let currentFrame = this.anims.currentFrame;
    if (!currentFrame) return;
    let frameNumber = currentFrame.frame.name;

    this.attackFrames.forEach(attackFrame => {
      if (parseInt(frameNumber, 10) === attackFrame) {
        if (this.context.target)
          console.log('targeted entity', this.context.target);
          this.context.target.sustainDamage(this.damage);

          // change the tint of the target enemy
          this.context.target.setTint(0xff0000);
      }
    });

    this.stopMoving();


    // Face the target
    if (this.context.target && this.context.target.x < this.x) {
      this.transitionStateTo("ATTACK_LEFT");
    } else {
      this.transitionStateTo("ATTACK_RIGHT");
    }
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

  decide() {
    // Highest priority: If a target is in attack range, ATTACK.
    if (this.context.target) {
      if (this.context.isTargetInAttackRange) {
        this.attackTarget();
        return; // Do nothing else
      }
    }

    // Second priority: If a target is in sight but not attack range, move towards it.
    if (this.context.target) {
      if (this.context.isTargetInRange) {
        // Only follow if not already moving via a tween.
        if (!this.moveTween || !this.moveTween.isPlaying()) {
          this.followEntity(this.context.target);
        } else {
          // This log is useful to know it's still on its way.
          // console.log(`Goblin ${this.id}: Continuing to move towards target.`);
        }
      } else { // If it's out of sight, drop the target.
        this.context.target = null;
        this.transitionStateTo(this.currentState.includes("LEFT") ? "IDLE_LEFT" : "IDLE_RIGHT");
        this.stopMoving();
      }
    } else {
      // No target, so go idle.
      this.transitionStateTo(this.currentState.includes("LEFT") ? "IDLE_LEFT" : "IDLE_RIGHT");
      this.stopMoving();
    }
  }

  update(time, delta, playerArmy) {
    this.setDepth(this.y);

    // Prevent dead entities from updating or acting, unless they are in the DEAD state
    // This check ensures that once 'active' is false, only the DEAD state logic runs.

    // Ensure attack and sight ranges follow the goblin
    this.updatePhysicsBodies();

    // If the current target is dead/inactive, immediately look for a new one.
    if (this.context.target && this.context.target.health <= 0) {
      this.context.target = null;
      this.lastTargetCheck = 0; // Force a new check immediately
    }

    if (time > this.lastTargetCheck + 1000) {
      if (!this.context.target) { // If we don't have a target, find the closest one (unit or structure)
        const enemyUnits = [playerArmy.workers, playerArmy.warriors, playerArmy.archers];
        const enemyStructures = [this.scene.towers, this.scene.houses, this.scene.barracks, this.scene.archeries, this.scene.monasteries];


        if (this.scene.castle) {
          // To avoid creating a new group every time, we can create a temporary one
          // only when needed. A better long-term solution would be to have the castle in a group.
          const castleGroup = this.scene.physics.add.group(this.scene.castle);
          enemyStructures.push(castleGroup); // Add the group to the list of targets
        }

        const { enemy: closestUnit } = this.findClosestEnemy(enemyUnits);
        const { enemy: closestStructure } = this.findClosestEnemy(enemyStructures);

        //console.log('closest unit', closestUnit);
        //console.log('closest structure', closestStructure);

        this.context.target = closestUnit || closestStructure;

        //console.log('target', this.context.target);
      }
      this.lastTargetCheck = time;
    }

    if (this.currentState !== 'DEAD') {
      this.updateContext();
      this.decide();
    }

    console.log(this.currentState);

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
      case 'DEAD':
        // This block is entered when the state is DEAD.
        // The `isDying` flag ensures the death animation setup runs only once.
        if (this.isDying) {
          this.isDying = false; // Prevent this block from running again

          // Play the first death animation
          this.play('dead-anim-1', true);

          // When the first animation completes, play the second one
          this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'dead-anim-1', () => {
            // Add a delay before playing the second animation
            this.scene.time.delayedCall(5000, () => {
              this.play('dead-anim-2', true);
              // After the second animation completes, destroy the game object
              this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'dead-anim-2', () => {
                this.destroy();
              });
            });
          });
        }
        break; // Added break
    }
  }
}
