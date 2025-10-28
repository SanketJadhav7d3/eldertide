//     ▄   ▄█ █    █    ██     ▄▀  ▄███▄
//      █  ██ █    █    █ █  ▄▀    █▀   ▀
// █     █ ██ █    █    █▄▄█ █ ▀▄  ██▄▄
//  █    █ ▐█ ███▄ ███▄ █  █ █   █ █▄   ▄▀
//   █  █   ▐     ▀    ▀   █  ███  ▀███▀
//    █▐                  █
//    ▐                  ▀
//    ▄▄▄▄▄   ▄█▄    ▄███▄      ▄   ▄███▄
//   █     ▀▄ █▀ ▀▄  █▀   ▀      █  █▀   ▀
// ▄  ▀▀▀▀▄   █   ▀  ██▄▄    ██   █ ██▄▄
//  ▀▄▄▄▄▀    █▄  ▄▀ █▄   ▄▀ █ █  █ █▄   ▄▀
//            ▀███▀  ▀███▀   █  █ █ ▀███▀
//                           █   ██

import Entity from './entities/playerEntity.js';
import Warrior from './entities/warriorEntity.js';
import Bomber from './entities/bomberEntity.js';
import Archer from './entities/archerEntity.js';
import Goblin from './entities/goblinEntity.js';
import GameLogic from './gameLogic.js';
import Worker from './entities/workerEntity.js';
import PlayerArmy from './entities/playerArmy.js';
import EnemyArmy from './entities/enemyArmy.js';
import Structure, { Tree, Tower, Castle, House, Towers } from './entities/structureEntity.js';
import { loadEntitySpriteSheet, createAnimations } from './animations/animations.js';

let cameraSpeed = 10;
var player;
var trees;
var cursors;
var castle;
var obstructions;
var houses;
var towers;
var playerArmy;
var gameLogic;
var enemyArmy;

export default class VillageScene extends Phaser.Scene {
  constructor() {
    super({ key: 'VillageScene' });
    this.selectedUnits = null;
  }

  preload() {
    // this means current scence
    this.load.image("water-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Water/Water.png");
    this.load.image("land-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Ground/Tilemap_Flat.png");
    this.load.image("elevation-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Ground/Tilemap_Elevation.png");
    this.load.image("bridge-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Bridge/Bridge_All.png");

    // castles
    this.load.image("castle-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Knights/Buildings/Castle/Castle_Blue.png");
    this.load.image("castle-construct-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Knights/Buildings/Castle/Castle_Construction.png");
    this.load.image("castle-destroyed-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Knights/Buildings/Castle/Castle_Destroyed.png");

    // towers
    this.load.image("tower-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Knights/Buildings/Tower/Tower_Blue.png");
    this.load.image("tower-construct-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Knights/Buildings/Tower/Tower_Construction.png");
    this.load.image("tower-destroyed-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Knights/Buildings/Tower/Tower_Destroyed.png");


    // house
    this.load.image("house-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Knights/Buildings/House/House_Blue.png");
    this.load.image("house-construct-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Knights/Buildings/House/House_Construction.png");
    this.load.image("house-destroyed-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Knights/Buildings/House/House_Destroyed.png");

    this.load.image("cursor-img", "./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/01.png");

    // deco
    this.load.image("deco-01-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/01.png");
    this.load.image("deco-16-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/16.png");
    this.load.image("deco-18-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/18.png");
    this.load.image("deco-02-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/02.png");
    this.load.image("deco-08-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/08.png");
    this.load.image("deco-09-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/09.png");
    this.load.image("deco-03-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/03.png");

    this.load.spritesheet("tree", "./Tiny Swords/Tiny Swords (Update 010)/Resources/Trees/Tree.png",
      { frameWidth: 64 * 3, frameHeight: 64 * 3});

    //           _   _ _                      _ _          _            _
    //   ___ _ _| |_(_) |_ _  _   ____ __ _ _(_) |_ ___ __| |_  ___ ___| |_ ___
    //  / -_) ' \  _| |  _| || | (_-< '_ \ '_| |  _/ -_|_-< ' \/ -_) -_)  _(_-<
    //  \___|_||_\__|_|\__|\_, | /__/ .__/_| |_|\__\___/__/_||_\___\___|\__/__/
    //                     |__/     |_|

    loadEntitySpriteSheet(this);
  }

  create() {
    this.selectedUnits = this.add.group();
    this.input.mouse.disableContextMenu();

    const map = this.make.tilemap({ key: "map"});
    const landTileset = map.addTilesetImage("land", "land-tiles");
    const pathLayer = map.createLayer("path", landTileset, 0, 0);
    pathLayer.setVisible(false);

    this.input.on('pointerdown', (pointer) => {
        if (pointer.leftButtonDown()) {
            this.isDragging = true;
            this.selectionRect.x = pointer.worldX;
            this.selectionRect.y = pointer.worldY;
        } else if (pointer.rightButtonDown()) {
            this.handleUnitMovement(pointer, pathLayer);
        }
    });

    this.input.on('pointermove', (pointer) => {
        if (!this.isDragging || !pointer.leftButtonDown()) return;

        this.selectionRect.width = pointer.worldX - this.selectionRect.x;
        this.selectionRect.height = pointer.worldY - this.selectionRect.y;

        this.drawSelectionRectangle();
    });

    this.input.on('pointerup', (pointer) => {
        if (pointer.leftButtonReleased()) {
            if (this.isDragging) {
                // Normalize the rectangle to handle negative width/height
                if (this.selectionRect.width < 0) {
                    this.selectionRect.x += this.selectionRect.width;
                    this.selectionRect.width *= -1;
                }
                if (this.selectionRect.height < 0) {
                    this.selectionRect.y += this.selectionRect.height;
                    this.selectionRect.height *= -1;
                }

                // Check if it was a drag or a click
                const dragThreshold = 5;
                if (this.selectionRect.width > dragThreshold || this.selectionRect.height > dragThreshold) {
                    this.handleUnitSelection(pointer, pathLayer, true); // Multi-selection
                } else {
                    this.handleUnitSelection(pointer, pathLayer, false); // Single-selection
                }
            }
            this.isDragging = false;
            this.graphics.clear();
            this.selectionRect.width = 0;
            this.selectionRect.height = 0;
        }
    });


    this.selectionRect = new Phaser.Geom.Rectangle(0, 0, 0, 0);
    this.isDragging = false;

    this.graphics = this.add.graphics();
    this.graphics.setDepth(10);


    // custom cursor
    var cursorImage = this.textures.get('cursor-img').getSourceImage();
    this.input.setDefaultCursor(`url(${cursorImage.src}), pointer`);

    // █    ██  ▀▄    ▄ ▄███▄   █▄▄▄▄   ▄▄▄▄▄
    // █    █ █   █  █  █▀   ▀  █  ▄▀  █     ▀▄
    // █    █▄▄█   ▀█   ██▄▄    █▀▀▌ ▄  ▀▀▀▀▄
    // ███▄ █  █   █    █▄   ▄▀ █  █  ▀▄▄▄▄▀
    //     ▀   █ ▄▀     ▀███▀     █
    //        █                  ▀
    //       ▀

    // parameters -- phaser tileset name (used in Tiled), image key in phaser cache
    const waterTileset = map.addTilesetImage("water", "water-tiles");
    
    const eleviationTileset = map.addTilesetImage("elevation", "elevation-tiles");
    const bridgeTileset = map.addTilesetImage("bridge", "bridge-tiles");

    const deco01Tileset = map.addTilesetImage("deco-01", "deco-01-tiles");
    const deco16Tileset = map.addTilesetImage("deco-16", "deco-16-tiles");
    const deco18Tileset = map.addTilesetImage("deco-18", "deco-18-tiles");
    const deco02Tileset = map.addTilesetImage("deco-2", "deco-02-tiles");
    const deco08Tileset = map.addTilesetImage("deco-8", "deco-08-tiles");
    const deco09Tileset = map.addTilesetImage("deco-9", "deco-09-tiles");
    const deco03Tileset = map.addTilesetImage("deco-3", "deco-03-tiles");

    // layername, tileset, pos
    const waterLayer = map.createLayer("water", waterTileset, 0, 0);
    const waterObstructionLayer = map.createLayer("water-obstruction", waterTileset, 0, 0);
    const sandLayer = map.createLayer("sand", landTileset, 0, 0);
    const elevationLayer1 = map.createLayer("elivation 1", eleviationTileset, 0, 0);

    const grassLayer1 = map.createLayer("grass 1", landTileset, 0, 0);


    const pathObstruction = map.createLayer("path-obstruction", landTileset, 0, 0);
    pathObstruction.setVisible(false);

    const grassVariationLayer1 = map.createLayer("grass variation 2", landTileset, 0, 0);
    //const elevationLayer2 = map.createLayer("elivation 2", eleviationTileset, 0, 0);
    //const grassLayer2 = map.createLayer("grass 2", landTileset, 0, 0);
    const bridgeLayer = map.createLayer("bridge", bridgeTileset, 0, 0);

    const decoLayer = map.createLayer("deco", [deco03Tileset, deco01Tileset, deco16Tileset,
      deco18Tileset, deco02Tileset, deco08Tileset, deco09Tileset], 0, 0);

    // █ ▄▄  ██     ▄▄▄▄▀ ▄  █     ▄████  ▄█    ▄   ██▄   ▄█    ▄     ▄▀
    // █   █ █ █ ▀▀▀ █   █   █     █▀   ▀ ██     █  █  █  ██     █  ▄▀
    // █▀▀▀  █▄▄█    █   ██▀▀█     █▀▀    ██ ██   █ █   █ ██ ██   █ █ ▀▄
    // █     █  █   █    █   █     █      ▐█ █ █  █ █  █  ▐█ █ █  █ █   █
    //  █       █  ▀        █       █      ▐ █  █ █ ███▀   ▐ █  █ █  ███
    //   ▀     █           ▀         ▀       █   ██          █   ██
    //        ▀

    var grid = new PF.Grid(map.width, map.height);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const pathTile = pathLayer.getTileAt(x, y);
        if (pathTile == null) grid.setWalkableAt(x, y, false);
        else grid.setWalkableAt(x, y, true);
      }
    }

    var finder = new PF.AStarFinder({
      allowDiagonal: true,
    });


    // ██      ▄   ▄█ █▀▄▀█ ██     ▄▄▄▄▀ ▄█ ████▄    ▄      ▄▄▄▄▄
    // █ █      █  ██ █ █ █ █ █ ▀▀▀ █    ██ █   █     █    █     ▀▄
    // █▄▄█ ██   █ ██ █ ▄ █ █▄▄█    █    ██ █   █ ██   █ ▄  ▀▀▀▀▄
    // █  █ █ █  █ ▐█ █   █ █  █   █     ▐█ ▀████ █ █  █  ▀▄▄▄▄▀
    //    █ █  █ █  ▐    █     █  ▀       ▐       █  █ █
    //   █  █   ██      ▀     █                   █   ██
    //  ▀                    ▀

    createAnimations(this);

    // ▄███▄      ▄     ▄▄▄▄▀ ▄█    ▄▄▄▄▀ ▀▄    ▄
    // █▀   ▀      █ ▀▀▀ █    ██ ▀▀▀ █      █  █
    // ██▄▄    ██   █    █    ██     █       ▀█
    // █▄   ▄▀ █ █  █   █     ▐█    █        █
    // ▀███▀   █  █ █  ▀       ▐   ▀       ▄▀
    //         █   ██
    //
    //    ▄▄▄▄▄   █ ▄▄  █▄▄▄▄ ▄█    ▄▄▄▄▀ ▄███▄     ▄▄▄▄▄
    //   █     ▀▄ █   █ █  ▄▀ ██ ▀▀▀ █    █▀   ▀   █     ▀▄
    // ▄  ▀▀▀▀▄   █▀▀▀  █▀▀▌  ██     █    ██▄▄   ▄  ▀▀▀▀▄
    //  ▀▄▄▄▄▀    █     █  █  ▐█    █     █▄   ▄▀ ▀▄▄▄▄▀
    //             █      █    ▐   ▀      ▀███▀
    //              ▀    ▀

    playerArmy = new PlayerArmy(this, pathLayer, finder, grid);
    enemyArmy = new EnemyArmy(this, pathLayer, finder, grid);

    const castlePoint = map.findObject("castle", obj => obj.name == "castle-point");
    castle = new Castle(this, castlePoint.x, castlePoint.y, 300, 150, 'castle-tiles');
    castle.depth = 1;

    const towersPoints = map.getObjectLayer("towers")['objects'];
    towers = new Towers(this, towersPoints);

    gameLogic = new GameLogic(this, castle, towers, playerArmy, enemyArmy);

    this.rocks02 = this.physics.add.group();
    const waterRockPoints02 = map.getObjectLayer("water-rocks-02")['objects'];

    waterRockPoints02.forEach(object => {
      let obj = this.rocks02.create(object.x, object.y, "water-rock-02");
      let delay = Phaser.Math.Between(0, 2000);
      this.time.delayedCall(delay, () => {
        obj.play('rock-anim-02');
        obj.setFlipX(true);
      }, [], this);
    });

    this.rocks03 = this.physics.add.group();
    const waterRockPoints03 = map.getObjectLayer("water-rocks-03")['objects'];

    waterRockPoints03.forEach(object => {
      let obj = this.rocks03.create(object.x, object.y, "water-rock-03");
      let delay = Phaser.Math.Between(0, 2000);
      this.time.delayedCall(delay, () => {
        obj.play('rock-anim-03');
      }, [], this);
    });

    obstructions = this.physics.add.staticGroup();
    const obstructionRects = map.getObjectLayer("obstructions")['objects'];

    obstructionRects.forEach(object => {
      let obj = obstructions.create(object.x + object.width / 2, object.y + object.height / 2, "transparent");
      obj.setOrigin(0, 0);
      obj.setSize(object.width, object.height);
      obj.setVisible(false);
    });

    houses = this.physics.add.staticGroup();
    const housesPoints = map.getObjectLayer("houses")['objects'];

    housesPoints.forEach(object => {
      let obj = new House(this, object.x, object.y, 100, 100, 'house-tiles');
      houses.add(obj);
    });

    trees = this.physics.add.group();
    const treesPoints = map.getObjectLayer("trees")['objects'];

    treesPoints.forEach(object => {
      let obj = new Tree(this, object.x, object.y, 35, 47, "tree");
      trees.add(obj);
      let delay = Phaser.Math.Between(0, 2000);
      obj.setImmovable(true);
      obj.setOffset(80, 120);
      playerArmy.warriors.children.iterate((child) => {
        obj.handleOverlapWith(child);
      });
      this.time.delayedCall(delay, () => {
        obj.play('wind');
      }, [], this);
    });

    const camera = this.cameras.main;
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    const cursors = this.input.keyboard.createCursorKeys();
    this.controls = new Phaser.Cameras.Controls.FixedKeyControl({
      camera: camera,
      left: cursors.left,
      right: cursors.right,
      up: cursors.up,
      down: cursors.down,
      speed: 0.5
    });

    const text = this.add.text(16, 16, "Arrow keys to scroll", {
        font: "18px monospace",
        fill: "#ffffff",
        padding: { x: 20, y: 10 },
        backgroundColor: "#000000",
      }).setScrollFactor(0);

    text.setDepth(100);
  }

  handleUnitSelection(pointer, pathLayer, isMultiSelect) {
    const isShiftKeyDown = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT).isDown;
    if (!isShiftKeyDown) {
      this.selectedUnits.clear();
    }

    const allPlayerUnits = [
        ...playerArmy.warriors.getChildren(),
        ...playerArmy.workers.getChildren(),
        ...playerArmy.archers.getChildren()
    ];

    if (isMultiSelect) { // Multi-unit selection
        const selected = allPlayerUnits.filter(unit => {
            const unitBounds = unit.getBounds();
            return Phaser.Geom.Intersects.RectangleToRectangle(this.selectionRect, unitBounds);
        });

        if (selected.length > 0) {
            selected.forEach(unit => {
                if (!this.selectedUnits.contains(unit)) {
                    this.selectedUnits.add(unit);
                }
            });
        }
    } else { // Single unit selection
        const clickedUnit = allPlayerUnits.find(unit => {
            const unitBounds = unit.getBounds();
            return Phaser.Geom.Rectangle.Contains(unitBounds, pointer.worldX, pointer.worldY);
        });

        if (clickedUnit) {
            if (this.selectedUnits.contains(clickedUnit)) {
                // If shift is pressed and unit is already selected, remove it
                if (isShiftKeyDown) {
                    this.selectedUnits.remove(clickedUnit);
                } 
            } else {
                this.selectedUnits.add(clickedUnit);
            }
        } else {
            if (!isShiftKeyDown) {
                this.selectedUnits.clear();
            }
        }
    }
  }

  handleUnitMovement(pointer, pathLayer) {

      const targetX = pathLayer.worldToTileX(pointer.worldX);
      const targetY = pathLayer.worldToTileY(pointer.worldY);

      console.log(targetX, targetY)

      const formationSize = Math.ceil(Math.sqrt(this.selectedUnits.getLength()));
      let unitIndex = 0;

      this.selectedUnits.getChildren().forEach(unit => {
          const offsetX = unitIndex % formationSize;
          const offsetY = Math.floor(unitIndex / formationSize);
          unit.moveToTile(targetX + offsetX, targetY + offsetY, unit.grid);
          unitIndex++;
      });
  }

  drawSelectionRectangle() {
    this.graphics.clear();
    this.graphics.lineStyle(2, 0x00ff00, 1);
    this.graphics.strokeRectShape(this.selectionRect);
  }

  update(time, delta) {
    this.controls.update(delta);
    gameLogic.update();

    houses.children.iterate((child) => {
      child.update();
    });

    // Visual feedback for selected units
    const allPlayerUnits = [
        ...playerArmy.warriors.getChildren(),
        ...playerArmy.workers.getChildren(),
        ...playerArmy.archers.getChildren()
    ];

    allPlayerUnits.forEach(unit => {
        if (this.selectedUnits.contains(unit)) {
            unit.setTint(0x00ff00); // Green tint for selected units
        } else {
            unit.clearTint();
        }
    });


    // Edge scrolling with pointer position
    const scrollMargin = 200;
    const x = this.input.mousePointer.x;
    const y = this.input.mousePointer.y;

    if (x < scrollMargin) {
      this.cameras.main.scrollX -= cameraSpeed;
    } else if (x > this.cameras.main.width - scrollMargin) {
      this.cameras.main.scrollX += cameraSpeed;
    }
    if (y < scrollMargin) {
      this.cameras.main.scrollY -= cameraSpeed;
    } else if (y > this.cameras.main.height - scrollMargin) {
      this.cameras.main.scrollY += cameraSpeed;
    }
  }
}