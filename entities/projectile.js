/**
 * Represents a projectile, like an arrow, that moves towards a target.
 */
export default class Projectile extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, texture, target, damage) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Add this projectile to the scene's projectile group for updates
    scene.projectiles.add(this);

    // Set origin to the center for proper rotation
    this.setOrigin(0.5, 0.5);
    this.setScale(0.8);

    this.target = target;
    this.damage = damage;
    this.speed = 350; // Used to calculate flight time
    this.gravity = 600; // The pull of gravity on the arrow
    this.state = 'FLYING';

    this.setDepth(y + 10); // Set initial depth, will update

  }

  launch() {
    if (!this.target || !this.target.active) {
      this.destroy();
      return;
    }

    // --- Target Prediction to increase accuracy ---
    // This logic is now inside launch() so it uses the correct speed for subclasses like Bomb.
    const distanceToTarget = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
    const approxFlightTime = distanceToTarget / this.speed; // time in seconds

    let predictedX = this.target.x;
    let predictedY = this.target.y;

    // If the target is moving via a tween, predict its future position.
    if (this.target.moveTween && this.target.moveTween.isPlaying()) {
      const tweenData = this.target.moveTween.data;
      // Check if the tween is for x and y movement
      if (tweenData.length >= 2 && tweenData[0].key === 'x' && tweenData[1].key === 'y') {
        const targetDestX = tweenData[0].end;
        const targetDestY = tweenData[1].end;
        const remainingDuration = (this.target.moveTween.duration - this.target.moveTween.elapsed) / 1000; // in seconds

        if (remainingDuration > 0) {
          // Calculate the target's current velocity and predict its position after approxFlightTime
          predictedX = this.target.x + ((targetDestX - this.target.x) / remainingDuration) * approxFlightTime;
          predictedY = this.target.y + ((targetDestY - this.target.y) / remainingDuration) * approxFlightTime;
        }
      }
    }
    // This is the new aim point for the projectile.
    const targetPos = { x: predictedX, y: predictedY };


    // Enable physics and gravity for the arc
    this.body.setAllowGravity(true);
    this.body.setGravityY(this.gravity);

    const distance = Phaser.Math.Distance.Between(this.x, this.y, targetPos.x, targetPos.y);
    const flightTime = distance / this.speed; // flight time in seconds

    // Calculate the required velocities for the arc
    const velocityX = (targetPos.x - this.x) / flightTime;
    // The vertical velocity needed to hit the target's y after flightTime, considering gravity
    const velocityY = ((targetPos.y - this.y) / flightTime) - (0.5 * this.gravity * flightTime);

    this.body.setVelocity(velocityX, velocityY);

    // Set a timer for when the arrow should land
    this.impactTimer = this.scene.time.delayedCall(flightTime * 1000, this.onImpact, [], this);
  }

  onImpact() {
    // Stop all movement
    this.body.stop();
    this.body.setAllowGravity(false);
    this.state = 'LANDED';

    // Check if it hit the target at its current position
    // Check health > 0 to prevent race conditions where two projectiles hit a target in the same frame.
    if (this.target && this.target.health > 0 && Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y) < 30) {
      // It's a hit!
      this.target.sustainDamage(this.damage);
      this.destroy(); // Destroy on impact
    } else {
      // It's a miss, stick it to the ground
      this.stickToGround();
    }
  }

  stickToGround() {
    this.state = 'STUCK_GROUND';
    this.play('arrow-stuck');
    // Adjust depth to appear on the ground, slightly behind things at its y-level
    this.setDepth(this.y - 1);

    this.scene.time.delayedCall(2000, () => this.destroy());
  }

  update(time, delta) {
    if (this.state === 'FLYING') {
      // Update rotation to follow the flight path
      if (this.body.velocity.length() > 0) {
        this.rotation = this.body.velocity.angle();
      }
    }
    // No other states need active updates.
  }
}