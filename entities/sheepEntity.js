import { StructureStates } from './states.js';
import Structure from './structureEntity.js';

export default class Sheep extends Structure {
  constructor(scene, x, y) {
    // The physics body should be small, representing the core of the sheep.
    const bodyWidth = 40;
    const bodyHeight = 10;
    const bodyOffsetY = 0;

    // We use the 'sheep-idle' texture loaded as a spritesheet.
    super(scene, x, y, 'sheep-idle', bodyWidth, bodyHeight, bodyOffsetY);

    // Sheep are not built; they just exist.
    this.currentState = 'IDLE'; // A custom state for sheep.
    this.health = 50; // Represents total meat available.
    this.meatPileHealthThreshold = 20; // Health at which the sheep becomes a meat pile.
    this.meatYield = 10; // How much meat this sheep provides.
    this.animationKey = 'sheep-idle-anim'; // Store the animation key

    this.setFrame(0); // Start with the first frame of the spritesheet.
    this.setScale(0.8); // Adjust scale to fit the world.

    //this.setOrigin(0.5, 1); // Set the origin to the bottom-center

    this.setDepth(this.y);
    this.setInteractive(scene.input.makePixelPerfect());

    this.meatCollected = false; // Flag to ensure meat is collected only once.
  }

  sustainDamage(amount) {
    // If the sheep is already destroyed, do nothing.
    if (!this.active) return 0;

    this.flashRed();

    // First hit: Instantly turn the sheep into a butchered pile.
    if (this.currentState === 'IDLE') {
      this.currentState = 'BUTCHERED';
      this.body.enable = false; // Disable collisions.
      return 0; // No resources on the first hit.
    }

    // Subsequent hits: Extract meat from the pile.
    if (this.currentState === 'BUTCHERED') {
      const extractedAmount = Math.min(this.health, amount);
      this.health -= extractedAmount;

      if (this.health <= 0) {
        this.destroy(); // Depleted, so remove it.
      }
      return extractedAmount; // Return the amount of meat collected.
    }
    return 0;
  }

  update(time, delta) {
    super.update(time, delta); // This will call the depth setting from the parent Structure

    if (this.currentState === 'BUTCHERED') {
      // When butchered, show the meat pile animation and stop it at the last frame.
      if (this.anims.currentAnim?.key !== 'meat-spawn-anim') {
        this.play('meat-spawn-anim');
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.anims.stop());
      }
    } else if (this.currentState === 'IDLE') {
      this.play(this.animationKey, true);
    }
  }
}