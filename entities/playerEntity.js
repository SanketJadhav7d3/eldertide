

// ▓█████  ███▄    █ ▄▄▄█████▓ ██▓▄▄▄█████▓ ██▓▓█████   ██████ 
// ▓█   ▀  ██ ▀█   █ ▓  ██▒ ▓▒▓██▒▓  ██▒ ▓▒▓██▒▓█   ▀ ▒██    ▒ 
// ▒███   ▓██  ▀█ ██▒▒ ▓██░ ▒░▒██▒▒ ▓██░ ▒░▒██▒▒███   ░ ▓██▄   
// ▒▓█  ▄ ▓██▒  ▐▌██▒░ ▓██▓ ░ ░██░░ ▓██▓ ░ ░██░▒▓█  ▄   ▒   ██▒
// ░▒████▒▒██░   ▓██░  ▒██▒ ░ ░██░  ▒██▒ ░ ░██░░▒████▒▒██████▒▒
// ░░ ▒░ ░░ ▒░   ▒ ▒   ▒ ░░   ░▓    ▒ ░░   ░▓  ░░ ▒░ ░▒ ▒▓▒ ▒ ░
//  ░ ░  ░░ ░░   ░ ▒░    ░     ▒ ░    ░     ▒ ░ ░ ░  ░░ ░▒  ░ ░
//    ░      ░   ░ ░   ░       ▒ ░  ░       ▒ ░   ░   ░  ░  ░  
//    ░  ░         ░           ░            ░     ░  ░      ░  
//

import { Stances } from './states.js';


// See Entity.applyAttackFrameDamage. 6 = updates per 10 FPS animation frame at 60 FPS.
const MELEE_HIT_SCALE = 6;

export default class Entity extends Phaser.Physics.Arcade.Sprite {

  constructor(scene, x, y, texture, width, height, offsetX, offsetY, pathLayer, finder, grid) {
    super(scene, x, y, texture); // Pass texture to the parent Sprite constructor
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Make the entity interactive so it can be selected by clicks and drag-selection.
    this.setInteractive(this.scene.input.makePixelPerfect());

    this.setScale(0.8); // Default scale
    // Initialize active state for all entities
    this.active = true; // All entities are targetable by default.

    this.pathLayer = pathLayer;
    this.currentState = null;

    this.finder = finder;

    this.body.setSize(width, height);
    //this.body.setOffset(offsetX, offsetY);

    this.grid = grid;
    this.path = []
    
    this.depthOffset = 21; // Default depth offset for player-like entities

    //this.body.setCollideWorldBounds(true);

    this.isFollowing = false;

    this.hasStarted = false;

    this.moveTween = null;
    this.posAround = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    this.posTaken = this.posAround[0];

    this.stance = Stances.AGGRESSIVE;
    this.ignoredTargets = new Map(); // targets we failed to reach -> time until which they're ignored
    this.formationPosition = null;

  }

  // Base update method for depth sorting
  update(time, delta) {
    // Corpses lie on the ground: above the tile layers (depth 0) but beneath living entities.
    if (this.currentState === 'DEAD') {
      this.setDepth(1);
      return;
    }

    // Dynamically set depth based on y-coordinate
    this.setDepth(this.y + this.depthOffset);

    // --- Debug line for depth sorting ---
    //if (this.scene.debugGraphics) {
      //this.scene.debugGraphics.lineStyle(1, 0xffff00, 1); // Yellow line, 1px thick
      //this.scene.debugGraphics.lineBetween(this.x - 30, this.y + this.depthOffset, this.x + 30, this.y + this.depthOffset);
    //}
  }

  // Range checks are plain box tests against the target's physics body (a square of `size`
  // centred on this entity), replacing two extra physics sprites per unit.
  isInAttackRange(enemy) {
    return this._isWithinBox(this.attackRangeSize, enemy);
  }

  // `scale` > 1 widens the box; used as a "leash" so units don't flip-flop at the sight boundary.
  isInRange(enemy, scale = 1) {
    return this._isWithinBox(this.rangeSize * scale, enemy);
  }

  _isWithinBox(size, enemy) {
    const body = enemy && enemy.body;
    if (!size || !body) return false;
    const half = size / 2;
    return body.right > this.x - half && body.x < this.x + half &&
           body.bottom > this.y - half && body.y < this.y + half;
  }

  createAttackRange(size) {
    this.attackRangeSize = size;
  }

  createRange(size) {
    this.rangeSize = size;
  }

  transitionStateTo(state) {
    // DEAD is terminal: nothing (stale tween, late callback, order) may revive a dead unit.
    if (this.currentState === 'DEAD' && state !== 'DEAD') return;
    this.currentState = state;
  }

  /** Stand still facing the way we last looked. */
  goIdle() {
    if (!this.currentState.startsWith('IDLE')) {
      this.stopMoving();
    }
    this.transitionStateTo(this.currentState.includes('LEFT') ? 'IDLE_LEFT' : 'IDLE_RIGHT');
  }

  /** Ignore `target` for `ms` milliseconds (used when it turned out to be unreachable). */
  ignoreTarget(target, ms) {
    if (target) this.ignoredTargets.set(target, this.scene.time.now + ms);
  }

  isTargetIgnored(target, now = this.scene.time.now) {
    const until = this.ignoredTargets.get(target);
    if (until === undefined) return false;
    if (until > now) return true;
    this.ignoredTargets.delete(target);
    return false;
  }

  /**
   * Gives up on the current target after a failed chase. The target is ignored for a while so
   * the unit doesn't retry (and re-run pathfinding) every frame.
   */
  abandonChase(ms = 4000) {
    this.ignoreTarget(this.context.target, ms);
    this.context.target = null;
    this.context.isPlayerCommandedTarget = false;
    this.stopMoving();
  }

  /**
   * Plays the shared two-part death animation once (call from the DEAD state).
   * The corpse stays for `corpseDelay` ms between the two animations, then is destroyed.
   */
  playDeathAnimation(corpseDelay = 2000) {
    if (!this.isDying) return; // Already started.
    this.isDying = false;
    this.anims.stop();
    this.play('dead-anim-1', true);
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'dead-anim-1', () => {
      this.scene.time.delayedCall(corpseDelay, () => {
        // A destroyed GameObject has its `scene` cleared.
        if (!this.scene) return;
        this.play('dead-anim-2', true);
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'dead-anim-2', () => this.destroy());
      });
    });
  }

  /**
   * The physics group this unit lives in while alive (e.g. scene.playerArmy.warriors).
   * Mortal unit subclasses override this to use the shared sustainDamage().
   */
  getArmyGroup() {
    return null;
  }

  /**
   * Shared damage + death handling for combat units: flash red, and on death stop moving,
   * switch to the DEAD state and move from the army group to the dying-entities group.
   */
  sustainDamage(amount) {
    if (this.isDying || this.currentState === 'DEAD') return;
    this.health -= amount;
    this.setTint(0xff0000);
    this.scene.time.delayedCall(200, () => this.restoreTint());

    if (this.health <= 0) {
      this.isDying = true;
      this.stopMoving(); // Immediately stop any movement tweens.
      this.transitionStateTo('DEAD');
      this.setDepth(1); // Corpses lie on the ground, beneath living entities.
      this.leaveSelection();

      const group = this.getArmyGroup();
      if (group) group.remove(this);
      this.scene.dyingEntities.add(this);
    }
  }

  // Restores the resting tint: green while selected, none otherwise.
  restoreTint() {
    if (!this.scene) return; // Destroyed while the flash timer was pending.
    if (this.isSelected) this.setTint(0x00ff00);
    else this.clearTint();
  }

  setSelected(selected) {
    this.isSelected = selected;
    this.restoreTint();
  }

  setStance(stance) {
    this.stance = stance;
  }

  /**
   * Applies melee damage once per attack-animation frame in `attackFrames`.
   *
   * The attack methods run every game update, but an animation frame lasts several updates, so
   * damage used to be applied on every update that landed on an attack frame (about 6 times per
   * swing at 60 FPS with 10 FPS animations, and more on faster displays). Now each attack frame
   * hits exactly once regardless of display refresh rate.
   *
   * MELEE_HIT_SCALE keeps the previous effective damage at 60 FPS: a swing's damage is
   * `damage * MELEE_HIT_SCALE`. Lower it to weaken every melee hit (player and enemy).
   */
  applyAttackFrameDamage(target, damage, attackFrames) {
    const currentFrame = this.anims.currentFrame;
    if (!target || !currentFrame) return;

    const frameNumber = parseInt(currentFrame.frame.name, 10);
    const tick = this.scene.game.loop.frame;

    // Same animation frame as the previous update of an uninterrupted attack: already handled.
    const isContinuing = this._lastAttackTick === tick || this._lastAttackTick === tick - 1;
    const isSameFrame = isContinuing && this._lastAttackFrame === frameNumber;
    this._lastAttackTick = tick;
    this._lastAttackFrame = frameNumber;
    if (isSameFrame) return;

    if (attackFrames.includes(frameNumber)) {
      target.sustainDamage(damage * MELEE_HIT_SCALE);
    }
  }

  /** True once the unit has started dying; dead units must ignore all further orders. */
  isDead() {
    return this.isDying || this.currentState === 'DEAD';
  }

  /** Dying units leave the player's selection so they can't receive orders. */
  leaveSelection() {
    const selected = this.scene.selectedUnits;
    if (selected && selected.contains(this)) {
      selected.remove(this);
      this.isSelected = false;
      this.scene.events.emit('selection-changed', selected.getChildren());
    }
  }

  setTarget(enemy) {
    if (this.isDead()) return;
    if (this.context) {
      this.context.target = enemy;
      this.context.isPlayerCommandedTarget = true;
      // The 'decide' method in subclasses will handle the logic for attacking/following.
    } else {
      console.warn("Entity does not have a 'context' object to set a target on.");
    }
  }

  setFormationPosition(x, y) {
    this.formationPosition = { x, y };
  }

  findClosestEnemy(enemyGroups) {
    let closestEnemy = null;
    let minDistance = Infinity;

    // Use the entity's sight 'range' as the maximum distance for detecting enemies.
    // The range sprite is a square, so we use half its width for a circular radius.
    const detectionRadius = this.rangeSize ? this.rangeSize / 2 : 500;

    // Ensure enemyGroups is an array
    if (!Array.isArray(enemyGroups)) {
      enemyGroups = [enemyGroups];
    }
    enemyGroups.forEach(group => {
      // Accepts physics groups as well as single game objects (e.g. the castle).
      const candidates = typeof group.getChildren === 'function' ? group.getChildren() : [group];
      candidates.forEach(enemy => {
        if (enemy.active && enemy.health > 0 && !this.isTargetIgnored(enemy)) {
          const distance = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
          // Only consider enemies within the detection radius
          if (distance < detectionRadius && distance < minDistance) {
            minDistance = distance;
            closestEnemy = enemy;
          }
        }
      });
    });

    // Return the enemy and the distance, which can be useful
    return { enemy: closestEnemy, distance: minDistance };
  }

  /**
   * Runs A* on a reusable scratch copy of the grid instead of cloning the whole grid per request.
   * The scratch grid is synced with the real grid's walkability and its search state is reset
   * before each search.
   */
  findPath(startX, startY, endX, endY, grid = this.grid) {
    // Out-of-grid start: nothing sensible to do (PF would throw).
    if (startX < 0 || startY < 0 || startX >= grid.width || startY >= grid.height) return [];

    // Clamp the destination to the grid, then snap it to the nearest walkable tile if blocked.
    // Searching toward an unreachable tile floods the whole map and finds nothing.
    endX = Phaser.Math.Clamp(endX, 0, grid.width - 1);
    endY = Phaser.Math.Clamp(endY, 0, grid.height - 1);
    if (!grid.isWalkableAt(endX, endY)) {
      const snapped = this.findNearestWalkableTile(grid, endX, endY, 6);
      if (!snapped) return [];
      endX = snapped.x;
      endY = snapped.y;
    }

    let scratch = grid._scratchGrid;
    if (!scratch) {
      scratch = grid._scratchGrid = grid.clone();
    }
    const src = grid.nodes;
    const dst = scratch.nodes;
    for (let y = 0; y < grid.height; y++) {
      const srcRow = src[y];
      const dstRow = dst[y];
      for (let x = 0; x < grid.width; x++) {
        const node = dstRow[x];
        node.walkable = srcRow[x].walkable;
        node.g = node.f = node.h = node.parent = undefined;
        node.opened = node.closed = false;
      }
    }
    return this.finder.findPath(startX, startY, endX, endY, scratch);
  }

  findNearestWalkableTile(grid, tileX, tileY, maxRadius) {
    let best = null;
    let bestDist = Infinity;
    for (let dy = -maxRadius; dy <= maxRadius; dy++) {
      for (let dx = -maxRadius; dx <= maxRadius; dx++) {
        const x = tileX + dx;
        const y = tileY + dy;
        if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) continue;
        if (!grid.isWalkableAt(x, y)) continue;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          best = { x, y };
        }
      }
    }
    return best;
  }

  findWalkableAdjacentTile(targetEntity) {
    if (!targetEntity) return null;

    const targetTile = targetEntity.getPosTile();
    const [targetX, targetY] = targetTile;

    // If the target's own tile is walkable, it's the best destination.
    if (this.grid.isWalkableAt(targetX, targetY)) {
        return { x: targetX, y: targetY };
    }

    const adjacentOffsets = [
      { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
      { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 }
    ];

    let bestTile = null;
    let minDistance = Infinity;
    const attackerTile = this.getPosTile();

    for (const offset of adjacentOffsets) {
      const checkX = targetX + offset.x;
      const checkY = targetY + offset.y;

      if (this.grid.isWalkableAt(checkX, checkY)) {
        const distance = Phaser.Math.Distance.Between(attackerTile[0], attackerTile[1], checkX, checkY);
        if (distance < minDistance) {
          minDistance = distance;
          bestTile = { x: checkX, y: checkY };
        }
      }
    }
    return bestTile;
  }

  stopMoving() {
    // If the body is already disabled or destroyed, do nothing.
    if (!this.body) return;

    // Stop any active movement tweens for this entity
    this.scene.tweens.killTweensOf(this);

    this.setVelocity(0, 0);
  }

  // Kept for existing callers; range checks use this entity's position directly.
  updatePhysicsBodies() {}

  isMoving() {
    if (this.hasStarted && !this.hasReached) return true;
    return false;
  }

  moveToTile(tileX, tileY, grid, onCompleteCallback = null) {
    if (this.isDead()) return;
    // Stop any current movement before starting a new one.
    this.stopMoving();

    // A manual move command clears any player-commanded target.
    if (this.context && this.context.isPlayerCommandedTarget) {
      this.context.isPlayerCommandedTarget = false;
      this.context.target = null; // Also clear the target itself
    }

    // var playerTileX = this.pathLayer.worldToTileX(this.x);
    // var playerTileY = this.pathLayer.worldToTileX(this.y);

    var playerTileX = Math.floor(this.x / 32)
    var playerTileY = Math.floor(this.y / 32)

    var path = this.findPath(playerTileX, playerTileY, tileX, tileY, grid);

    this.hasStarted = true;
    this.hasReached = false;

    this.moveAlongPath(path, 0, onCompleteCallback);
  }


  getPosTile() {
    // var playerTileX = this.pathLayer.worldToTileX(this.x);
    // var playerTileY = this.pathLayer.worldToTileX(this.y);
    var playerTileX = Math.floor(this.x / 32)
    var playerTileY = Math.floor(this.y / 32)


    return [playerTileX, playerTileY];
  }

  followMouse(mouseX, mouseY) {
    // find path to the entity
    // move the second tile 
    // recalculate the path

    var entityPos = [mouseX, mouseY];
    var thisPos = this.getPosTile();
    // choose position around
    let randomIndex = Math.floor(Math.random() * this.posAround.length);
    let randomElement = this.posAround[randomIndex];

    this.posTaken = randomElement;

    var path = this.findPath(thisPos[0], thisPos[1], entityPos[0] + randomElement[0], 
      entityPos[1] + randomElement[1]);

    var nextTileX;
    var nextTileY;

    // find index of next different location
    var i = 0;
    this.hasStarted = true;
    this.hasReached = false;

    // go to the next position
    if (path[1]) {
      nextTileX = path[1][0];
      nextTileY = path[1][1];
    } else {
      this.setVelocity(0, 0);
      this.stopMoving();
      return;
    }

    //for (i = 0; i < path.length; ++i) {
      //if (nextTileX != thisPos[0] || nextTileY != thisPos[1]) break;
    //} 

    const tile = this.pathLayer.getTileAt(nextTileX, nextTileY);

    const worldX = tile.getCenterX();
    const worldY = tile.getCenterY();
    
    // Play walking animation
    if (worldX > this.x)
      this.transitionStateTo('RUN_RIGHT');
    else
      this.transitionStateTo('RUN_LEFT');

    // calculate direction 
    var dirX = Math.sign(nextTileX - thisPos[0]);
    var dirY = Math.sign(nextTileY - thisPos[1]);
    this.setVelocity(90 * dirX, 90 * dirY);
  }

  /**
   * Takes one step toward `entity`. Returns 'moving', 'arrived' (already on the destination
   * tile) or 'failed' (no reachable tile/path), so callers can give up on unreachable targets.
   */
  followEntity(entity) {
    if (this.isDead()) return 'failed';
    this.stopMoving();

    const destinationTile = this.findWalkableAdjacentTile(entity);

    // If no valid destination can be found near the target, do nothing.
    // The AI will re-evaluate on the next frame.
    if (!destinationTile) {
      return 'failed';
    }

    const targetTile = [destinationTile.x, destinationTile.y];
    const currentTile = this.getPosTile();

    // If we are already on the destination tile, we don't need to move further.
    // Transition to IDLE so the next 'decide' call can transition to ATTACK if in range.
    if (currentTile[0] === targetTile[0] && currentTile[1] === targetTile[1]) {
      this.stopMoving();
      this.transitionStateTo(this.currentState.replace('RUN', 'IDLE'));
      return 'arrived';
    }

    const path = this.findPath(currentTile[0], currentTile[1], targetTile[0], targetTile[1]);

    // If there's no path or a very short path (we're already there), stop.
    if (!path || path.length < 2) {
      return 'failed';
    }

    // --- A valid path exists, so initiate movement ---

    // We only want to move one step at a time for responsive following.
    const nextNode = path[1];
    const targetX = nextNode[0] * 32 + 16; // Center of the 32x32 grid cell
    const targetY = nextNode[1] * 32 + 16; // Center of the 32x32 grid cell

    // Set animation based on the direction to the final target, not just the next tile.
    // This prevents the character from flipping back and forth.
    if (entity.x > this.x) {
      this.transitionStateTo('RUN_RIGHT');
    } else {
      this.transitionStateTo('RUN_LEFT');
    }

    const distance = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
    const duration = (distance / 100) * 1000; // Speed: 100 pixels per second

    // Use a tween for smooth, guaranteed movement to the next tile.
    this.moveTween = this.scene.tweens.add({
      targets: this,
      x: targetX,
      y: targetY,
      duration: duration,
      onComplete: () => {
        // The 'decide' loop will automatically call followEntity again on the next frame if needed.
      }
    });

    return 'moving';
  }

  moveAlongPath(path, index, onCompleteCallback) {
    // A stale tween chain must not move (or re-animate) a unit that has since died.
    if (this.isDead()) return;
    if (index >= path.length) {
        this.stopMoving();
        if (this.currentState.includes('LEFT')) {
            this.transitionStateTo(this.currentState.replace('RUN', 'IDLE'));
        } else {
            this.transitionStateTo(this.currentState.replace('RUN', 'IDLE'));
        }
        // If a callback was provided, execute it now.
        if (onCompleteCallback) {
            onCompleteCallback();
        }
        return;
    }

    const node = path[index];
    const targetX = node[0] * 32 + 16; // Center of the 32x32 grid cell
    const targetY = node[1] * 32 + 16; // Center of the 32x32 grid cell

    const distance = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
    const duration = (distance / 100) * 1000; // 100 pixels per second

    // Determine animation state based on movement direction
    if (targetX > this.x) {
        this.transitionStateTo('RUN_RIGHT');
    } else if (targetX < this.x) {
        this.transitionStateTo('RUN_LEFT');
    } else if (targetY !== this.y) {
        // If moving vertically, keep the last horizontal direction or default to right
        this.transitionStateTo(this.currentState.includes('LEFT') ? 'RUN_LEFT' : 'RUN_RIGHT');
    }

    this.scene.tweens.add({
        targets: this,
        x: targetX,
        y: targetY,
        duration: duration,
        onComplete: () => {
            // Pass the onCompleteCallback to the next step in the path
            this.moveAlongPath(path, index + 1, onCompleteCallback); 
        }
    });
  }
}
