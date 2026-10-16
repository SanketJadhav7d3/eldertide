import Entity from './playerEntity.js';

/**
 * Shared decision logic for the enemy units (Goblin, Bomber, Barrel).
 *
 * Enemies march toward `finalDestination`. On the way they engage whatever comes into sight;
 * once they reach the destination they go "rampaging" and hunt random player targets anywhere.
 *
 * Priority each frame:
 *   1. Attack if the target is in attack range.
 *   2. While marching, keep marching unless an interrupt applies (see canInterruptMarch()).
 *   3. Chase the target (if in sight, or rampaging).
 *   4. March to the final destination, or idle.
 *
 * Subclasses provide `attackTarget()` and may override `isTargetAttackable()`,
 * `canInterruptMarch()` and `onFinalDestinationReached()`.
 */
export default class EnemyUnit extends Entity {
  constructor(scene, x, y, texture, width, height, offsetX, offsetY, pathLayer, finder, grid) {
    super(scene, x, y, texture, width, height, offsetX, offsetY, pathLayer, finder, grid);

    this.context = {
      target: null,
      isTargetInRange: false,
      isTargetInAttackRange: false,
      isMovingToTarget: false, // True while marching to the final destination.
    };
    this.lastTargetCheck = 0;
    this.finalDestination = null;
    this.hasReachedDestination = false;
  }

  // --- Hooks ----------------------------------------------------------------------------

  /** Melee-style units attack inside their attack box; ranged units override this. */
  isTargetAttackable(target) {
    return this.isInAttackRange(target);
  }

  /** While marching, a target coming into sight normally makes the unit stop and engage. */
  canInterruptMarch() {
    return !!(this.context.target && this.context.isTargetInRange);
  }

  onFinalDestinationReached() {
    this.finalDestination = null;
    this.hasReachedDestination = true;
  }

  // --- Commands -------------------------------------------------------------------------

  /** A march order sets the flag that stops normal chasing, cleared on arrival. */
  moveToTile(tileX, tileY, grid, onCompleteCallback = null) {
    this.context.isMovingToTarget = true;
    super.moveToTile(tileX, tileY, grid, () => {
      this.context.isMovingToTarget = false;
      if (onCompleteCallback) onCompleteCallback();
    });
  }

  // --- Per-frame AI ---------------------------------------------------------------------

  runAI(time, playerArmy) {
    if (this.currentState === 'DEAD' || this.isDying) return;

    this.updateTargeting(time, playerArmy);
    this.updateContext();
    this.decide();
  }

  updateTargeting(time, playerArmy) {
    const ctx = this.context;

    // If the current target is dead/destroyed, look for a new one immediately.
    if (ctx.target && (ctx.target.health <= 0 || !ctx.target.active)) {
      ctx.target = null;
      this.lastTargetCheck = 0;
    }

    if (time > this.lastTargetCheck + 1000) {
      if (!ctx.target && playerArmy) {
        ctx.target = this.hasReachedDestination
          ? this.pickRandomTarget(playerArmy)
          : this.pickNearestTarget(playerArmy);
        // Found a target: we're no longer just marching to the destination.
        if (ctx.target) ctx.isMovingToTarget = false;
      }
      this.lastTargetCheck = time;
    }
  }

  /** The closest player unit in sight, otherwise the closest structure in sight. */
  pickNearestTarget(playerArmy) {
    const scene = this.scene;
    const units = [playerArmy.workers, playerArmy.warriors, playerArmy.archers, playerArmy.lancers];
    const structures = [scene.towers, scene.houses, scene.barracks, scene.archeries, scene.monasteries];
    if (scene.castle) structures.push(scene.castle);

    const { enemy: closestUnit } = this.findClosestEnemy(units);
    const { enemy: closestStructure } = this.findClosestEnemy(structures);
    return closestUnit || closestStructure;
  }

  /** Anywhere on the map: used once the unit has reached its destination. */
  pickRandomTarget(playerArmy) {
    const scene = this.scene;
    const all = [
      ...playerArmy.workers.getChildren(),
      ...playerArmy.warriors.getChildren(),
      ...playerArmy.archers.getChildren(),
      ...playerArmy.lancers.getChildren(),
      ...scene.towers.getChildren(),
      ...scene.houses.getChildren(),
      ...scene.barracks.getChildren(),
      ...scene.archeries.getChildren(),
      ...scene.monasteries.getChildren(),
    ];
    if (scene.castle && scene.castle.active) all.push(scene.castle);

    const candidates = all.filter(t => t.active && t.health > 0 && !this.isTargetIgnored(t));
    return candidates.length > 0 ? Phaser.Math.RND.pick(candidates) : null;
  }

  updateContext() {
    const ctx = this.context;
    if (!ctx.target || !ctx.target.active) {
      ctx.target = null;
      ctx.isTargetInAttackRange = false;
      ctx.isTargetInRange = false;
      return;
    }

    ctx.isTargetInAttackRange = this.isTargetAttackable(ctx.target);
    ctx.isTargetInRange = ctx.isTargetInAttackRange || this.isInRange(ctx.target);
  }

  decide() {
    const ctx = this.context;

    // 1. Attack.
    if (ctx.target && ctx.isTargetInAttackRange) {
      if (ctx.isMovingToTarget) {
        this.stopMoving();
        ctx.isMovingToTarget = false;
      }
      this.attackTarget();
      return;
    }

    // 2. Marching to the final destination.
    if (ctx.isMovingToTarget) {
      if (this.canInterruptMarch()) {
        this.stopMoving();
        ctx.isMovingToTarget = false;
      } else {
        return; // Keep marching.
      }
    }

    // 3. Chase: the target is in sight, or we are rampaging.
    if (ctx.target && (ctx.isTargetInRange || this.hasReachedDestination)) {
      // Don't plan a new step while the current one is still being walked.
      if (!this.moveTween || !this.moveTween.isPlaying()) {
        if (this.followEntity(ctx.target) === 'failed') this.abandonChase();
      }
      return;
    }

    // 4. No target: keep marching to the destination, or idle.
    if (this.finalDestination) {
      this.moveToTile(this.finalDestination.x, this.finalDestination.y, this.grid,
        () => this.onFinalDestinationReached());
    } else {
      this.goIdle();
    }
  }
}
