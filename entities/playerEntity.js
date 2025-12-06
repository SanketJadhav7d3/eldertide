

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


export default class Entity extends Phaser.Physics.Arcade.Sprite {

  constructor(scene, x, y, width, height, offsetX, offsetY, texture, pathLayer, finder, grid) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);

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
    
    // this.setOffset(offsetX, offsetY);
    // this.setCollideWorldBounds(true);
    // this.body.setCollideWorldBounds(true);

    this.isFollowing = false;

    this.hasStarted = false;

    this.moveTween = null;
    this.posAround = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    this.posTaken = this.posAround[0];
  }

  isInAttackRange(enemy) {
    return this.scene.physics.world.overlap(this.attackRange, enemy);
  }

  isInRange(enemy) {
    return this.scene.physics.world.overlap(this.range, enemy);
  }

  createAttackRange(size) {
    let graphics = this.scene.add.graphics();
    graphics.fillStyle(0xFF0000, 0.0); // White color

    // Draw a square
    graphics.fillRect(0, 0, size, size);

    // Generate a texture from the graphics object
    graphics.generateTexture('attackSquareTexture', size, size);

    this.attackRange = this.scene.physics.add.sprite(this.x, this.y, 'attackSquareTexture');

    graphics.destroy();
  }

  createRange(size) {
    let graphics = this.scene.add.graphics();

    graphics.fillStyle(0x808080, 0.0); // Set alpha to 0.0 to make it invisible

    // Draw a square
    graphics.fillRect(0, 0, size, size);

    // Generate a texture from the graphics object
    graphics.generateTexture('squareTexture', size, size);

    this.range = this.scene.physics.add.sprite(this.x, this.y, 'squareTexture');

    graphics.destroy();
  }

  transitionStateTo(state) {
    this.currentState = state;
  }

  findClosestEnemy(enemyGroups) {
    let closestEnemy = null;
    let minDistance = Infinity;

    // Use the entity's sight 'range' as the maximum distance for detecting enemies.
    // The range sprite is a square, so we use half its width for a circular radius.
    const detectionRadius = this.range ? this.range.width / 2 : 500; // Default to 500 if no range is set

    // Ensure enemyGroups is an array
    if (!Array.isArray(enemyGroups)) {
      enemyGroups = [enemyGroups];
    }
    enemyGroups.forEach(group => {
      group.getChildren().forEach(enemy => {
        if (enemy.active && enemy.health > 0) {
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

  stopMoving() {
    // If the body is already disabled or destroyed, do nothing.
    if (!this.body) return;

    // Stop any active movement tweens for this entity
    this.scene.tweens.killTweensOf(this);

    this.setVelocity(0, 0);
    if (this.attackRange)
      this.attackRange.setVelocity(0, 0);
    if (this.range)
      this.range.setVelocity(0, 0);
  }

  /**
   * Updates the position of associated physics bodies (attackRange, range)
   * to match the entity's current position.
   * This method should be called in the update loop of derived classes.
   */
  updatePhysicsBodies() {
    if (this.attackRange) this.attackRange.setPosition(this.x, this.y);
    if (this.range) this.range.setPosition(this.x, this.y);
  }

  isMoving() {
    if (this.hasStarted && !this.hasReached) return true;
    return false;
  }

  moveToTile(tileX, tileY, grid, onCompleteCallback = null) {
    // Stop any current movement before starting a new one.
    this.stopMoving();

    // var playerTileX = this.pathLayer.worldToTileX(this.x);
    // var playerTileY = this.pathLayer.worldToTileX(this.y);

    var playerTileX = Math.floor(this.x / 32)
    var playerTileY = Math.floor(this.y / 32)

    var gridClone = grid.clone();

    var path = this.finder.findPath(playerTileX, playerTileY, tileX, tileY, gridClone);

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
    var gridClone = this.grid.clone();
    // choose position around
    let randomIndex = Math.floor(Math.random() * this.posAround.length);
    let randomElement = this.posAround[randomIndex];

    this.posTaken = randomElement;

    var path = this.finder.findPath(thisPos[0], thisPos[1], entityPos[0] + randomElement[0], 
      entityPos[1] + randomElement[1], gridClone);

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
      this.attackRange.setVelocity(0, 0);
      this.range.setVelocity(0, 0);
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
    this.attackRange.setVelocity(90 * dirX, 90 * dirY);
    this.range.setVelocity(90 * dirX, 90 * dirY);
  }

  followEntity(entity) {
    this.stopMoving();
  
    const targetTile = entity.getPosTile();
    const currentTile = this.getPosTile();
  
    // If we are already on an adjacent tile, we don't need to move further. Stop and let 'decide' take over.
    const distanceInTiles = Phaser.Math.Distance.Between(currentTile[0], currentTile[1], targetTile[0], targetTile[1]);
    if (distanceInTiles <= 1.5) { // Use 1.5 to account for diagonal adjacency
      // Stop moving and transition to IDLE. This prevents getting stuck in a RUN animation.
      // The 'decide' method will then correctly transition to ATTACK on the next frame if in range.
      this.stopMoving();
      if (entity.x > this.x) this.transitionStateTo(this.currentState.replace('RUN', 'IDLE'));
      else this.transitionStateTo(this.currentState.replace('RUN', 'IDLE'));

      return;
    }
  
    const gridClone = this.grid.clone();
    const path = this.finder.findPath(currentTile[0], currentTile[1], targetTile[0], targetTile[1], gridClone);
  
    // If there's no path or a very short path (we're already there), stop.
    if (!path || path.length < 2) {
      this.stopMoving();
      return;
    }
  
    // We only want to move one step at a time for responsive following.
    const nextNode = path[1];
    const targetX = nextNode[0] * 32 + 16; // Center of the 32x32 grid cell
    const targetY = nextNode[1] * 32 + 16; // Center of the 32x32 grid cell
  
    // Set animation based on the direction to the final target, not just the next tile.
    // This prevents the character from flipping back and forth.
    if (entity.x > this.x)
      this.transitionStateTo('RUN_RIGHT');
    else
      this.transitionStateTo('RUN_LEFT');
  
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
  }

  moveAlongPath(path, index, onCompleteCallback) {
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
