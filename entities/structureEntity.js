
import Entity from './playerEntity.js'
import { StructureStates } from './states.js';
import Worker from './workerEntity.js';


export default class Structure extends Entity {
  constructor(scene, x, y, width, height, texture) {
    super(scene, x, y, width, height, texture);
    this.fullBodyBox = scene.physics.add.sprite(x, y, texture);
    this.fullBodyBox.setVisible(false);
    this.body.immovable = true;
    scene.physics.add.existing(this.fullBodyBox);
    this.depth = 1;
    this.visualOffset = 30;
    this.hasOverlapped = false;
    // this.attackRange.setVisible(false);
    this.assignedWorkers = new Set();
    this.setInteractive(this.scene.input.makePixelPerfect());


  }

  handleOverlapWith(otherEntity) {
    this.scene.physics.add.overlap(this.fullBodyBox, otherEntity, (entity1, entity2) => {this.onOverlap(entity1, entity2)}, 
      null, this.scene);
  }

  onOverlap(entity1, entity2) {
    // Logic to handle overlap between entity1 and entity2
    // 1 - structure
    // 2 - player sprite
    

    this.hasOverlapped = true;
    if (entity2.y < entity1.y + 50) {
      entity2.depth = 0;
    }
    else {
      entity2.depth = 2;
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
}

export class Tree extends Structure {
  constructor(scene, x, y, width, height, texture) {
    super(scene, x, y, width, height, texture);

    this.fullBodyBox.height = 200;
    this.fullBodyBox.width = 200;
  }
}

export class Castle extends Structure {
  constructor(scene, x, y, width, height, texture) {
    super(scene, x, y, width, height, texture);
    
    this.currentState = StructureStates.CONSTRUCT;
    this.buildProgress = 0;
    this.maxBuildProgress = 200; // Castles should take longer to build
    this.health = 400;
    this.setAlpha(0.5); // Start semi-transparent

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
    this.updateBuildProgress(delta);
    if (this.currentState == StructureStates.BUILT) {
      this.setTexture('castle-tiles');
      this.setAlpha(1);
    } else if (this.currentState == StructureStates.CONSTRUCT) {
      this.setTexture('castle-construct-tiles');
    } else if  (this.currentState == StructureStates.DESTROYED) {
      this.setTexture('castle-destroyed-tiles');
    }
  }
}

export class House extends Structure {
  constructor(scene, x, y, width, height, texture) {
    super(scene, x, y, width, height, texture);
    this.currentState = StructureStates.CONSTRUCT;
    this.buildProgress = 0;
    this.maxBuildProgress = 80; // Houses can be faster to build
    this.health = 80;
    this.setAlpha(0.5);

    this.on('pointerdown', (pointer) => {
      console.log('you clicked house');
    });
  }

  update(time, delta) {
    this.updateBuildProgress(delta);
    if (this.currentState == StructureStates.BUILT) {
      this.setTexture('house-tiles');
    } else if  (this.currentState == StructureStates.DESTROYED) {
      this.setTexture('house-destroyed-tiles');
    }
  }
}

export class Tower extends Structure {
  constructor(scene, x, y, width, height) {
    super(scene, x, y, width, height, 'tower-tiles');
    this.currentState = StructureStates.CONSTRUCT;
    this.visualOffset = 80;

    this.buildProgress = 0;
    this.maxBuildProgress = 100;
    this.setAlpha(0.5);

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

  update(time, delta, movingEntities) {
    this.updateBuildProgress(delta);
    let isOverlapping = false;
    if (movingEntities) {
        movingEntities.children.iterate((child) => {
            if (this.scene.physics.overlap(this.fullBodyBox, child)) {
                isOverlapping = true;
                if (child.y < this.y) {
                    child.setDepth(0);
                } else {
                    child.setDepth(2);
                }
            }
        });
    }

    if (isOverlapping) {
      this.setAlpha(0.5);
    } else {
      this.setAlpha(1);
    }

    if (this.currentState == StructureStates.BUILT) {
      this.setTexture('tower-tiles');
    } else if (this.currentState == StructureStates.CONSTRUCT) {
      this.setTexture('tower-construct-tiles');
    } else if  (this.currentState == StructureStates.DESTROYED) {
      this.setTexture('tower-destroyed-tiles');
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

  handleOverlapWithGroup(otherGroup) {
    this.towersGroup.children.iterate((tower) => {
      otherGroup.children.iterate((child) => {
        tower.handleOverlapWith(child);
      });
    });
  }

  update(warriorEntities, goblinEntities) {
    this.towersGroup.children.iterate((child) => {
      child.update(warriorEntities);
    });
  }
}
