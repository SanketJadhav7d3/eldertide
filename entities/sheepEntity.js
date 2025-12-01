import Structure from './structureEntity.js';
import { StructureStates } from './states.js';

export default class Sheep extends Structure {
  constructor(scene, x, y) {
    // The physics body should be small, representing the core of the sheep.
    const bodyWidth = 40;
    const bodyHeight = 30;
    const bodyOffsetY = 10;

    // We use the 'sheep-idle' texture loaded as a spritesheet.
    super(scene, x, y, 'sheep-idle', bodyWidth, bodyHeight, bodyOffsetY);

    // Sheep are not built; they just exist.
    this.currentState = 'IDLE'; // A custom state for sheep.
    this.health = 50; // Health for harvesting.
    this.animationKey = 'sheep-idle-anim'; // Store the animation key

    this.setFrame(0); // Start with the first frame of the spritesheet.
    this.setScale(0.8); // Adjust scale to fit the world.

    this.setOrigin(0.5, 1); // Set the origin to the bottom-center

    this.setDepth(this.y);
    this.setInteractive(scene.input.makePixelPerfect());

    this.meatCollected = false; // Flag to ensure collection animation only triggers once.
  }

  sustainDamage(amount) {
    if (this.currentState === StructureStates.DESTROYED) return;

    this.health -= amount;
    this.flashRed();

    if (this.health <= 0) {
      this.currentState = StructureStates.DESTROYED;
      this.body.enable = false; // Disable collisions.
    }
  }

  update(time, delta) {
    super.update(time, delta); // This will call the depth setting from the parent Structure

    if (this.currentState === StructureStates.DESTROYED && !this.meatCollected) {
      // When destroyed, trigger the collection animation.
      // We'll use the 'wood-spawn' animation as a placeholder for the meat pile.
      if (this.anims.currentAnim?.key !== 'wood-spawn-anim') {
        this.play('meat-spawn-anim');
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'wood-spawn-anim', () => {
          this.scene.collectResource(this, 'meat');
        });
        this.meatCollected = true; // Set flag to prevent re-triggering
      }
    } else if (this.currentState !== StructureStates.DESTROYED) {
      this.play(this.animationKey, true);
    }
  }
}