
import Entity from './playerEntity.js'
import { StructureStates } from './states.js';


export default class Structure extends Entity {
  constructor(scene, x, y, texture, bodyWidth, bodyHeight, bodyOffsetY, textureMap = {}, cost = {}) {
    // The width and height passed to the parent Entity constructor are now for the physics body.
    super(scene, x, y, bodyWidth, bodyHeight, 0, bodyOffsetY, texture);

    // Structures should be active (targetable) from the moment they are placed.
    this.active = true;

    // Set the physics body size and offset based on the new parameters.
    this.body.setSize(bodyWidth, bodyHeight);
    this.body.setOffset(this.width / 2 - bodyWidth / 2, bodyOffsetY);
    this.body.immovable = true; // Make sure structures don't get pushed by units
    this.visualOffset = 30;
    this.assignedWorkers = new Set();
    this.setInteractive(this.scene.input.makePixelPerfect());
    this.textureMap = textureMap;
    this.cost = cost;

    this.depthOffset = 40;
  }

  // Base update method for depth sorting
  update(time, delta) {
    if (!this.active && this.currentState !== StructureStates.DESTROYED) return; // Prevent inactive structures from updating, but allow destroyed state to update texture

    // Dynamically set depth based on y-coordinate
    this.setDepth(this.y + this.depthOffset);
    this.updateBuildProgress(delta);
    this.updateTexture();

    // // Draw the physics body for debugging
    // if (this.scene.debugGraphics) {
    //   this.scene.debugGraphics.lineStyle(2, 0x00ff00, 1); // Green outline
    //   this.scene.debugGraphics.strokeRect(this.body.x, this.body.y, this.body.width, this.body.height);
    // }

    // --- Debug line for depth sorting ---
    if (this.scene.debugGraphics) {
      this.scene.debugGraphics.lineStyle(1, 0xffff00, 1); // Yellow line, 1px thick
      this.scene.debugGraphics.lineBetween(this.x - 60, this.y + this.depthOffset, this.x + 60, this.y + this.depthOffset);
    }
  }

  updateTexture() {
    if (!this.textureMap || Object.keys(this.textureMap).length === 0) return;

    const textureKey = this.textureMap[this.currentState];

    if (textureKey && this.texture.key !== textureKey) {
      this.setTexture(textureKey);
    }
  }



  addWorker(worker) {
    this.assignedWorkers.add(worker);
  }

  removeWorker(worker) {
    this.assignedWorkers.delete(worker);
  }

  updateBuildProgress(delta) {
    if (this.currentState !== StructureStates.CONSTRUCT || this.assignedWorkers.size === 0) {
      return;
    }

    // Each worker contributes to build progress over time
    this.buildProgress += this.assignedWorkers.size * 10 * (delta / 1000); // 10 points per second per worker

    if (this.buildProgress >= this.maxBuildProgress) {
      this.buildProgress = this.maxBuildProgress;
      this.currentState = StructureStates.BUILT;
      console.log(`${this.constructor.name} construction complete!`);
    }
  }

  flashRed() {
    this.setTint(0xff0000);
    this.scene.time.delayedCall(150, () => this.clearTint());
  }

  highlight() {
    // add a light blue tint here
    this.setTint(0x87cefa);
    this.scene.time.delayedCall(300, () => this.clearTint());
  }

  sustainDamage(amount) {
    // Prevent damage if the structure is already destroyed.
    // This allows damage during both CONSTRUCT and BUILT states.
    if (this.currentState === StructureStates.DESTROYED) return;

    this.health -= amount;
    this.setTint(0xff0000); // Use a red tint for a more visible "flash"
    this.scene.time.delayedCall(200, () => this.clearTint());

    if (this.health <= 0) {
      this.currentState = StructureStates.DESTROYED;
      this.active = false; // Mark as inactive for targeting
      this.body.enable = false; // No more collisions
    }
  }
}

export class Tree extends Structure {
  constructor(scene, x, y) {
    // Define the available tree types
    const treeTypes = [
      { texture: 'tree-cuttable', anim: 'cuttable-tree-idle-anim' },
      { texture: 'deco-tree-01', anim: 'deco-tree-01-idle-anim' },
      { texture: 'deco-tree-02', anim: 'deco-tree-02-idle-anim' },
      { texture: 'deco-tree-03', anim: 'deco-tree-03-idle-anim' },
      { texture: 'deco-tree-04', anim: 'deco-tree-04-idle-anim' }
    ];

    // Randomly select a tree type
    const selectedTreeType = Phaser.Math.RND.pick(treeTypes);

    // The physics body should be small, representing just the trunk.
    const bodyWidth = 32;
    const bodyHeight = 32;
    const bodyOffsetY = 0; // Position the body at the base of the large sprite.

    // We use the 'tree' texture loaded as a spritesheet.
    super(scene, x, y, selectedTreeType.texture, bodyWidth, bodyHeight, bodyOffsetY);

    // Trees are not built; they just exist.
    this.currentState = 'IDLE'; // A custom state for trees.
    this.health = 100; // Health for chopping.
    this.logHealthThreshold = 30; // Health at which the tree becomes a log.
    this.animationKey = selectedTreeType.anim; // Store the animation key
    this.setFrame(0); // Start with the first frame of the spritesheet.
    //this.setScale(0.8); // Adjust scale to fit the world.

    this.setOrigin(0.5, 1); // Set the origin to the bottom-center

    this.depthOffset = -32; // Use the base of the trunk for depth sorting.
    this.setInteractive(this.scene.input.makePixelPerfect());
    // The animation will be started with a delay from the scene.

    this.woodCollected = false; // Flag to ensure collection animation only triggers once.
    this.scene.load.image('wood-idle', './Tiny Swords/Tiny Swords (Update 010)/Resources/Resources/W_Idle.png')
  }

  sustainDamage(amount) {
    // Don't call super.sustainDamage() because we want to control the 'active' state differently.
    if (this.currentState === StructureStates.DESTROYED) return;

    this.health = Math.max(0, this.health - amount); // Ensure health doesn't go below 0
    this.flashRed();

    if (this.health <= 0) {
      this.currentState = StructureStates.DESTROYED;
      this.active = false; // Mark as inactive for harvesting.
      this.body.enable = false; // Disable collisions.
      this.destroy(); // Disappear immediately.
    } else if (this.health <= this.logHealthThreshold) {
      // If health is below the threshold but not zero, it becomes a log.
      this.currentState = 'CHOPPED';
    }
  }

  update(time, delta) {
    super.update(time, delta); // This will call the depth setting from the parent Structure

    // --- Debug line for depth sorting ---
    //if (this.scene.debugGraphics) {
      //this.scene.debugGraphics.lineStyle(1, 0xffff00, 1); // Yellow line, 1px thick
      //this.scene.debugGraphics.lineBetween(this.x - 60, this.y + this.depthOffset, this.x + 60, this.y + this.depthOffset);
    //}

    if (this.currentState === 'CHOPPED') {
      // When chopped, show the log pile animation and stop it at the last frame.
      if (this.anims.currentAnim?.key !== 'wood-spawn-anim') {
        this.play('wood-spawn-anim');
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.anims.stop());
      }
    } else if (this.currentState === 'IDLE') {
      this.play(this.animationKey, true);
    }
  }
}

export class Castle extends Structure {
  static COST = {
    wood: 400,
    gold: 250,
  };

  constructor(scene, x, y, width, height, texture) {
    // Make the physics body shorter than the sprite to allow units to walk behind it.
    const bodyWidth = 280;
    const bodyHeight = 100;
    const bodyOffsetY = 150; // Pushes the body down from the top of the sprite

    const textureMap = {
      [StructureStates.CONSTRUCT]: 'castle-construct-tiles',
      [StructureStates.BUILT]: 'castle-tiles',
      [StructureStates.DESTROYED]: 'castle-destroyed-tiles'
    };

    super(scene, x, y, texture, bodyWidth, bodyHeight, bodyOffsetY, textureMap, Castle.COST);
    this.currentState = StructureStates.CONSTRUCT;
    this.buildProgress = 0;
    this.maxBuildProgress = 200; // Castles should take longer to build
    this.health = 400;

    this.firePlace1 = this.scene.physics.add.sprite(x, y-85, 'fire');
    this.firePlace1.setDepth(2);
    this.firePlace1.setVisible(false);
    // this.firePlace1.play('fire-anim');

    this.firePlace2 = this.scene.physics.add.sprite(x-90, y-50, 'fire');
    this.firePlace2.setScale(0.8);
    this.firePlace2.setDepth(2);
    this.firePlace2.setVisible(false);
    // this.firePlace2.play('fire-anim');

    this.firePlace3 = this.scene.physics.add.sprite(x, y+80, 'fire');
    this.firePlace3.setScale(0.5);
    this.firePlace3.setDepth(2);
    this.firePlace3.setVisible(false);
    // this.firePlace3.play('fire-anim');

    this.firePlace4 = this.scene.physics.add.sprite(x+90, y, 'fire');
    this.firePlace4.setScale(0.5);
    this.firePlace4.setDepth(2);
    this.firePlace4.setVisible(false);
    // this.firePlace4.play('fire-anim');

    this.on('pointerdown', (pointer) => {
      console.log('you clicked castle');
    });

    this.depthOffset = 120;
  }

  update(time, delta) {
    super.update(time, delta); // Call base update for depth sorting
  }
}

export class House extends Structure {
  static COST = {
    wood: 50,
  };

  constructor(scene, x, y, width, height, texture) {
    // Define a smaller physics body for the house.
    const bodyWidth = 100;
    const bodyHeight = 80;
    const bodyOffsetY = 100;
    const textureMap = {
      [StructureStates.CONSTRUCT]: 'house-construct-tiles',
      [StructureStates.BUILT]: 'house-tiles',
      [StructureStates.DESTROYED]: 'house-destroyed-tiles'
    };
    super(scene, x, y, texture, bodyWidth, bodyHeight, bodyOffsetY, textureMap, House.COST);
    this.currentState = StructureStates.CONSTRUCT;
    this.buildProgress = 0;
    this.maxBuildProgress = 80; // Houses can be faster to build
    this.health = 80;

    this.on('pointerdown', (pointer) => {
      console.log('you clicked house');
    });
  }

  update(time, delta) {
    super.update(time, delta); // Call base update for depth sorting

    // --- Debug line for depth sorting ---
    //if (this.scene.debugGraphics) {
      //this.scene.debugGraphics.lineStyle(1, 0xffff00, 1); // Yellow line, 1px thick
      //this.scene.debugGraphics.lineBetween(this.x - 60, this.y + this.depthOffset, this.x + 60, this.y + this.depthOffset);
    //}
  }
}

export class Tower extends Structure {
  static COST = {
    wood: 75,
    gold: 50,
  };

  constructor(scene, x, y, width, height) {
    // Define a smaller physics body for the tower.
    const bodyWidth = 80;
    const bodyHeight = 50;
    const bodyOffsetY = 150;
    const textureMap = {
      [StructureStates.CONSTRUCT]: 'tower-construct-tiles',
      [StructureStates.BUILT]: 'tower-tiles',
      [StructureStates.DESTROYED]: 'tower-destroyed-tiles'
    };
    super(scene, x, y, 'tower-construct-tiles', bodyWidth, bodyHeight, bodyOffsetY, textureMap, Tower.COST);
    this.currentState = StructureStates.CONSTRUCT;
    this.visualOffset = 80;

    this.buildProgress = 0;
    this.maxBuildProgress = 100;

    this.health = 100;

    // array of warriors protecting the tower
    this.warriorsProtecting = [];

    this.firePlace1 = this.scene.physics.add.sprite(x, y-85, 'fire');
    this.firePlace1.setDepth(2);
    this.firePlace1.setVisible(false);
    //this.firePlace1.play('fire-anim');

    this.firePlace2 = this.scene.physics.add.sprite(x, y+80, 'fire');
    this.firePlace2.setScale(0.5);
    this.firePlace2.setDepth(2);
    this.firePlace2.setVisible(false);
    // this.firePlace2.play('fire-anim');
    this.on('pointerdown', (pointer) => {
      console.log('you clicked tower');
    });

    this.depthOffset = 120;
  }

  update(time, delta) {
    super.update(time, delta); // Call base update for depth sorting
  }
}

export class Barracks extends Structure {
  static COST = {
    wood: 120,
    gold: 0,
  };

  constructor(scene, x, y, width, height, texture) {
    // Define a smaller physics body for the barracks.
    const bodyWidth = 150;
    const bodyHeight = 80;
    const bodyOffsetY = 80;
    const textureMap = {
      [StructureStates.CONSTRUCT]: 'barracks-construct-tiles',
      [StructureStates.BUILT]: 'barracks-tiles',
      [StructureStates.DESTROYED]: 'barracks-destroyed-tiles'
    };
    super(scene, x, y, texture, bodyWidth, bodyHeight, bodyOffsetY, textureMap, Barracks.COST);
    this.currentState = StructureStates.CONSTRUCT;
    this.buildProgress = 0;
    this.maxBuildProgress = 120; // Slower than a house
    this.health = 150;
    this.setScale(1.2); // Increase the scale to make it larger

    this.on('pointerdown', (pointer) => {
      console.log('you clicked barracks');
    });
  }

  update(time, delta) {
    super.update(time, delta); // Call base update for depth sorting
  }
}

export class Archery extends Structure {
  static COST = {
    wood: 100,
    gold: 40,
  };

  constructor(scene, x, y, width, height, texture) {
    // Define a smaller physics body for the archery range.
    const bodyWidth = 150;
    const bodyHeight = 80;
    const bodyOffsetY = 80;
    const textureMap = {
      [StructureStates.CONSTRUCT]: 'archery-construct-tiles',
      [StructureStates.BUILT]: 'archery-tiles',
      [StructureStates.DESTROYED]: 'archery-destroyed-tiles'
    };
    super(scene, x, y, texture, bodyWidth, bodyHeight, bodyOffsetY, textureMap, Archery.COST);
    this.currentState = StructureStates.CONSTRUCT;
    this.buildProgress = 0;
    this.maxBuildProgress = 120; // Slower than a house
    this.health = 150;
    this.setScale(1.2); // Increase the scale to make it larger

    this.on('pointerdown', (pointer) => {
      console.log('you clicked archery');
    });
  }

  update(time, delta) {
    super.update(time, delta); // Call base update for depth sorting
  }
}

export class Monastery extends Structure {
  static COST = {
    wood: 80,
    gold: 100,
  };

  constructor(scene, x, y, width, height, texture) {
    // Define a smaller physics body for the monastery.
    const bodyWidth = 150;
    const bodyHeight = 80;
    const bodyOffsetY = 100;
    const textureMap = {
      [StructureStates.CONSTRUCT]: 'monastery-construct-tiles',
      [StructureStates.BUILT]: 'monastery-tiles',
      [StructureStates.DESTROYED]: 'monastery-destroyed-tiles'
    };
    super(scene, x, y, texture, bodyWidth, bodyHeight, bodyOffsetY, textureMap, Monastery.COST);
    this.currentState = StructureStates.CONSTRUCT;
    this.buildProgress = 0;
    this.maxBuildProgress = 150; // Even slower
    this.health = 180;

    this.on('pointerdown', (pointer) => {
      console.log('you clicked monastery');
    });
  }

  update(time, delta) {
    super.update(time, delta); // Call base update for depth sorting
  }
}

export class Towers {
  constructor(scene, towerPoints) {
    this.towerPoints = towerPoints;
    this.scene = scene;
    this.towersGroup = this.scene.physics.add.staticGroup();

    this.towerPoints.forEach(object => {

      let obj = new Tower(this.scene, object.x, object.y, 100, 100);

      // game logic 
      // playerArmy.warriors.children.iterate((child) => {
        // this.physics.add.collider(child, obj);
        // obj.handleOverlapWith(child);
      // });

      this.towersGroup.add(obj);
    });
  }

  update(time, delta) {
    this.towersGroup.children.iterate((child) => {
      child.update(time, delta);
    });
  }
}
