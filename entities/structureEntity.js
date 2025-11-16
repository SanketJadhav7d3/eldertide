
import Entity from './playerEntity.js'
import { StructureStates } from './states.js';
import Worker from './workerEntity.js';


export default class Structure extends Entity {
  constructor(scene, x, y, texture, bodyWidth, bodyHeight, bodyOffsetY) {
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
  }

  // Base update method for depth sorting
  update(time, delta) {
    if (!this.active && this.currentState !== StructureStates.DESTROYED) return; // Prevent inactive structures from updating, but allow destroyed state to update texture

    // Dynamically set depth based on y-coordinate
    this.setDepth(this.y);
    this.updateBuildProgress(delta);

    // // Draw the physics body for debugging
    // if (this.scene.debugGraphics) {
    //   this.scene.debugGraphics.lineStyle(2, 0x00ff00, 1); // Green outline
    //   this.scene.debugGraphics.strokeRect(this.body.x, this.body.y, this.body.width, this.body.height);
    // }
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
    // The physics body should be small, representing just the trunk.
    const bodyWidth = 32;
    const bodyHeight = 32;
    const bodyOffsetY = 120; // Position the body at the base of the large sprite.

    // We use the 'tree' texture loaded as a spritesheet.
    super(scene, x, y, 'tree', bodyWidth, bodyHeight, bodyOffsetY);

    // Trees are not built; they just exist.
    this.currentState = 'IDLE'; // A custom state for trees.
    this.health = 100; // Health for chopping.
    this.setFrame(0); // Start with the first frame of the spritesheet.
    this.setScale(0.8); // Adjust scale to fit the world.
    this.setDepth(this.y);

    this.play('tree-idle-anim');
  }
}

export class Castle extends Structure {
  constructor(scene, x, y, width, height, texture) {
    // Make the physics body shorter than the sprite to allow units to walk behind it.
    const bodyWidth = 280;
    const bodyHeight = 100;
    const bodyOffsetY = 150; // Pushes the body down from the top of the sprite
    super(scene, x, y, texture, bodyWidth, bodyHeight, bodyOffsetY);
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
  }

  update(time, delta) {
    super.update(time, delta); // Call base update for depth sorting

    if (this.currentState == StructureStates.BUILT) {
      if (this.texture.key !== 'castle-tiles')
      this.setTexture('castle-tiles');
    } else if (this.currentState == StructureStates.CONSTRUCT && this.texture.key !== 'castle-construct-tiles') {
      this.setTexture('castle-construct-tiles');
    } else if  (this.currentState == StructureStates.DESTROYED) {
      this.setTexture('castle-destroyed-tiles');
    }
  }
}

export class House extends Structure {
  constructor(scene, x, y, width, height, texture) {
    // Define a smaller physics body for the house.
    const bodyWidth = 100;
    const bodyHeight = 80;
    const bodyOffsetY = 100;
    super(scene, x, y, texture, bodyWidth, bodyHeight, bodyOffsetY);
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

    if (this.currentState == StructureStates.BUILT) {
      if (this.texture.key !== 'house-tiles')
      this.setTexture('house-tiles');
    } else if  (this.currentState == StructureStates.DESTROYED) {
      this.setTexture('house-destroyed-tiles');
    }
  }
}

export class Tower extends Structure {
  constructor(scene, x, y, width, height) {
    // Define a smaller physics body for the tower.
    const bodyWidth = 80;
    const bodyHeight = 50;
    const bodyOffsetY = 150;
    super(scene, x, y, 'tower-tiles', bodyWidth, bodyHeight, bodyOffsetY);
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
  }

  update(time, delta) {
    super.update(time, delta); // Call base update for depth sorting

    if (this.currentState == StructureStates.BUILT) {
      if (this.texture.key !== 'tower-tiles')
      this.setTexture('tower-tiles');
    } else if (this.currentState == StructureStates.CONSTRUCT && this.texture.key !== 'tower-construct-tiles') {
      this.setTexture('tower-construct-tiles');
    } else if  (this.currentState == StructureStates.DESTROYED) {
      this.setTexture('tower-destroyed-tiles');
        }
  }
}

export class Barracks extends Structure {
  constructor(scene, x, y, width, height, texture) {
    // Define a smaller physics body for the barracks.
    const bodyWidth = 150;
    const bodyHeight = 80;
    const bodyOffsetY = 80;
    super(scene, x, y, texture, bodyWidth, bodyHeight, bodyOffsetY);
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

    if (this.currentState == StructureStates.BUILT) {
      if (this.texture.key !== 'barracks-tiles')
      this.setTexture('barracks-tiles');
    } else if (this.currentState == StructureStates.CONSTRUCT && this.texture.key !== 'barracks-construct-tiles') {
      this.setTexture('barracks-construct-tiles'); // Show construction texture
    } else if (this.currentState == StructureStates.DESTROYED) {
      this.setTexture('barracks-destroyed-tiles');
    }
  }
}

export class Archery extends Structure {
  constructor(scene, x, y, width, height, texture) {
    // Define a smaller physics body for the archery range.
    const bodyWidth = 150;
    const bodyHeight = 80;
    const bodyOffsetY = 80;
    super(scene, x, y, texture, bodyWidth, bodyHeight, bodyOffsetY);
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

    if (this.currentState == StructureStates.BUILT) {
      if (this.texture.key !== 'archery-tiles')
      this.setTexture('archery-tiles');
    } else if (this.currentState == StructureStates.CONSTRUCT && this.texture.key !== 'archery-construct-tiles') {
      this.setTexture('archery-construct-tiles'); // Show construction texture
    } else if (this.currentState == StructureStates.DESTROYED) {
      this.setTexture('archery-destroyed-tiles');
    }
  }
}

export class Monastery extends Structure {
  constructor(scene, x, y, width, height, texture) {
    // Define a smaller physics body for the monastery.
    const bodyWidth = 150;
    const bodyHeight = 80;
    const bodyOffsetY = 100;
    super(scene, x, y, texture, bodyWidth, bodyHeight, bodyOffsetY);
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

    if (this.currentState == StructureStates.BUILT) {
      if (this.texture.key !== 'monastery-tiles')
      this.setTexture('monastery-tiles');
    } else if (this.currentState == StructureStates.CONSTRUCT && this.texture.key !== 'monastery-construct-tiles') {
      this.setTexture('monastery-construct-tiles'); // Show construction texture
    } else if (this.currentState == StructureStates.DESTROYED) {
      this.setTexture('monastery-destroyed-tiles');
    }
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
