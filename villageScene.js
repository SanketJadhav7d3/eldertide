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
import Sheep from './entities/sheepEntity.js';
import PlayerArmy from './entities/playerArmy.js';
import InputController from './mouseController.js'; 
import EnemyArmy from './entities/enemyArmy.js';
import Structure, { Tree, Tower, Castle, House, Towers, Barracks, Archery, Monastery, GoldMine } from './entities/structureEntity.js';
import WaveManager from './waveManager.js';
import ResourceManager from './entities/resourceManager.js';
import BuildManager from './entities/buildManager.js';
import { loadEntitySpriteSheet, createAnimations } from './animations/animations.js';

let cameraSpeed = 10;
var player;
var trees;
var cursors;
var castle;
var obstructions;
var houses;
var towers;
var barracks;
var archeries;
var monasteries;
var sheeps;
var goldMines;
var playerArmy;
var gameLogic;
var inputController;

let isBuildingMode = false;
let buildingPlacementSprite = null;

const structureConfig = {
  'tower': { class: Tower, group: 'towers', texture: 'tower-construct-tiles', args: [100, 100] },
  'house': { class: House, group: 'houses', texture: 'house-construct-tiles', args: [100, 100] },
  'castle': { class: Castle, group: null, texture: 'castle-construct-tiles', args: [300, 150] },
  'barracks': { class: Barracks, group: 'barracks', texture: 'barracks-construct-tiles', args: [100, 100] },
  'archery': { class: Archery, group: 'archeries', texture: 'archery-construct-tiles', args: [100, 100] },
  'monastery': { class: Monastery, group: 'monasteries', texture: 'monastery-construct-tiles', args: [100, 100] },
};

export default class VillageScene extends Phaser.Scene {
  constructor() {
    super({ key: 'VillageScene' });
    this.selectedUnits = null;

    // This will hold the reference to the currently active build listener
    this.currentBuildListener = null;
  }

  preload() {
    // All assets are now loaded in LoadingScene.js
  }

  create() {
    // Launch the UI Scene in parallel
    //this.scene.launch('UIScene');

    // Create and manage resources and building processes
    this.resourceManager = new ResourceManager();
    this.buildManager = new BuildManager(this, this.resourceManager);


    // Create a graphics object for debugging physics bodies
    this.debugGraphics = this.add.graphics().setDepth(100);

    // Listen for UI events
    this.game.events.on('start-action', this.handleStartAction, this);

    this.selectedUnits = this.add.group();
    this.input.mouse.disableContextMenu();

    // █    ██  ▀▄    ▄ ▄███▄   █▄▄▄▄   ▄▄▄▄▄
    // █    █ █   █  █  █▀   ▀  █  ▄▀  █     ▀▄
    // █    █▄▄█   ▀█   ██▄▄    █▀▀▌ ▄  ▀▀▀▀▄
    // ███▄ █  █   █    █▄   ▄▀ █  █  ▀▄▄▄▄▀
    //     ▀   █ ▄▀     ▀███▀     █
    //        █                  ▀
    //       ▀

    // camera
    this.cameras.main.setZoom(0.75);
    const map = this.make.tilemap({ key: "map", tileWidth: 64, tileHeight: 64});

    // parameters -- phaser tileset name (used in Tiled), image key in phaser cache
    const waterTileset = map.addTilesetImage("water", "water-tiles");
    const landTileset = map.addTilesetImage("land-01", "land-tiles");
    const bridgeTileset = map.addTilesetImage("bridge", "bridge-tiles");
    const grassWaterTileset = map.addTilesetImage("land-water-01", "water-grass-tiles");

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
    this.waterLayer = waterLayer; // Store reference for build checks
    const waterFoamLayer = map.createLayer("water-foam", waterFoamTileset, 0, -128);
    const rockWaterLayer = map.createLayer(
      "water-stones",
      [rockWaterTileset01, rockWaterTileset02, rockWaterTileset03, rockWaterTileset04],
      0,
      -64
    );

    const landLayer = map.createLayer("land-layer", landTileset, 0, 0);
    this.landLayer = landLayer; // Store reference for build checks

    const grassLayer = map.createLayer("grass-layer", landTileset, 0, 0);

    const elevatedGroundLayer = map.createLayer("elevated-ground-layer", grassWaterTileset, 0, 0);

    elevatedGroundLayer.setCollisionFromCollisionGroup();

    const bridgeLayer = map.createLayer("bridge-layer", bridgeTileset, 0, 0);

    const waterGrassLayer = map.createLayer("water-grass-layer", grassWaterTileset, 0, 0);

    this.grassLayer = grassLayer;

    const colliders = this.physics.add.staticGroup();

    const objects = map.getObjectLayer('collision-layer').objects;

    objects.forEach(obj => {
      const x = obj.x + obj.width / 2;
      const y = obj.y + obj.height / 2;

      // Invisible collision rectangle
      const collider = this.add.rectangle(x, y, obj.width, obj.height);
      collider.setOrigin(0.5);

      this.physics.add.existing(collider, true); // static body
      colliders.add(collider);
      console.log('collision box', x, y);
    });


    // Set render order to ensure foam is on top of land
    map.setRenderOrder(['water-layer', 'land-layer', 'water-foam', 'grass-bridge-layer']);

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

    var grid = new PF.Grid(landLayer.width / 32, landLayer.height / 32);
    this.grid = grid; // Store grid reference on the scene

    for (let y = 0; y < landLayer.height / 32; y++) {
      for (let x = 0; x < landLayer.width / 32; x++) {
        // A tile is walkable if it exists on the land layer but not on the water layer.
        // convert the x and y value back to 64,64 grid

        const sx = Math.floor(x / 2);
        const sy = Math.floor(y / 2);

        const landTile = landLayer.getTileAt(sx, sy);
        const grassTile = grassLayer.getTileAt(sx, sy);

        grid.setWalkableAt(x, y, (landTile || grassTile));
      }
    }

    for (let y = 0; y < landLayer.height / 32; y++) {
      for (let x = 0; x < landLayer.width / 32; x++) {
        // A tile is walkable if it exists on the land layer but not on the water layer.
        const sx = Math.floor(x / 2);
        const sy = Math.floor(y / 2);

        const bridgeTile = bridgeLayer.getTileAt(sx, sy);

        //grid.setWalkableAt(x, y, (bridgeLayer));
        if (bridgeTile && y-1 >= 0) {
          grid.setWalkableAt(x, y-1, true);
        }
      }
    }

    this.finder = new PF.AStarFinder({
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

    // Create tree animations

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

    this.playerArmy = new PlayerArmy(this, this.pathLayer, this.finder, grid);
    this.enemyArmy = new EnemyArmy(this, this.pathLayer, this.finder, grid);

    // Initialize the Wave Manager
    this.waveManager = new WaveManager(this, this.enemyArmy);

    // Castle will be created by the player now, so we can remove the hardcoded one.
    // castle = new Castle(this, 200, 200, 300, 150, 'castle-tiles');
    // castle.depth = 1;

    this.towers = this.add.group(); // This already exists
    this.trees = this.physics.add.staticGroup({ classType: Tree });

    // Spawn trees naturally on the map
    const treeSpawnProbability = 0.10; // 10% chance to spawn a tree on a valid tile
    for (let y = 0; y < this.landLayer.height; y++) {
      for (let x = 0; x < this.landLayer.width; x++) {
        const landTile = this.grassLayer.getTileAt(x, y);

        // A tile is valid for a tree if it's on land/grass and not occupied by another decoration.
        if (landTile) {
          if (Math.random() < treeSpawnProbability) {
            // Create a tree at the center of the tile
            const tree = new Tree(this, landTile.getCenterX(), landTile.getCenterY());
            this.trees.add(tree);
            // Add a random delay to the animation start to desynchronize them
            const delay = Phaser.Math.Between(0, 2000); // Random delay between 0 and 2 seconds
            this.time.delayedCall(delay, () => {
              if (tree.active) tree.play('cuttable-tree-idle-anim');
            });
            // Make the tile under the tree non-walkable for pathfinding.
            //grid.setWalkableAt(x, y, false);
          }
        }
      }
    }

    // Spawn decorations randomly
    this.decorations = this.physics.add.staticGroup();
    const decoSpawnProbability = 0.02; // 8% chance
    const decoTextures = [
        'deco-01-tiles', 'deco-02-tiles', 'deco-03-tiles', 
        'deco-04-tiles', 'deco-05-tiles', 'deco-06-tiles', 
        'deco-07-tiles', 'deco-08-tiles', 'deco-09-tiles',
        'deco-10-tiles', 'deco-11-tiles', 'deco-12-tiles',
        'deco-13-tiles', 'deco-14-tiles', 'deco-15-tiles'
    ];

    for (let y = 0; y < this.landLayer.height; y++) {
      for (let x = 0; x < this.landLayer.width; x++) {
        const landTile = this.grassLayer.getTileAt(x, y);
        // Check if tile is walkable (not water, not already occupied by a tree)
        if (landTile && grid.isWalkableAt(x, y)) { 
          if (Math.random() < decoSpawnProbability) {
            const randomTexture = Phaser.Math.RND.pick(decoTextures);
            const decoSprite = this.decorations.create(landTile.getCenterX(), landTile.getCenterY(), randomTexture);
            decoSprite.setDepth(decoSprite.y); // Set depth based on y-position
            decoSprite.setScale(0.8);
          }
        }
      }
    }

    this.houses = this.add.group();
    this.barracks = this.add.group();
    this.archeries = this.add.group();
    this.monasteries = this.add.group();
    this.sheeps = this.physics.add.staticGroup();
    this.goldMines = this.physics.add.staticGroup();

    // --- Randomly Spawn Gold Mines ---
    const goldMineSpawnProbability = 0.01; // 1% chance to spawn a mine on a valid tile
    for (let y = 0; y < this.grassLayer.height; y++) {
      for (let x = 0; x < this.grassLayer.width / 4; x++) {
        const grassTile = this.grassLayer.getTileAt(x, y);

        // A tile is valid if it's a grass tile and is currently walkable.
        if (grassTile && this.grid.isWalkableAt(x, y)) {
          if (Math.random() < goldMineSpawnProbability) {
            // Create a gold mine at the center of the tile
            const mine = new GoldMine(this, grassTile.getCenterX(), grassTile.getCenterY());
            this.goldMines.add(mine);

            // Make the tile under the mine non-walkable for pathfinding.
            // Note: GoldMine itself already blocks tiles via its constructor.
            // If the mine has a larger footprint, that logic should be in the GoldMine class.
            this.grid.setWalkableAt(x, y, false);
          }
        }
      }
    }


    // Spawn sheep in herds
    const herdLocations = [
      { x: 25, y: 25, count: 5 },
      { x: 80, y: 40, count: 4 },
      { x: 50, y: 80, count: 6 },
    ];

    herdLocations.forEach(herd => {
      for (let i = 0; i < herd.count; i++) {
        // Spawn sheep in a small radius around the herd center
        const offsetX = (Math.random() - 0.5) * 5;
        const offsetY = (Math.random() - 0.5) * 5;
        const sheepX = herd.x + offsetX;
        const sheepY = herd.y + offsetY;

        const tile = this.grassLayer.getTileAt(Math.floor(sheepX), Math.floor(sheepY));
        if (tile && this.grid.isWalkableAt(Math.floor(sheepX), Math.floor(sheepY))) {
          const sheep = new Sheep(this, tile.getCenterX(), tile.getCenterY());
          this.sheeps.add(sheep);
          // Make the tile under the sheep non-walkable
          //this.grid.setWalkableAt(Math.floor(sheepX), Math.floor(sheepY), false);
        }
      }
    });




    gameLogic = new GameLogic(this, null, null, this.playerArmy, this.enemyArmy);

    // Add colliders between player units and all structure groups
    const playerUnits = [
      this.playerArmy.workers,
      this.playerArmy.warriors,
      this.playerArmy.archers
    ];

    const structureGroups = [
      this.trees,
      this.houses,
      this.towers,
      this.barracks,
      this.archeries,
      this.monasteries,
      this.sheeps,
      this.goldMines
    ];

    playerUnits.forEach(unitGroup => {
      structureGroups.forEach(structureGroup => {
        this.physics.add.collider(unitGroup, structureGroup);
      });
      // Also collide with the castle if it exists
      if (castle) {
        this.physics.add.collider(unitGroup, castle);
      }
    });

    // --- Add colliders between different unit groups ---

    this.physics.add.collider(this.playerArmy.warriors, colliders);
    // 1. Player units vs Enemy units for physical collision
    //this.physics.add.collider(this.playerArmy.warriors, this.enemyArmy.goblins);
    //this.physics.add.collider(this.playerArmy.workers, this.enemyArmy.goblins);
    //this.physics.add.collider(this.playerArmy.archers, this.enemyArmy.goblins);

    // 2. Player units vs Player units (to prevent them from stacking on top of each other)
    //this.physics.add.collider(this.playerArmy.warriors, this.playerArmy.warriors);
    //this.physics.add.collider(this.playerArmy.workers, this.playerArmy.workers);
    //this.physics.add.collider(this.playerArmy.archers, this.playerArmy.archers);
    //this.physics.add.collider(this.playerArmy.warriors, this.playerArmy.workers);
    //this.physics.add.collider(this.playerArmy.warriors, this.playerArmy.archers);
    //this.physics.add.collider(this.playerArmy.workers, this.playerArmy.archers);

    // 3. Enemy units vs Enemy units
    //this.physics.add.collider(this.enemyArmy.goblins, this.enemyArmy.goblins);

    // Set up attack overlaps between player units and enemy goblins
    this.physics.add.overlap(
      this.playerArmy.warriors.getChildren().map(w => w.attackRange),
      this.enemyArmy.goblins
    );
    this.physics.add.overlap(
      this.playerArmy.warriors.getChildren().map(w => w.range),
      this.enemyArmy.goblins
    );

    // Set up attack overlaps for goblins against all player units
    // We must iterate and create an overlap for each group individually.
    const playerUnitGroups = [this.playerArmy.warriors, this.playerArmy.workers, this.playerArmy.archers];
    playerUnitGroups.forEach(group => {
      this.physics.add.overlap(this.enemyArmy.goblins.getChildren().map(g => g.attackRange), group);
      this.physics.add.overlap(this.enemyArmy.goblins.getChildren().map(g => g.range), group);
    });

    // Set up attack overlaps for goblins against all player structures
    // We must iterate and create an overlap for each group individually.
    const playerStructureGroups = [this.houses, this.towers, this.barracks, this.archeries, this.monasteries];
    playerStructureGroups.forEach(group => {
      this.physics.add.overlap(this.enemyArmy.goblins.getChildren().map(g => g.attackRange), group);
    });

    // Also add overlap for the castle if it exists
    if (castle) {
      this.physics.add.overlap(this.enemyArmy.goblins.getChildren().map(g => g.attackRange), castle);
      this.physics.add.overlap(this.enemyArmy.goblins.getChildren().map(g => g.range), castle); // This was a duplicate, but is fine.
    }

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
    
    this.cameras.main.setBounds(0, 0, 5568, landLayer.height);

    // Emit an event to let other scenes (like the UI) know that this scene is ready.
    // Emit the signal globally
    this.game.events.emit("village-scene-ready", {
      scene: this,
      resourceManager: this.resourceManager
    });
  }

  handleStartAction(details) {
    const { action, target } = details;

    if (action === 'build') {
      this.enterBuildMode(target);
    }
    // else if (action === 'gather') { ... } // Future logic for gathering
  }

  enterBuildMode(structureType) {
    // If we're already in build mode, exit it first to clean up listeners and sprites.
    if (isBuildingMode) {
      this.exitBuildMode();
    }

    // Ask the BuildManager to select the structure. It will check for resources.
    this.buildManager.selectStructure(structureType);

    // If the selection was successful, enter visual placement mode.
    if (this.buildManager.selectedStructure) {
      isBuildingMode = true;
      const config = structureConfig[structureType];
      const texture = config.texture;
      buildingPlacementSprite = this.add.sprite(0, 0, texture).setAlpha(0.5);
      buildingPlacementSprite.setData('structureType', structureType); // Store for drag-drop
      buildingPlacementSprite.setOrigin(0.5, 0.5);
      
      // Create a specific listener for this build action
      this.currentBuildListener = (pointer) => {
        this.placeBuilding(pointer, structureType);
      };

      this.input.on('pointerdown', this.currentBuildListener, this);
    }
    // If not successful, the BuildManager already logged the reason.
  }

  isPlacementValid(worldPoint) {
    const tileX = this.pathLayer.worldToTileX(worldPoint.x);
    const tileY = this.pathLayer.worldToTileY(worldPoint.y);

    // 1. Check if the location is on a valid land tile
    const landTile = this.landLayer.getTileAt(tileX, tileY);

    if (!landTile) {
      return false; // Not on land
    }

    // 2. Check if the tile is walkable in the pathfinding grid.
    // This check now covers trees and any other obstacles we might add.
    //if (!this.grid.isWalkableAt(tileX, tileY)) {
      //return false; // Blocked by an obstacle like a tree
    //}

    // All checks passed, placement is valid
    return true;
  }

  placeBuilding(pointer, structureType) {
    // If left-click is not used, do nothing. This prevents right-click from interfering.
    if (pointer.button !== 0) return;
    if (!isBuildingMode) return;

    // Stop the event from propagating to other listeners (like unit selection).
    // This is crucial to prevent units from being deselected on a failed build attempt.
    pointer.event.stopPropagation();

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);    
    if (this.isPlacementValid(worldPoint)) {
      // Let the UI know the action has started so it can close the menu
      this.game.events.emit('action-started');

      // Ask the BuildManager to place the structure. It will spend resources and create it.
      const newStructure = this.buildManager.placeStructure(worldPoint.x, worldPoint.y);

      if (newStructure) {
        const config = structureConfig[structureType];
        // Add the newly created structure to the correct group in the scene
        if (config.group) {
          this[config.group].add(newStructure);
        } else if (structureType === 'castle') {
          castle = newStructure; // Special handling for the single castle
        }

        // Command selected workers to build
        this.selectedUnits.getChildren().forEach(worker => {
          if (worker instanceof Worker) {
            worker.buildStructure(newStructure);
          }
        }
      );
      }

      // Exit build mode only on successful placement
      this.exitBuildMode();

    } else { 
      console.log("Cannot build here. Must be on a clear land tile."); 
      // Exit build mode on a failed attempt to reset the cursor.
      this.exitBuildMode();
    }
  }

  handleRightClick(pointer) {
    // This is where the right-click command logic is handled.
    const allStructures = [
      ...this.trees.getChildren(),
      ...this.houses.getChildren(),
      ...this.sheeps.getChildren(),
      ...this.goldMines.getChildren(),
      ...this.towers.getChildren(),
      ...this.barracks.getChildren(),
      ...this.archeries.getChildren(),
      ...this.monasteries.getChildren()
    ];
    if (castle) {
      allStructures.push(castle);
    }

    const clickedObjects = this.input.manager.hitTest(pointer, allStructures, this.cameras.main);

    // Check for incomplete structures first
    const clickedIncompleteStructure = clickedObjects.find(obj => obj instanceof Structure && obj.currentState === 'CONSTRUCT');
    if (clickedIncompleteStructure) {
      this.selectedUnits.getChildren().forEach(unit => {
        if (unit instanceof Worker) {
          unit.buildStructure(clickedIncompleteStructure);
        }
      });
      return; // Command issued, no need to do anything else.
    }

    // Then check for sheep
    const clickedSheep = clickedObjects.find(obj => obj instanceof Sheep);
    if (clickedSheep) {
      this.selectedUnits.getChildren().forEach(unit => {
        if (unit instanceof Worker) {
          unit.harvestMeat(clickedSheep);
        }
      });
      return; // Command issued, no need to do anything else.
    }

    // Then check for gold mines
    const clickedGoldMine = clickedObjects.find(obj => obj instanceof GoldMine);
    if (clickedGoldMine) {
      this.selectedUnits.getChildren().forEach(unit => {
        if (unit instanceof Worker) {
          unit.mineGold(clickedGoldMine);
        }
      });
      return; // Command issued, no need to do anything else.
    }


    // Then check for trees
    const clickedTree = clickedObjects.find(obj => obj instanceof Tree);
    if (clickedTree) {
      this.selectedUnits.getChildren().forEach(unit => {
        if (unit instanceof Worker) {
          unit.cutTree(clickedTree);
        }
      });
      return; // Command issued, no need to move.
    }

    // If not clicking a specific target, move the units.
    const units = this.selectedUnits.getChildren();
    const unitCount = units.length;

    if (unitCount === 0) return;

    const targetTileX = Math.floor(pointer.worldX / 32);
    const targetTileY = Math.floor(pointer.worldY / 32);

    if (unitCount === 1) {
      // If only one unit is selected, move it directly to the target.
      const unit = units[0];
      if (typeof unit.moveToTile === 'function') {
        unit.moveToTile(targetTileX, targetTileY, unit.grid);
      }
    } else {
      // For multiple units, calculate formation positions.
      const formationSize = Math.ceil(Math.sqrt(unitCount));
      const halfSize = Math.floor(formationSize / 2);

      units.forEach((unit, index) => {
        const row = Math.floor(index / formationSize);
        const col = index % formationSize;

        // Calculate offset from the center of the formation
        const offsetX = col - halfSize;
        const offsetY = row - halfSize;

        const destTileX = targetTileX + offsetX;
        const destTileY = targetTileY + offsetY;

        if (typeof unit.moveToTile === 'function') {
          unit.moveToTile(destTileX, destTileY, unit.grid);
        }
      });
    }

    this.createMoveToMarker(Math.floor(pointer.worldX / 32), Math.floor(pointer.worldY / 32));
  }

  exitBuildMode() {
    isBuildingMode = false;
    if (buildingPlacementSprite) {
      buildingPlacementSprite.destroy();
      buildingPlacementSprite = null;
    }
    // Crucially, remove the specific listener that was added.
    if (this.currentBuildListener) {
      this.input.off('pointerdown', this.currentBuildListener, this);
      this.currentBuildListener = null;
    }

  } 

  handleUnitSelection(pointer, isMultiSelect) {
    const isShiftKeyDown = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT).isDown;
    if (!isShiftKeyDown) {
      this.selectedUnits.clear();
    }
    const allPlayerUnits = [
      ...this.playerArmy.warriors.getChildren(), // This was already here, but let's ensure it's correct.
      ...this.playerArmy.workers.getChildren(),
      ...this.playerArmy.archers.getChildren()
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

    this.events.emit('selection-changed', this.selectedUnits.getChildren());
  }

  createMoveToMarker(tileX, tileY) {
    const worldX = tileX * 32 + 16;
    const worldY = tileY * 32 + 16;

    // Create a circle shape as a marker
    const radius = 25;
    const marker = this.add.circle(worldX, worldY, radius, 0x44AAFF, 0.8).setDepth(1);

    // Create a tween to make it pulse and fade out
    this.tweens.add({
      targets: marker,
      scale: 2,
      alpha: 0,
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        marker.destroy();
      }
    });
  }

  update(time, delta) {
    // Clear the debug graphics each frame before redrawing
    this.debugGraphics.clear();
    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

    if (isBuildingMode && buildingPlacementSprite) {
      buildingPlacementSprite.x = worldPoint.x;
      buildingPlacementSprite.y = worldPoint.y;

      // Tint the sprite based on placement validity
      if (this.isPlacementValid(worldPoint)) {
        buildingPlacementSprite.setTint(0x00ff00); // Green tint for valid placement
        this.input.manager.canvas.style.cursor = `url('./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/hammer-pointer-2.png') 5 5, auto`;
      } else {
        buildingPlacementSprite.setTint(0xff0000); // Red tint for invalid placement
        this.input.manager.canvas.style.cursor = `url('./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/01.png') 5 5, auto`;
      }
    }

    // Cursor hover logic
    // This logic runs when not in build mode and not panning with spacebar
    if (!isBuildingMode && !inputController.isPanning()) {
      const hasSelectedWorker = this.selectedUnits.getChildren().some(unit => unit instanceof Worker);

      // Default to the standard cursor style
      let cursorStyle = `url('./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/01.png') 5 5, auto`;

      const allStructures = [
        ...this.trees.getChildren(),
        ...this.houses.getChildren(),
        ...this.towers.getChildren(),
        ...this.barracks.getChildren(),
        ...this.archeries.getChildren(),
        ...this.sheeps.getChildren(),
        ...this.goldMines.getChildren(),
        ...this.monasteries.getChildren(),
        // Add other interactive objects here, like resources
      ];
      if (castle) {
        allStructures.push(castle);
      }

      const hoveredObjects = this.input.manager.hitTest(pointer, allStructures, this.cameras.main);
      const hoveredIncompleteStructure = hoveredObjects.find(obj => obj instanceof Structure && obj.currentState === 'CONSTRUCT');

      // If hovering over an incomplete structure AND a worker is selected, show the hammer.
      if (hoveredIncompleteStructure && hasSelectedWorker) {
        cursorStyle = `url('./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/hammer-pointer-2.png') 5 5, auto`;
      }
      this.input.manager.canvas.style.cursor = cursorStyle;
    }

    inputController.update(time, delta);

    gameLogic.update(time, delta);

    // Update the wave manager
    //this.waveManager.update(time, delta);

    this.houses.children.iterate((child) => {
      child.update(time, delta);
    });

    this.towers.children.iterate((child) => {
      child.update(time, delta);
    });

    this.barracks.children.iterate((child) => {
      child.update(time, delta);
    });

    this.archeries.children.iterate((child) => {
      child.update(time, delta);
    });

    this.monasteries.children.iterate((child) => {
      child.update(time, delta);
    });

    if (castle) {
      castle.update(time, delta);
    }

    this.trees.children.iterate((child) => {
      child.update(time, delta);
    });

    this.sheeps.children.iterate((child) => {
      child.update(time, delta);
    });

    this.goldMines.children.iterate((child) => {
      child.update(time, delta);
    });

    // Visual feedback for selected units
    const allPlayerUnits = [
      ...this.playerArmy.warriors.getChildren(),
      ...this.playerArmy.workers.getChildren(),
      ...this.playerArmy.archers.getChildren()
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