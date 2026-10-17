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

// Guard order (all distances in px, measured from the edge of the guarded unit or building).
// Enemies this close to the ward are engaged.
const GUARD_RADIUS = 5 * 64;
// A guard never chases an enemy that is farther than this from the ward; it returns instead.
const GUARD_LEASH = 7 * 64;
// Guards check for threats more often than the normal once-a-second scan.
const GUARD_CHECK_INTERVAL_MS = 250;
// Enemies attacking the ward itself are preferred over closer ones by this factor.
const ATTACKING_WARD_WEIGHT = 0.3;
// Guards that fall this far (px) behind their spot walk faster until they catch up.
const GUARD_CATCH_UP_DISTANCE = 72;
const GUARD_CATCH_UP_SPEED = 135; // px/s; everyone else walks at 100
// Where guards stand around their ward (in 32px cells, beyond the ward's own extent).
const GUARD_SLOTS = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

/** The middle of an entity's body (a building's body sits low on its sprite, at its base). */
function centerOf(entity) {
  return entity.body ? entity.body.center : entity;
}

/** Half the size of a unit's or building's body, so distances are measured from its edge. */
function extentOf(entity) {
  const body = entity.body;
  return body ? Math.max(body.width, body.height) / 2 : 0;
}

/** False once a unit is dying or a building is destroyed. */
function isAlive(entity) {
  return entity.active && entity.health > 0 && !entity.isDying &&
    entity.currentState !== 'DEAD' && entity.currentState !== 'DESTROYED';
}

/**
 * Shared decision logic for the player's fighting units (Warrior, Lancer, Archer).
 *
 * Orders: move, attack (a chosen enemy), attack-move (walk somewhere, fighting whatever is met on
 * the way) and guard (stay with a friendly unit or building and fight off whatever threatens it).
 *
 * Priority each frame:
 *   1. An explicit player move order is authoritative until the unit arrives.
 *   2. Attack the target if it is in attack range.
 *   3. Chase the target (player-ordered, or AI-acquired and still within the leash).
 *   4. Guarding: return to the ward. Attack-moving: keep walking to the destination.
 *   5. Otherwise idle.
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
      guardTarget: null, // The friendly unit or building being guarded.
      guardSlot: 0, // Index into GUARD_SLOTS, so several guards spread around their ward.
      attackMoveDestination: null, // {x, y} in 32px cells while attack-moving.
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
    this.clearStandingOrders();
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
    this.clearStandingOrders();
    this.context.isMovingToTarget = false;
    this.arrivedSince = 0;
    this.ignoredTargets.delete(enemy);
    super.setTarget(enemy);
  }

  /**
   * Guard order: stay next to `ward` (a friendly unit or building), follow it if it moves, and
   * fight enemies that come near it (those attacking it first). Guards never chase farther than
   * GUARD_LEASH from the ward. When the ward dies the guard stands its ground.
   * `slot` spreads several guards around the same ward.
   */
  guard(ward, slot = 0) {
    if (this.isDead() || !ward || ward === this) return;
    this.stopMoving();
    this.clearStandingOrders();
    Object.assign(this.context, {
      target: null,
      isPlayerCommandedTarget: false,
      isMovingToTarget: false,
      guardTarget: ward,
      guardSlot: slot % GUARD_SLOTS.length,
    });
    this.lastTargetCheck = 0; // Look for threats right away.
  }

  /** Attack-move order: walk to the cell, engaging any enemy met on the way, then hold there. */
  attackMoveToTile(tileX, tileY) {
    if (this.isDead()) return;
    this.stopMoving();
    this.clearStandingOrders();
    Object.assign(this.context, {
      target: null,
      isPlayerCommandedTarget: false,
      isMovingToTarget: false,
      attackMoveDestination: { x: tileX, y: tileY },
    });
    this.lastTargetCheck = 0;
  }

  /** Forgets guard and attack-move orders (every new order replaces them). */
  clearStandingOrders() {
    this.context.guardTarget = null;
    this.context.attackMoveDestination = null;
  }

  /** The order the unit is following: GUARD, ATTACK_MOVE, MOVE, ATTACK or IDLE. */
  get currentOrder() {
    const ctx = this.context;
    if (ctx.guardTarget) return 'GUARD';
    if (ctx.attackMoveDestination) return 'ATTACK_MOVE';
    if (ctx.isMovingToTarget) return 'MOVE';
    if (ctx.isPlayerCommandedTarget) return 'ATTACK';
    return 'IDLE';
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

    // A dead ward ends the guard order; the guard stands its ground.
    const ward = ctx.guardTarget;
    if (ward && !isAlive(ward)) ctx.guardTarget = null;
    // Guards don't follow an enemy beyond the leash; they go back to the ward instead.
    if (ctx.guardTarget && ctx.target &&
        Phaser.Math.Distance.BetweenPoints(centerOf(ward), ctx.target) > GUARD_LEASH + extentOf(ward)) {
      ctx.target = null;
    }

    const interval = ctx.guardTarget ? GUARD_CHECK_INTERVAL_MS : this.targetCheckInterval;
    if (time > this.lastTargetCheck + interval) {
      this.lastTargetCheck = time;
      // Player orders (move or attack) are never overridden by automatic targeting.
      if (enemyArmy && !ctx.isPlayerCommandedTarget && !ctx.isMovingToTarget) {
        this.retarget(enemyArmy, time);
      }
    }
  }

  /**
   * Picks the best enemy in sight, preferring threats, and only swaps when clearly better.
   * A guard instead looks around its ward and prefers enemies that are attacking the ward.
   */
  retarget(enemyArmy, time) {
    const ctx = this.context;

    // Forget expired entries and destroyed enemies so the map can't grow without bound.
    for (const [enemy, until] of this.ignoredTargets) {
      if (until <= time || !enemy.scene) this.ignoredTargets.delete(enemy);
    }
    const ward = ctx.guardTarget;
    const origin = ward ? centerOf(ward) : this;
    const radius = ward ? GUARD_RADIUS + extentOf(ward) : (this.rangeSize ? this.rangeSize / 2 : 500);

    let best = null;
    let bestScore = Infinity;
    let currentScore = Infinity;

    for (const [groupName, weight] of THREAT_WEIGHTS) {
      const group = enemyArmy[groupName];
      if (!group) continue;
      for (const enemy of group.getChildren()) {
        if (!enemy.active || enemy.health <= 0) continue;
        if (this.isTargetIgnored(enemy, time)) continue;
        const distance = Phaser.Math.Distance.Between(origin.x, origin.y, enemy.x, enemy.y);
        if (distance >= radius) continue;
        let score = distance * weight;
        if (ward && enemy.context?.target === ward) score *= ATTACKING_WARD_WEIGHT;
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

    // 3. Chase. Guards may chase anywhere within their leash around the ward (see updateTargeting).
    if (ctx.target) {
      const mayChase = ctx.isPlayerCommandedTarget || ctx.guardTarget ||
        (this.stance === Stances.AGGRESSIVE && ctx.isTargetInRange);
      if (mayChase) {
        this.chaseTarget();
        return;
      }
      ctx.target = null; // Defensive stance, or the target left the leash.
    }

    // 4. Standing orders.
    if (ctx.guardTarget) {
      this.returnToWard();
      return;
    }
    if (ctx.attackMoveDestination) {
      this.continueAttackMove();
      return;
    }

    // 5. Idle.
    this.goIdle();
  }

  /**
   * Walks to (and then waits at) this guard's spot next to its ward. The spot is worked out from
   * where the ward is now on every step, so a moving ward is followed; a guard that has fallen
   * behind walks faster until it has caught up.
   */
  returnToWard() {
    const ward = this.context.guardTarget;
    const center = centerOf(ward);
    const reach = Math.ceil(extentOf(ward) / 32) + 1;
    const [dx, dy] = GUARD_SLOTS[this.context.guardSlot];
    const post = this.findNearestWalkableTile(this.grid,
      Math.floor(center.x / 32) + dx * reach, Math.floor(center.y / 32) + dy * reach, 4);
    if (!post) {
      this.goIdle();
      return;
    }
    const behind = Phaser.Math.Distance.Between(this.x, this.y, post.x * 32 + 16, post.y * 32 + 16);
    const speed = behind > GUARD_CATCH_UP_DISTANCE ? GUARD_CATCH_UP_SPEED : 100;
    if (this.stepTowardTile(post.x, post.y, speed) !== 'moving') this.goIdle();
  }

  /** Keeps walking toward the attack-move destination; on arrival the order ends and the unit holds. */
  continueAttackMove() {
    const { x, y } = this.context.attackMoveDestination;
    if (this.stepTowardTile(x, y) === 'moving') return;
    this.context.attackMoveDestination = null;
    this.goIdle();
  }

  /**
   * Takes one cell-sized step toward a cell, so the unit can react between steps (retargeting runs
   * meanwhile). The path is reused while the unit stays on it and the destination is unchanged.
   * Returns 'moving', 'arrived' (no closer cell to go to) or 'failed' (no path).
   */
  stepTowardTile(tileX, tileY, speed = 100) {
    if (this.moveTween && this.moveTween.isPlaying()) return 'moving';

    const [cx, cy] = this.getPosTile();
    if (cx === tileX && cy === tileY) return 'arrived';

    const goal = `${tileX},${tileY}`;
    const here = this.stepPath?.[this.stepIndex];
    if (this.stepGoal !== goal || !here || here[0] !== cx || here[1] !== cy) {
      this.stepPath = this.findPath(cx, cy, tileX, tileY);
      this.stepIndex = 0;
      this.stepGoal = goal;
    }
    const next = this.stepPath[this.stepIndex + 1];
    if (!next) return this.stepPath.length ? 'arrived' : 'failed';
    this.stepIndex++;

    const targetX = next[0] * 32 + 16;
    const targetY = next[1] * 32 + 16;
    if (targetX > this.x) this.transitionStateTo('RUN_RIGHT');
    else if (targetX < this.x) this.transitionStateTo('RUN_LEFT');
    else this.transitionStateTo(this.currentState.includes('LEFT') ? 'RUN_LEFT' : 'RUN_RIGHT');

    const distance = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
    this.moveTween = this.scene.tweens.add({
      targets: this,
      x: targetX,
      y: targetY,
      duration: (distance / speed) * 1000, // px per second; 100 like every other move by default
    });
    return 'moving';
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
