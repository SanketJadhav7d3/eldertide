
import EnemyUnit from './enemyUnit.js';
import { BarrelStates } from './states.js';
import { BALANCE } from '../balance.js';


export default class Barrel extends EnemyUnit {
    constructor(scene, x, y, width, height, offsetX, offsetY, pathLayer, finder, grid) {
        super(scene, x, y, 'barrel-entity', width, height, offsetX, offsetY, pathLayer, finder, grid);

        this.grid = grid;
        this.currentState = BarrelStates.IDLE_RIGHT;
        this.health = BALANCE.units.barrel.health;
        this.isDying = false; // Flag to ensure explosion sequence runs only once
        this.deathAnimStarted = false; // Flag to ensure the death animation runs only once.

        // The range at which the barrel will stop and light its fuse.
        this.createAttackRange(80);
        // The range at which it can see targets.
        this.createRange(600);

        // Explosion properties
        this.explosionDamage = BALANCE.units.barrel.explosionDamage;
        this.explosionRadius = 100;
        this.depthOffset = 26;
    }

    // The barrel's "attack" is lighting its fuse once the target is in reach.
    attackTarget() {
        this.stopMoving();
        this.context.isMovingToTarget = false;
        this.isDying = true;
        this.transitionStateTo(BarrelStates.DEAD);
    }

    // Barrels keep marching until their target is within reach (no stopping to engage).
    canInterruptMarch() {
        return false;
    }

    // Reaching the destination without finding anything to hit: just explode.
    onFinalDestinationReached() {
        this.isDying = true;
        this.transitionStateTo(BarrelStates.DEAD);
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

    update(time, delta, playerArmy) {
        super.update(time, delta);

        this.runAI(time, playerArmy);

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