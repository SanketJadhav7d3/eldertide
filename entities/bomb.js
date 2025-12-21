import Projectile from './projectile.js';

/**
 * Represents a bomb projectile thrown by a Bomber.
 */
export default class Bomb extends Projectile {
  constructor(scene, x, y, target, damage) {
    // Call the parent Projectile constructor with bomb-specific details
    super(scene, x, y, 'bomb-projectile', target, damage);

    this.speed = 250; // Bombs are lobbed slower than arrows
    this.gravity = 500; // Standard gravity for a lobbed object

    // Bomb-specific properties
    this.explosionRadius = 60; // The area of effect for the explosion

    // Play the bomb-specific animation
    this.play('bomb-projectile-mid-air-anim');

    // Launch the bomb using its unique speed and gravity settings.
    this.launch();
  }

  /**
   * Overrides the parent onImpact. A bomb explodes when it lands.
   */
  onImpact() {
    // Stop all movement
    this.body.stop();
    this.body.setAllowGravity(false);
    this.state = 'LANDED';

    // Explode on impact, regardless of hit or miss.
    this.explode();
  }

  /**
   * Creates an explosion that deals area-of-effect damage.
   */
  explode() {
    // Play explosion animation at the bomb's landing position.
    const explosion = this.scene.add.sprite(this.x, this.y, 'barrel-explosion');
    explosion.setDepth(this.y + 1); // Ensure explosion is rendered on top.
    explosion.play('barrel-explosion-anim');
    explosion.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      explosion.destroy();
    });

    // --- Get all potential targets for the explosion ---
    const playerEntities = [
      ...this.scene.playerArmy.warriors.getChildren(),
      ...this.scene.playerArmy.lancers.getChildren(),
      ...this.scene.playerArmy.archers.getChildren(),
      ...this.scene.playerArmy.workers.getChildren(),
      ...this.scene.towers.getChildren(),
      ...this.scene.houses.getChildren(),
      ...this.scene.barracks.getChildren(),
      ...this.scene.archeries.getChildren(),
      ...this.scene.monasteries.getChildren(),
    ];
    if (this.scene.castle) {
      playerEntities.push(this.scene.castle);
    }

    // Bombs can also damage other enemies (friendly fire).
    const enemyEntities = [
      ...this.scene.enemyArmy.goblins.getChildren(),
      ...this.scene.enemyArmy.barrels.getChildren(),
      ...this.scene.enemyArmy.bombers.getChildren(),
    ];

    const allEntities = [...playerEntities, ...enemyEntities];

    // --- Apply damage to all entities in radius ---
    allEntities.forEach(entity => {
      // Ensure the entity is valid and has health to take damage.
      // This prevents race conditions where two explosions damage the same entity in one frame.
      if (entity && entity.health > 0) {
        const distance = Phaser.Math.Distance.Between(this.x, this.y, entity.x, entity.y);
        if (distance <= this.explosionRadius) {
          // The 'damage' property is inherited from the Projectile class.
          entity.sustainDamage(this.damage);
        }
      }
    });

    // Destroy the bomb sprite itself after it has exploded.
    this.destroy();
  }

  /**
   * Overrides the parent stickToGround. A bomb doesn't stick, it explodes.
   */
  stickToGround() {
    // On a miss, the bomb still explodes.
    this.explode();
  }
}