

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

    this.setScale(0.8);

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

    graphics.fillStyle(0x808080, 0.1); // White color

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

  stopMoving() {
    // Stop any active movement tweens for this entity
    this.scene.tweens.killTweensOf(this);

    this.setVelocity(0, 0);
    if (this.attackRange)
      this.attackRange.setVelocity(0, 0);
    if (this.range)
      this.range.setVelocity(0, 0);
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

    var playerTileX = Math.floor(this.x / 64)
    var playerTileY = Math.floor(this.y / 64)

    var gridClone = grid.clone();

    var path = this.finder.findPath(playerTileX, playerTileY, tileX, tileY, gridClone);

    this.hasStarted = true;
    this.hasReached = false;

    this.moveAlongPath(path, 0, onCompleteCallback);
  }


  getPosTile() {
    // var playerTileX = this.pathLayer.worldToTileX(this.x);
    // var playerTileY = this.pathLayer.worldToTileX(this.y);
    var playerTileX = Math.floor(this.x / 64)
    var playerTileY = Math.floor(this.y / 64)


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
    // Stop any current movement before starting a new one.
    this.stopMoving();

    // find path to the entity

    // move the second tile 
    
    // recalculate the path

    var entityPos = entity.getPosTile();
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
    const targetX = node[0] * this.pathLayer.tilemap.tileWidth + this.pathLayer.tilemap.tileWidth / 2;
    const targetY = node[1] * this.pathLayer.tilemap.tileHeight + this.pathLayer.tilemap.tileHeight / 2;

    const distance = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
    const duration = (distance / 100) * 1000; // 100 pixels per second

    if (targetX > this.x) {
        this.transitionStateTo('RUN_RIGHT');
    } else if (targetX < this.x) {
        this.transitionStateTo('RUN_LEFT');
    }

    this.scene.tweens.add({
        targets: this,
        x: targetX,
        y: targetY,
        duration: duration,
        onComplete: () => {
            this.moveAlongPath(path, index + 1, onCompleteCallback);
        }
    });
  }
}
