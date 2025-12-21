
import Entity from './playerEntity.js';
import { BarrelStates } from './states.js';


export default class Barrel extends Entity {
    constructor(scene, x, y, width, height, offsetX, offsetY, pathLayer, finder, grid) {
        super(scene, x, y, 'barrel-entity', width, height, offsetX, offsetY, pathLayer, finder, grid);

        this.grid = grid;
        this.currentState = BarrelStates.IDLE_RIGHT;
        this.health = 60; // A bit sturdy to reach its target
        this.isDying = false; // Flag to ensure explosion sequence runs only once
        this.deathAnimStarted = false; // Flag to ensure the death animation runs only once.

        // The range at which the barrel will stop and light its fuse.
        this.createAttackRange(80);
        // The range at which it can see targets.
        this.createRange(600);

        this.context = {
            target: null,
            isTargetInRange: false,
            isTargetInAttackRange: false,
            isMovingToTarget: false, // For moving to final destination
        };
        this.lastTargetCheck = 0;

        // Explosion properties
        this.explosionDamage = 80;
        this.explosionRadius = 100;

        this.finalDestination = null;
        this.depthOffset = 26;
    }

    moveToTile(tileX, tileY, grid, onCompleteCallback = null) {
        // This is a command, so set the flag to prevent AI override.
        this.context.isMovingToTarget = true;
    
        // The callback will clear the flag upon arrival.
        const arrivalCallback = () => {
          this.context.isMovingToTarget = false;
          if (onCompleteCallback) onCompleteCallback();
        };
        super.moveToTile(tileX, tileY, grid, arrivalCallback);
      }

    sustainDamage(amount) {
        if (this.isDying) return;

        this.health -= amount;
        this.setTint(0xff0000);
        this.scene.time.delayedCall(200, () => this.clearTint());

        if (this.health <= 0) {
            this.stopMoving(); // Immediately stop any movement tweens.
            this.isDying = true; // Set flag to stop AI logic in update()
            this.transitionStateTo(BarrelStates.DEAD);
        }
    }

    explode() {
        // --- Get all potential targets for the explosion ---

        // Player units and structures
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

        // Enemy units (for friendly fire)
        const enemyEntities = [
            ...this.scene.enemyArmy.goblins.getChildren(),
            ...this.scene.enemyArmy.barrels.getChildren(), // Other barrels can be chain-exploded
            // ... add other enemy types here in the future
        ];

        // Combine all entities into one list
        const allEntities = [...playerEntities, ...enemyEntities];

        // --- Apply damage to all entities in radius ---
        allEntities.forEach(entity => {
            // Ensure the entity is active, not null, and not the barrel itself
            if (entity && entity.active && entity !== this) {
                const distance = Phaser.Math.Distance.Between(this.x, this.y, entity.x, entity.y);
                if (distance <= this.explosionRadius) {
                    entity.sustainDamage(this.explosionDamage);
                }
            }
        });

        // The barrel is now removed from its army group in `beginExplosionSequence`.
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
        if (this.isDying) return;
    
        // Priority 1: Target is in attack range. Light the fuse!
        if (this.context.target && this.context.isTargetInAttackRange) {
            this.stopMoving();
            this.context.isMovingToTarget = false;
            this.isDying = true;
            this.transitionStateTo(BarrelStates.DEAD);
            return;
        }
    
        // Priority 2: If moving to a final destination, check for interruptions.
        if (this.context.isMovingToTarget) {
            if (this.context.target && this.context.isTargetInAttackRange) {
                this.stopMoving();
                this.context.isMovingToTarget = false;
                this.isDying = true;
                this.transitionStateTo(BarrelStates.DEAD);
            }
            return; // Otherwise, continue the long move.
        }
    
        // Priority 3: If we have a target in sight (but not attack range), follow it.
        if (this.context.target && this.context.isTargetInRange) {
            this.followEntity(this.context.target);
            return;
        }
    
        // Priority 4: No target. Decide whether to move to destination or go idle.
        if (this.finalDestination) {
            if (!this.context.isMovingToTarget) {
                this.moveToTile(this.finalDestination.x, this.finalDestination.y, this.grid, () => {
                    // On arrival at final destination, just explode.
                    this.isDying = true;
                    this.transitionStateTo(BarrelStates.DEAD);
                });
            }
        } else {
            // No target and no destination, go idle.
            this.transitionStateTo(this.currentState.includes("LEFT") ? BarrelStates.IDLE_LEFT : BarrelStates.IDLE_RIGHT);
            this.stopMoving();
        }
    }

    update(time, delta, playerArmy) {
        super.update(time, delta);

        if (!this.isDying) {
            this.updatePhysicsBodies();

            if (this.context.target && (this.context.target.health <= 0 || !this.context.target.active)) {
                this.context.target = null;
                this.lastTargetCheck = 0;
            }

            if (time > this.lastTargetCheck + 1000) {
                if (!this.context.target && playerArmy) {
                    const enemyUnits = [playerArmy.workers, playerArmy.warriors, playerArmy.archers, playerArmy.lancers];
                    const enemyStructures = [this.scene.towers, this.scene.houses, this.scene.barracks, this.scene.archeries, this.scene.monasteries];
                    if (this.scene.castle) {
                        const castleGroup = this.scene.physics.add.group(this.scene.castle);
                        enemyStructures.push(castleGroup);
                    }
                    const { enemy: closestUnit } = this.findClosestEnemy(enemyUnits);
                    const { enemy: closestStructure } = this.findClosestEnemy(enemyStructures);
                    this.context.target = closestUnit || closestStructure;
                    if (this.context.target) this.context.isMovingToTarget = false;
                }
                this.lastTargetCheck = time;
            }

            this.updateContext();
            this.decide();
        }

        switch (this.currentState) {
            case BarrelStates.IDLE_LEFT: this.setFlipX(true); this.play('barrel-idle-anim', true); break;
            case BarrelStates.IDLE_RIGHT: this.setFlipX(false); this.play('barrel-idle-anim', true); break;
            case BarrelStates.RUN_LEFT: this.setFlipX(true); this.play('barrel-run-anim', true); break;
            case BarrelStates.RUN_RIGHT: this.setFlipX(false); this.play('barrel-run-anim', true); break;
            case BarrelStates.DEAD:
                if (!this.deathAnimStarted) {
                    this.deathAnimStarted = true; // Run this block only once.

                    // --- Setup logic that was in beginExplosionSequence ---
                    this.stopMoving(); // Ensure all movement is stopped.
                    // Disable the physics body, but keep the GameObject active so animations can play.
                    // The first argument `true` was setting `active = false`, which paused the animation.
                    this.disableBody(false, false);

                    if (this.scene.enemyArmy && this.scene.enemyArmy.barrels) {
                        this.scene.enemyArmy.barrels.remove(this);
                    }
                    this.scene.dyingEntities.add(this);

                    // Stop any current animation and play the standard death sequence.
                    this.anims.stop();
                    this.play('barrel-lit-anim', true);
                    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'barrel-lit-anim', () => {
                        // No delay as requested.
                        if (this.scene) { // Check scene exists before continuing
                            this.explode(); // Damage happens when the explosion starts.
                            this.play('barrel-explosion-anim', true);
                            this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'barrel-explosion-anim', () => {
                                this.destroy();
                            });
                        }
                    });
                }
                break;
        }
    }
}