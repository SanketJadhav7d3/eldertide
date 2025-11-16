
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

export default class Bomber extends Entity {
  constructor(scene, x, y, width, height, pathLayer, finder) {
    super(scene, x, y, width, height, 'bomber-entity', pathLayer, finder);

    this.currentState = BomberStates.IDLE_RIGHT;
    this.health = 40;
    this.isDying = false; // Flag to ensure death sequence runs only once
  }

  sustainDamage(amount) {
    this.health -= amount;
    this.setTint(0xff0000); // Flash red
    this.scene.time.delayedCall(200, () => this.clearTint());

    if (this.health <= 0 && !this.isDying) {
      this.active = false;
      this.isDying = true;
      this.transitionStateTo('DEAD');
      this.setDepth(-1); // Set depth to appear behind other entities

      // Disable physics but keep sprite visible for animation
      this.disableBody(true, false);

      // Move from active army to dying group
      // Note: Bombers are not in an army group yet, but this is for future-proofing
      // if (this.scene.enemyArmy.bombers) {
      //   this.scene.enemyArmy.bombers.remove(this);
      // }
      this.scene.dyingEntities.add(this);
    }
  }

  update() {
    // Allow update to run for the DEAD state even if not active
    if (!this.active && this.currentState !== 'DEAD') return;
    if (this.health <= 0 && !this.isDying) this.sustainDamage(0);

    if (this.currentState == "RUN_RIGHT") {
      // this.flipX = false;
      this.setFlipX(false);
      this.play('bomber-run-anim', true);
    }

    if (this.currentState == "RUN_LEFT") {
      // this.flipX = true;
      this.setFlipX(true);
      this.play('bomber-run-anim', true);
    }

    if (this.currentState == "IDLE_LEFT") {
      this.setFlipX(true);
      this.play('bomber-idle-anim', true);
    }

    if (this.currentState == "IDLE_RIGHT") {
      this.setFlipX(false);
      this.play('bomber-idle-anim', true);
    }

    if (this.currentState == "THROW_LEFT") {
      this.setFlipX(true);
      this.play('bomber-throw-anim', true);
    }

    if (this.currentState == "THROW_RIGHT") {
      this.setFlipX(false);
      this.play('bomber-throw-anim', true);
    }

    if (this.currentState == "DEAD") {
      if (this.isDying) {
        this.isDying = false; // Prevent this block from running again
        this.anims.stop(); // Stop any previous animation

        // Play the first death animation
        this.play('dead-anim-1', true);

        // When the first animation completes, play the second one
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'dead-anim-1', () => {
          // Add a delay before playing the second animation
          this.scene.time.delayedCall(2000, () => {
            this.play('dead-anim-2', true);
            // After the second animation completes, destroy the game object
            this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'dead-anim-2', () => {
              this.destroy();
            });
          });
        });
      }
    }
  }
}
