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
import InputController from './mouseController.js';
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
var inputController;

let isBuildingMode = false;
let buildingPlacementSprite = null;

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
    this.load.image("water-grass-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Ground/Tilemap_color1.png");


    // animated tile
    this.load.image("water-foam-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Water/Foam/Foam.png")
    this.load.image("water-rocks-tiles-01", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Water/Rocks/Rocks_01.png")
    this.load.image("water-rocks-tiles-02", "Tiny Swords/Tiny Swords (Update 010)/Terrain/Water/Rocks/Rocks_02.png")
    this.load.image("water-rocks-tiles-03", "Tiny Swords/Tiny Swords (Update 010)/Terrain/Water/Rocks/Rocks_03.png")
    this.load.image("water-rocks-tiles-04", "Tiny Swords/Tiny Swords (Update 010)/Terrain/Water/Rocks/Rocks_04.png")

    // castles
    this.load.image("castle-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Castle/Castle_Blue.png");
    this.load.image("castle-construct-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Castle/Castle_Construction.png");
    this.load.image("castle-destroyed-tiles", "Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Castle/Castle_Destroyed.png");

    // towers
    this.load.image("tower-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Tower/Tower_Blue.png");
    this.load.image("tower-construct-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Tower/Tower_Construction.png");
    this.load.image("tower-destroyed-tiles", "Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Tower/Tower_Destroyed.png");


    // house
    this.load.image("house-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/House/House_Blue.png");
    this.load.image("house-construct-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/House/House_Construction.png");
    this.load.image("house-destroyed-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/House/House_Destroyed.png");

    this.load.image("cursor-img", "./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/01.png");

    // deco
    this.load.image("deco-01-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/01.png");
    this.load.image("deco-02-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/02.png");
    this.load.image("deco-03-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/03.png");
    this.load.image("deco-04-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/04.png");
    this.load.image("deco-05-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/05.png");
    this.load.image("deco-06-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/06.png");
    this.load.image("deco-07-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/07.png");
    this.load.image("deco-08-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/08.png");
    this.load.image("deco-09-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/09.png");
    this.load.image("deco-10-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/10.png");
    this.load.image("deco-11-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/11.png");
    this.load.image("deco-12-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/12.png");
    this.load.image("deco-13-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/13.png");
    this.load.image("deco-14-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/14.png");
    this.load.image("deco-15-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/15.png");
    this.load.image("deco-16-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/16.png");
    this.load.image("deco-17-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/17.png");
    this.load.image("deco-18-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Deco/18.png");

    // selection area edges
    this.load.image("corner-tl", "./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/03.png")
    this.load.image('corner-tr', './Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/04.png')
    this.load.image('corner-bl', './Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/05.png')
    this.load.image('corner-br', './Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/06.png')

    this.load.spritesheet("tree", "./Tiny Swords/Tiny Swords (Update 010)/Resources/Trees/Tree.png",
      { frameWidth: 64 * 3, frameHeight: 64 * 3});

    // map
    this.load.tilemapTiledJSON("map", "./map.tmj");

    //           _   _ _                      _ _          _            _
    //   ___ _ _| |_(_) |_ _  _   ____ __ _ _(_) |_ ___ __| |_  ___ ___| |_ ___
    //  / -_) ' \  _| |  _| || | (_-< '_ \ '_| |  _/ -_|_-< ' \/ -_) -_)  _(_-<
    //  \___|_||_\__|_|\__|\_, | /__/ .__/_| |_|\__\___/__/_||_\___\___|\__/__/
    //                     |__/     |_|

    loadEntitySpriteSheet(this);
  }

  create() {
    // Launch the UI Scene in parallel
    this.scene.launch('UIScene');

    // Listen for UI events
    this.game.events.on('start-action', this.handleStartAction, this);


    this.selectedUnits = this.add.group();
    this.input.mouse.disableContextMenu();

    // camera
    this.cameras.main.setZoom(0.75);

    const map = this.make.tilemap({ key: "map", tileWidth: 64, tileHeight: 64});

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
    const landTileset = map.addTilesetImage("land-01", "land-tiles");
    const bridgeTileset = map.addTilesetImage("bridge", "bridge-tiles");
    const grassWaterTileset = map.addTilesetImage("land-water-01", "water-grass-tiles")

    // create deco tileset from 01 to 18
    //const deco01Tileset = map.addTilesetImage("deco_01", "deco-01-tiles");
    //const deco02Tileset = map.addTilesetImage("deco_02", "deco-02-tiles");
    const deco03Tileset = map.addTilesetImage("deco_03", "deco-03-tiles");
    //const deco04Tileset = map.addTilesetImage("deco_04", "deco-04-tiles");
    //const deco05Tileset = map.addTilesetImage("deco_05", "deco-05-tiles");
    //const deco06Tileset = map.addTilesetImage("deco_06", "deco-06-tiles");  
    //const deco07Tileset = map.addTilesetImage("deco_07", "deco-07-tiles");  
    //const deco08Tileset = map.addTilesetImage("deco_08", "deco-08-tiles");  
    const deco09Tileset = map.addTilesetImage("deco_09", "deco-09-tiles");
    //const deco10Tileset = map.addTilesetImage("deco_10", "deco-10-tiles");
    const deco11Tileset = map.addTilesetImage("deco_11", "deco-11-tiles");
    //const deco12Tileset = map.addTilesetImage("deco_12", "deco-12-tiles");
    const deco13Tileset = map.addTilesetImage("deco_13", "deco-13-tiles");
    //const deco14Tileset = map.addTilesetImage("deco_14", "deco-14-tiles");
    //const deco15Tileset = map.addTilesetImage("deco_15", "deco-15-tiles");    
    const deco16Tileset = map.addTilesetImage("deco_16", "deco-16-tiles");
    //const deco17Tileset = map.addTilesetImage("deco_17", "deco-17-tiles");
    const deco18Tileset = map.addTilesetImage("deco_18", "deco-18-tiles");

    // water foam tiles
    const waterFoamTileset = map.addTilesetImage("foam-animated", "water-foam-tiles");
    const rockWaterTileset01 = map.addTilesetImage("rock_water_1", "water-rocks-tiles-01");
    const rockWaterTileset02 = map.addTilesetImage("rock_water_02", "water-rocks-tiles-02");
    const rockWaterTileset03 = map.addTilesetImage("rock_water_03", "water-rocks-tiles-03");
    const rockWaterTileset04 = map.addTilesetImage("rock_water_04", "water-rocks-tiles-04");

    // layername, tileset, pos
    const waterLayer = map.createLayer("water-layer", waterTileset, 0, 0);    
    const waterFoamLayer = map.createLayer("water-foam", waterFoamTileset, 0, -128);
    const rockWaterLayer = map.createLayer(
      "water-stones",
      [rockWaterTileset01, rockWaterTileset02, rockWaterTileset03, rockWaterTileset04],
      0,
      -64
    );

    const landLayer = map.createLayer("land-layer", landTileset, 0, 0);

    const grassLayer = map.createLayer("grass-bridge-layer", [landTileset, bridgeTileset, grassWaterTileset], 0, 0);
    const decoLayer = map.createLayer(
      "deco-layer-1",
      [deco03Tileset, deco09Tileset, deco11Tileset, deco13Tileset, deco16Tileset, deco18Tileset], 
      0,
      0
    );

    // Set render order to ensure foam is on top of land
    map.setRenderOrder(['water-layer', 'land-layer', 'water-foam', 'grass-bridge-layer', 'deco-layer-1']);

    this.animatedTiles.init(map);

    // Slow down all tile animations to half speed.
    // You can change 0.5 to any value. < 1 is slower, > 1 is faster.
    this.animatedTiles.setRate(0.6);

    // █ ▄▄  ██     ▄▄▄▄▀ ▄  █     ▄████  ▄█    ▄   ██▄   ▄█    ▄     ▄▀
    // █   █ █ █ ▀▀▀ █   █   █     █▀   ▀ ██     █  █  █  ██     █  ▄▀
    // █▀▀▀  █▄▄█    █   ██▀▀█     █▀▀    ██ ██   █ █   █ ██ ██   █ █ ▀▄
    // █     █  █   █    █   █     █      ▐█ █ █  █ █  █  ▐█ █ █  █ █   █
    //  █       █  ▀        █       █      ▐ █  █ █ ███▀   ▐ █  █ █  ███ 
    //   ▀     █           ▀         ▀       █   ██          █   ██ 
    //        ▀ 

    var grid = new PF.Grid(landLayer.width / 64, landLayer.height / 64);

    for (let y = 0; y < landLayer.height / 64; y++) {
      for (let x = 0; x < landLayer.width / 64; x++) {
        // A tile is walkable if it exists on the land layer but not on the water layer.
        const landTile = landLayer.getTileAt(x, y);
        const grassTile = grassLayer.getTileAt(x, y);

        grid.setWalkableAt(x, y, (landTile || grassTile));
      }
    }

    var finder = new PF.AStarFinder({
      allowDiagonal: true,
    });

    this.pathLayer = landLayer; // used for world to tile conversions

    // Initialize the input controller
    inputController = new InputController(this);

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

    playerArmy = new PlayerArmy(this, this.pathLayer, finder, grid);
    enemyArmy = new EnemyArmy(this, this.pathLayer, finder, grid);

    // Castle will be created by the player now, so we can remove the hardcoded one.
    // castle = new Castle(this, 200, 200, 300, 150, 'castle-tiles');
    // castle.depth = 1;

    this.towers = this.add.group(); // This already exists
    this.houses = this.add.group();

    gameLogic = new GameLogic(this, null, null, playerArmy, enemyArmy);

    /*
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
    */
    
    this.cameras.main.setBounds(0, 0, landLayer.width, landLayer.height);
  }

  handleStartAction(details) {
    const { action, target } = details;

    if (action === 'build') {
      this.enterBuildMode(target);
    }
    // else if (action === 'gather') { ... } // Future logic for gathering
  }

  enterBuildMode(structureType) {
    if (['tower', 'house', 'castle'].includes(structureType)) {
      isBuildingMode = true;
      const texture = `${structureType}-tiles`;

      // Create a sprite to show where the building will be placed
      buildingPlacementSprite = this.add.sprite(0, 0, texture).setAlpha(0.5);
      buildingPlacementSprite.setOrigin(0.5, 0.5);
      
      // Listen for a click to place the building
      this.input.once('pointerdown', (pointer) => this.placeBuilding(pointer, structureType), this);
    }
  }

  placeBuilding(pointer, structureType) {
    if (!isBuildingMode) return;

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = this.pathLayer.worldToTileX(worldPoint.x);
    const tileY = this.pathLayer.worldToTileY(worldPoint.y);

    let newStructure = null;

    // Check if the location is valid (e.g., not on water)
    const tile = this.pathLayer.getTileAt(tileX, tileY);
    if (tile) { // Simple check, can be improved
      // Let the UI know the action has started so it can close the menu
      this.game.events.emit('action-started');

      if (structureType === 'tower') {
        // Create the tower in a "construction" state
        const newTower = new Tower(this, tile.getCenterX(), tile.getCenterY(), 100, 100);
        newTower.currentState = 'CONSTRUCT';
        this.towers.add(newTower);
        newStructure = newTower;
      } else if (structureType === 'house') {
        const newHouse = new House(this, tile.getCenterX(), tile.getCenterY(), 100, 100, 'house-construct-tiles');
        // newHouse.currentState = 'CONSTRUCT'; // Already set in constructor
        this.houses.add(newHouse);
        newStructure = newHouse;
      }
      else if (structureType === 'castle') {
        castle = new Castle(this, tile.getCenterX(), tile.getCenterY(), 300, 150, 'castle-construct-tiles');
        castle.depth = 1;
        newStructure = castle;
      }

      // Command selected workers to build
      this.selectedUnits.getChildren().forEach(worker => {
        if (worker.texture.key === 'worker-entity') {
          if (newStructure)
            worker.buildStructure(newStructure);
        }
      });
    }

    // Exit build mode
    isBuildingMode = false;
    if (buildingPlacementSprite) {
      buildingPlacementSprite.destroy();
      buildingPlacementSprite = null;
    }
  }
  handleUnitSelection(pointer, isMultiSelect) {
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
        const unitBody = unit.body;
        const unitBounds = new Phaser.Geom.Rectangle(unitBody.x, unitBody.y, unitBody.width, unitBody.height);
        return Phaser.Geom.Intersects.RectangleToRectangle(inputController.selectionRect, unitBounds);
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
        const unitBody = unit.body;
        const unitBounds = new Phaser.Geom.Rectangle(unitBody.x, unitBody.y, unitBody.width, unitBody.height);
        return unitBounds.contains(pointer.worldX, pointer.worldY);
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

    this.game.events.emit('selection-changed', this.selectedUnits.getChildren());
    console.log('selected units', this.selectedUnits.getChildren());
  }

  update(time, delta) {
    if (isBuildingMode && buildingPlacementSprite) {
      const worldPoint = this.cameras.main.getWorldPoint(this.input.x, this.input.y);
      buildingPlacementSprite.x = worldPoint.x;
      buildingPlacementSprite.y = worldPoint.y;
    }

    inputController.update(time, delta);

    gameLogic.update();

    this.houses.children.iterate((child) => {
      child.update(time, delta);
    });

    this.towers.children.iterate((child) => {
      child.update(time, delta);
    });

    if (castle) {
      castle.update(time, delta);
    }

    // Visual feedback for selected units
    const allPlayerUnits = [
      //...playerArmy.warriors.getChildren(),
      ...playerArmy.workers.getChildren(),
      //...player.archers.getChildren()
    ];

    allPlayerUnits.forEach(unit => {
      if (this.selectedUnits.contains(unit)) {
        unit.setTint(0x00ff00); // Green tint for selected units
      } else {
        unit.clearTint();
      }
    });
  }
}