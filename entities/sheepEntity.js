import Structure from './structureEntity.js';
import { StructureStates } from './states.js';

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
    this.health = 50; // Health for harvesting.
    this.meatPileHealthThreshold = 20; // Health at which the sheep becomes a meat pile.
    this.animationKey = 'sheep-idle-anim'; // Store the animation key

    this.setFrame(0); // Start with the first frame of the spritesheet.
    this.setScale(0.8); // Adjust scale to fit the world.

    //this.setOrigin(0.5, 1); // Set the origin to the bottom-center

    this.setDepth(this.y);
    this.setInteractive(scene.input.makePixelPerfect());

    this.meatCollected = false; // Flag to ensure collection animation only triggers once.
  }

  sustainDamage(amount) {
    if (this.currentState === StructureStates.DESTROYED) return;

    this.health = Math.max(0, this.health - amount);
    this.flashRed();

    if (this.health <= 0) {
      this.currentState = StructureStates.DESTROYED;
      this.active = false; // Mark as inactive for harvesting.
      this.body.enable = false; // Disable collisions.
      this.destroy(); // Disappear immediately.
    } else if (this.health <= this.meatPileHealthThreshold) {
      // If health is below the threshold but not zero, it becomes a meat pile.
      this.currentState = 'BUTCHERED';
    }
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