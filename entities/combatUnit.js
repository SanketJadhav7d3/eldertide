import Entity from './playerEntity.js';
import { Stances } from './states.js';

// How strongly each enemy group attracts attention (score = distance * weight, lower wins).
// Suicide units are the most urgent to stop, ranged units next.
export const THREAT_WEIGHTS = [
  ['barrels', 0.5],
  ['bombers', 0.7],
  ['goblins', 1],
];

// A target is only swapped for another if the new one scores this much better (hysteresis).
const RETARGET_THRESHOLD = 0.7;
// Once chasing an AI-acquired target, keep chasing until it leaves the sight box scaled by this.
const LEASH_SCALE = 1.5;
// How long a target we failed to reach is ignored.
const UNREACHABLE_IGNORE_MS = 4000;
// Standing next to a target for this long without being able to attack means we give up on it.
const ARRIVED_GIVE_UP_MS = 1500;

/**
 * Shared decision logic for the player's fighting units (Warrior, Lancer, Archer).
 *
 * Priority each frame:
 *   1. An explicit player move order is authoritative until the unit arrives.
 *   2. Attack the target if it is in attack range.
 *   3. Chase the target (player-ordered, or AI-acquired and still within the leash).
 *   4. Otherwise idle.
 *
 * Subclasses provide `attackTarget()` (one frame of attacking) and may override
 * `isTargetAttackable(target)`.
 */
export default class CombatUnit extends Entity {
  constructor(scene, x, y, texture, width, height, offsetX, offsetY, pathLayer, finder, grid) {
    super(scene, x, y, texture, width, height, offsetX, offsetY, pathLayer, finder, grid);

    this.context = {
      target: null,
      isTargetInRange: false,
      isTargetInAttackRange: false,
      isMovingToTarget: false, // True while following a player move order.
      isPlayerCommandedTarget: false, // True while following a player attack order.
    };

    this.lastTargetCheck = 0;
    this.targetCheckInterval = 1000;
    this.arrivedSince = 0;
    this.nextMoveWatchdog = 0;
    this.moveWatchdogMisses = 0;
  }

  // --- Commands -------------------------------------------------------------------------

  /** A move order cancels any engagement and is obeyed until arrival. */
  moveToTile(tileX, tileY, grid, onCompleteCallback = null) {
    if (this.isDead()) return;
    const ctx = this.context;
    ctx.target = null;
    ctx.isPlayerCommandedTarget = false;
    ctx.isMovingToTarget = true;
    this.moveWatchdogMisses = 0;

    super.moveToTile(tileX, tileY, grid, () => {
      ctx.isMovingToTarget = false;
      this.lastTargetCheck = 0; // Look for enemies as soon as we arrive.
      if (onCompleteCallback) onCompleteCallback();
    });
  }

  /** An attack order interrupts a move order in progress instead of waiting for arrival. */
  setTarget(enemy) {
    if (this.isDead()) return;
    this.stopMoving();
    this.context.isMovingToTarget = false;
    this.arrivedSince = 0;
    this.ignoredTargets.delete(enemy);
    super.setTarget(enemy);
  }

  protectEntity(entity) {
    const entityPos = entity.getPosTile();
    this.moveToTile(entityPos[0], entityPos[1] - 1, this.grid);
  }

  // --- Per-frame AI ---------------------------------------------------------------------

  runAI(time, enemyArmy) {
    if (this.currentState === 'DEAD') return;

    this.updateTargeting(time, enemyArmy);
    this.updateContext();
    this.decide();
    this.watchMoveOrder(time);
  }

  updateTargeting(time, enemyArmy) {
    const ctx = this.context;

    // Drop a dead or destroyed target immediately.
    if (ctx.target && (ctx.target.health <= 0 || !ctx.target.active)) {
      ctx.target = null;
      ctx.isPlayerCommandedTarget = false;
      this.lastTargetCheck = 0;
    }

    if (time > this.lastTargetCheck + this.targetCheckInterval) {
      this.lastTargetCheck = time;
      // Player orders (move or attack) are never overridden by automatic targeting.
      if (enemyArmy && !ctx.isPlayerCommandedTarget && !ctx.isMovingToTarget) {
        this.retarget(enemyArmy, time);
      }
    }
  }

  /** Picks the best enemy in sight, preferring threats, and only swaps when clearly better. */
  retarget(enemyArmy, time) {
    const ctx = this.context;

    // Forget expired entries and destroyed enemies so the map can't grow without bound.
    for (const [enemy, until] of this.ignoredTargets) {
      if (until <= time || !enemy.scene) this.ignoredTargets.delete(enemy);
    }
    const radius = this.rangeSize ? this.rangeSize / 2 : 500;

    let best = null;
    let bestScore = Infinity;
    let currentScore = Infinity;

    for (const [groupName, weight] of THREAT_WEIGHTS) {
      const group = enemyArmy[groupName];
      if (!group) continue;
      for (const enemy of group.getChildren()) {
        if (!enemy.active || enemy.health <= 0) continue;
        if (this.isTargetIgnored(enemy, time)) continue;
        const distance = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
        if (distance >= radius) continue;
        const score = distance * weight;
        if (enemy === ctx.target) currentScore = score;
        if (score < bestScore) {
          bestScore = score;
          best = enemy;
        }
      }
    }

    if (!best || best === ctx.target) return;
    if (!ctx.target || bestScore < currentScore * RETARGET_THRESHOLD) {
      ctx.target = best;
      ctx.isPlayerCommandedTarget = false;
      this.arrivedSince = 0;
    }
  }

  updateContext() {
    const ctx = this.context;
    const target = ctx.target;
    if (!target || !target.active || target.health <= 0) {
      ctx.target = null;
      ctx.isTargetInAttackRange = false;
      ctx.isTargetInRange = false;
      return;
    }

    ctx.isTargetInAttackRange = this.isTargetAttackable(target);
    // "In range" for chasing uses a wider leash so units don't flip-flop at the sight boundary.
    ctx.isTargetInRange = ctx.isTargetInAttackRange || this.isInRange(target, LEASH_SCALE);
  }

  /** Melee units attack inside their attack box; ranged units override this. */
  isTargetAttackable(target) {
    return this.isInAttackRange(target);
  }

  decide() {
    const ctx = this.context;

    // 1. A player move order wins over everything until the unit arrives.
    if (ctx.isMovingToTarget) return;

    // 2. Attack.
    if (ctx.target && ctx.isTargetInAttackRange) {
      this.arrivedSince = 0;
      this.attackTarget();
      return;
    }

    // 3. Chase.
    if (ctx.target) {
      const mayChase = ctx.isPlayerCommandedTarget ||
        (this.stance === Stances.AGGRESSIVE && ctx.isTargetInRange);
      if (mayChase) {
        this.chaseTarget();
        return;
      }
      ctx.target = null; // Defensive stance, or the target left the leash.
    }

    // 4. Idle.
    this.goIdle();
  }

  chaseTarget() {
    if (this.moveTween && this.moveTween.isPlaying()) return; // Still walking the current step.

    const result = this.followEntity(this.context.target);
    const now = this.scene.time.now;

    if (result === 'failed') {
      this.abandonTarget(now);
    } else if (result === 'arrived') {
      // On the destination tile but still not in attack range: don't stand there forever.
      if (!this.arrivedSince) this.arrivedSince = now;
      else if (now - this.arrivedSince > ARRIVED_GIVE_UP_MS) this.abandonTarget(now);
    } else {
      this.arrivedSince = 0;
    }
  }

  /** Gives up on an unreachable target and ignores it for a while so we don't retry every frame. */
  abandonTarget(now) {
    this.abandonChase(UNREACHABLE_IGNORE_MS);
    this.arrivedSince = 0;
    this.goIdle();
  }

  /**
   * Safety net: if a move order is flagged active but no tween is moving the unit for two
   * consecutive checks, the order was interrupted without finishing, so clear the flag
   * (otherwise the unit would ignore enemies forever).
   */
  watchMoveOrder(time) {
    const ctx = this.context;
    if (!ctx.isMovingToTarget) return;
    if (time < this.nextMoveWatchdog) return;
    this.nextMoveWatchdog = time + 1000;

    if (this.scene.tweens.getTweensOf(this).length === 0) {
      if (++this.moveWatchdogMisses >= 2) {
        ctx.isMovingToTarget = false;
        this.moveWatchdogMisses = 0;
      }
    } else {
      this.moveWatchdogMisses = 0;
    }
  }
}
