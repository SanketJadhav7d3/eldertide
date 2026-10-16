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
import { BALANCE } from './balance.js';

let cameraSpeed = 10;
var player;
var trees;
var cursors; // This is set by createCursorKeys, but it's better to be a scene property.
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

// Mouse cursors. All cursor changes go through VillageScene.setCursorStyle().
const CURSOR_DEFAULT = `url('./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/01.png') 5 5, auto`;
const CURSOR_HAMMER = `url('./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/hammer-pointer-2.png') 5 5, auto`;

export default class VillageScene extends Phaser.Scene {
  constructor() {
    super({ key: 'VillageScene' });
    this.isGameOver = false;
    this.selectedUnits = null;
    this.castle = null; // The player's main castle

    // This will hold the reference to the currently active build listener
    this.currentBuildListener = null;

    // Sheep population management
    this.sheepRespawnTimer = 0;
  }

  preload() {
    // All assets are now loaded in LoadingScene.js
  }

  create() {
    // Launch the UI Scene in parallel
    //this.scene.launch('UIScene');

    this.projectiles = this.physics.add.group();
    this.dyingEntities = this.add.group();
    // Create and manage resources and building processes
    this.resourceManager = new ResourceManager();
    this.buildManager = new BuildManager(this, this.resourceManager);

    this.bgmPlaylist = ['bgm-1', 'bgm-2'];
    this.currentBgmIndex = 0;
    this.playNextBgmTrack();

    // Create a graphics object for debugging physics bodies
    this.debugGraphics = this.add.graphics().setDepth(100);

    // Listen for wave events to control background music
    this.events.on('wave-started', () => {
      // Play the war bell on a loop to signal the attack
      this.warBell = this.sound.add('war-bell', { loop: true, volume: 0.3 });
      this.warBell.play();

      if (this.currentBgm && this.currentBgm.isPlaying) {
        this.tweens.add({
          targets: this.currentBgm,
          volume: 0,
          duration: 2000,
          onComplete: () => {
            if (this.currentBgm) this.currentBgm.stop();
          }
        });
      }
    });

    this.events.on('wave-finished', () => {
      if (this.warBell) this.warBell.stop();
      // When the wave is over, proceed to the next track in the playlist
      this.currentBgmIndex = (this.currentBgmIndex + 1) % this.bgmPlaylist.length;
      this.playNextBgmTrack();
    });

    // Listen for UI events
    this.game.events.on('start-action', this.handleStartAction, this);

    // Remove listeners on shutdown so a restart ("Play again") doesn't register them twice.
    isBuildingMode = false;
    buildingPlacementSprite = null;
    this.currentCursor = null; // The scene object is reused on restart; forget the cached cursor.
    this.events.once('shutdown', () => {
      this.game.events.off('start-action', this.handleStartAction, this);
      this.events.off('wave-started');
      this.events.off('wave-finished');
    });

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

    const playerGrassLayer = map.createLayer("player-grass-layer", landTileset, 0, 0);
    this.playerGrassLayer = playerGrassLayer;

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
        const playerLandTile = this.playerGrassLayer.getTileAt(x, y);

        const tile = landTile || playerLandTile;


        // A tile is valid for a tree if it's on land/grass and not occupied by another decoration.
        if (tile) {
          if (Math.random() < treeSpawnProbability) {
            // Create a tree at the center of the tile
            const tree = new Tree(this, tile.getCenterX(), tile.getCenterY());
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
    this.sheeps = this.physics.add.group();
    this.goldMines = this.physics.add.staticGroup();

    // --- Randomly Spawn Gold Mines ---
    const goldMineSpawnProbability = 0.01; // 1% chance to spawn a mine on a valid tile
    for (let y = 0; y < this.grassLayer.height; y++) {
      for (let x = 0; x < this.grassLayer.width / 4; x++) {
        const grassTile = this.playerGrassLayer.getTileAt(x, y);

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


    // --- Initial Sheep Spawning ---
    const MAX_SHEEP_COUNT = BALANCE.economy.sheepMax;
    for (let i = 0; i < MAX_SHEEP_COUNT; i++) {
        this.spawnRandomSheep();
    }




    gameLogic = new GameLogic(this, null, null, this.playerArmy, this.enemyArmy);

    // Add colliders between player units and all structure groups
    const playerUnits = [
      this.playerArmy.workers,
      this.playerArmy.warriors,
      this.playerArmy.archers,
      this.playerArmy.lancers
    ];
    this.playerUnitGroups = playerUnits; // Reused to add the castle collider once it is built.

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
      if (this.castle) {
        this.physics.add.collider(unitGroup, this.castle);
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

    // Attack/sight range checks are done with distance tests inside each entity (see Entity.isInRange).

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

    // Add a listener for the Escape key to cancel build mode
    this.input.keyboard.on('keydown-ESC', () => {
      if (isBuildingMode) {
        this.exitBuildMode();
      }
    });

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
      buildingPlacementSprite = this.add.sprite(0, 0, texture).setAlpha(0.5).setScale(config.class.FOOTPRINT.scale);
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

  /**
   * Snaps a world point to the centre of the land tile under it (where the building will
   * actually be placed). Returns null if there is no land tile there.
   */
  isBuildModeActive() {
    return isBuildingMode;
  }

  getPlacementPoint(worldPoint) {
    const tileX = this.pathLayer.worldToTileX(worldPoint.x);
    const tileY = this.pathLayer.worldToTileY(worldPoint.y);
    const landTile = this.landLayer.getTileAt(tileX, tileY);
    if (!landTile) return null;
    return { x: landTile.getCenterX(), y: landTile.getCenterY() };
  }

  /**
   * The ground rectangle a building will occupy when placed at (x, y), matching the physics
   * body the structure creates (see the FOOTPRINT statics in structureEntity.js).
   */
  getBuildFootprint(structureType, x, y) {
    const config = structureConfig[structureType];
    const frame = this.textures.getFrame(config.texture);
    return config.class.groundRect(x, y, config.texture, frame.width, frame.height);
  }

  /**
   * Everything solid a new building must not overlap, as ground rectangles.
   * Trees block only their trunk (the sprite's base), gold mines their lower half, and
   * buildings their footprint. These are deliberately based on what is drawn, not on the
   * physics bodies, which don't line up with the sprites for trees.
   */
  getPlacementObstacles() {
    const rects = [];

    this.trees.getChildren().forEach(tree => {
      if (tree.active) rects.push(new Phaser.Geom.Rectangle(tree.x - 20, tree.y - 30, 40, 30));
    });

    this.goldMines.getChildren().forEach(mine => {
      if (!mine.active) return;
      const bounds = mine.getBounds();
      rects.push(new Phaser.Geom.Rectangle(bounds.x, bounds.centerY, bounds.width, bounds.height / 2));
    });

    const buildings = [this.houses, this.towers, this.barracks, this.archeries, this.monasteries]
      .flatMap(group => group.getChildren());
    if (this.castle) buildings.push(this.castle);
    buildings.forEach(building => {
      if (building.active) {
        rects.push(building.constructor.groundRect(building.x, building.y, building.texture.key, building.width, building.height));
      }
    });

    return rects;
  }

  /**
   * Returns null if `structureType` can be built at `worldPoint`, otherwise the reason it can't.
   */
  getPlacementError(worldPoint, structureType) {
    const point = this.getPlacementPoint(worldPoint);
    if (!point) return 'Must be built on land.';

    if (structureType === 'castle' && this.castle && this.castle.active) {
      return 'You already have a castle.';
    }

    const footprint = this.getBuildFootprint(structureType, point.x, point.y);

    // Every 32px pathfinding cell under the footprint must be walkable ground
    // (this rules out water, cliffs edges and gold mines).
    const cell = 32;
    const firstX = Math.floor(footprint.left / cell);
    const lastX = Math.floor((footprint.right - 1) / cell);
    const firstY = Math.floor(footprint.top / cell);
    const lastY = Math.floor((footprint.bottom - 1) / cell);
    for (let y = firstY; y <= lastY; y++) {
      for (let x = firstX; x <= lastX; x++) {
        if (!this.grid.isInside(x, y) || !this.grid.isWalkableAt(x, y)) {
          return 'Not enough solid ground here.';
        }
      }
    }

    for (const obstacle of this.getPlacementObstacles()) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(footprint, obstacle)) {
        return 'Something is in the way.';
      }
    }

    return null;
  }

  /** While placing: outlines what blocks building near the cursor, and the footprint itself. */
  drawPlacementOverlay(worldPoint, structureType, snapped) {
    const g = this.debugGraphics;
    g.setDepth(9000); // Above the y-sorted sprites so the outlines are visible.
    g.lineStyle(2, 0xff4444, 0.8);
    for (const rect of this.getPlacementObstacles()) {
      if (Phaser.Math.Distance.Between(worldPoint.x, worldPoint.y, rect.centerX, rect.centerY) < 500) {
        g.strokeRectShape(rect);
      }
    }
    if (snapped) {
      const valid = this.isPlacementValid(worldPoint, structureType);
      g.lineStyle(3, valid ? 0x44ff44 : 0xffaa00, 1);
      g.strokeRectShape(this.getBuildFootprint(structureType, snapped.x, snapped.y));
    }
  }

  isPlacementValid(worldPoint, structureType) {
    return this.getPlacementError(worldPoint, structureType) === null;
  }

  placeBuilding(pointer, structureType) {
    // If left-click is not used, do nothing. This prevents right-click from interfering.
    if (pointer.button !== 0) return;
    if (!isBuildingMode) return;

    // Stop the event from propagating to other listeners (like unit selection).
    // This is crucial to prevent units from being deselected on a failed build attempt.
    pointer.event.stopPropagation();

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);    
    const placementError = this.getPlacementError(worldPoint, structureType);
    if (!placementError) {
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
          this.castle = newStructure; // Special handling for the single castle
          this.playerUnitGroups.forEach(group => this.physics.add.collider(group, this.castle));
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
      console.log(`Cannot build here: ${placementError}`);
      // Stay in build mode so the player can pick another spot (right-click or Esc cancels).
    }
  }

  handleRightClick(pointer) {
    // If in build mode, a right-click should cancel it.
    if (isBuildingMode) {
      this.exitBuildMode();
      return; // Don't process any other right-click logic.
    }

    // This is where the right-click command logic is handled.

    // --- Priority 1: Attack Command ---
    // Check if the click is on an enemy unit.
    const allEnemies = [
      ...this.enemyArmy.goblins.getChildren(),
      ...this.enemyArmy.bombers.getChildren(),
      ...this.enemyArmy.barrels.getChildren(),
    ];
    const clickedEnemy = this.input.manager.hitTest(pointer, allEnemies, this.cameras.main).find(obj => obj.active);

    if (clickedEnemy) {
      const selectedCombatUnits = this.selectedUnits.getChildren().filter(
        unit => unit instanceof Warrior || unit instanceof Lancer || unit instanceof Archer
      );
      if (selectedCombatUnits.length > 0) {
        selectedCombatUnits.forEach(unit => unit.setTarget(clickedEnemy));
        return; // Attack command issued, do not proceed to other right-click actions.
      }
    }

    // --- Priority 2: Worker Commands (Build/Gather) ---
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
    if (this.castle) {
      allStructures.push(this.castle);
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

    // --- Priority 3: Move Command ---
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
    // Reset the cursor to default
    this.setCursorStyle(CURSOR_DEFAULT);

  } 

  handleUnitSelection(pointer, isMultiSelect) {
    const isShiftKeyDown = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT).isDown;
    if (!isShiftKeyDown) {
      this.selectedUnits.clear();
    }
    const allPlayerUnits = [
      ...this.playerArmy.warriors.getChildren(), // This was already here, but let's ensure it's correct.
      ...this.playerArmy.workers.getChildren(),
      ...this.playerArmy.archers.getChildren(),
      ...this.playerArmy.lancers.getChildren()
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

    // Selection tint is applied only when the selection changes (not every frame),
    // so hit flashes aren't overwritten.
    const selectedSet = new Set(this.selectedUnits.getChildren());
    allPlayerUnits.forEach(unit => unit.setSelected(selectedSet.has(unit)));

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

    if (!this.isGameOver) {
      const hasUnits = this.playerArmy.warriors.getLength() > 0 || 
                       this.playerArmy.workers.getLength() > 0 || 
                       this.playerArmy.archers.getLength() > 0 || 
                       this.playerArmy.lancers.getLength() > 0;
      
      if ((this.castle && !this.castle.active) || (!hasUnits && (!this.castle || !this.castle.active))) {
          this.isGameOver = true;
          this.stopAllMusic();
          this.scene.get('UIScene').showEndGameScreen(false);
      }
    }

    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

    if (isBuildingMode && buildingPlacementSprite) {
      // Show the ghost where the building will actually land (snapped to the tile centre).
      const structureType = buildingPlacementSprite.getData('structureType');
      const snapped = this.getPlacementPoint(worldPoint);
      buildingPlacementSprite.x = snapped ? snapped.x : worldPoint.x;
      buildingPlacementSprite.y = snapped ? snapped.y : worldPoint.y;

      this.drawPlacementOverlay(worldPoint, structureType, snapped);

      // Tint the sprite based on placement validity
      if (this.isPlacementValid(worldPoint, structureType)) {
        buildingPlacementSprite.setTint(0x00ff00); // Green tint for valid placement
        this.setCursorStyle(CURSOR_HAMMER);
      } else {
        buildingPlacementSprite.setTint(0xff0000); // Red tint for invalid placement
        this.setCursorStyle(CURSOR_DEFAULT);
      }
    }

    // Cursor hover: the hammer only shows over an unfinished building while a worker is selected,
    // so otherwise there is nothing to hit-test. (Placing a building and panning set their own
    // cursors.)
    if (!isBuildingMode && !inputController.isPanning()) {
      this.setCursorStyle(this.isHoveringBuildSite(pointer) ? CURSOR_HAMMER : CURSOR_DEFAULT);
    }

    inputController.update(time, delta);

    gameLogic.update(time, delta);

    // Update the wave manager
    this.waveManager.update(time, delta);

    // Update sheep population
    this.updateSheepPopulation(delta);

    this.houses.getChildren().slice().forEach((child) => {
      if (!child.scene) return; // destroyed earlier this frame
      child.update(time, delta);
    });

    this.projectiles.getChildren().slice().forEach((child) => {
      if (!child.scene) return; // destroyed earlier this frame
      child.update(time, delta);
    });

    this.towers.getChildren().slice().forEach((child) => {
      if (!child.scene) return; // destroyed earlier this frame
      child.update(time, delta);
    });

    this.barracks.getChildren().slice().forEach((child) => {
      if (!child.scene) return; // destroyed earlier this frame
      child.update(time, delta);
    });

    this.archeries.getChildren().slice().forEach((child) => {
      if (!child.scene) return; // destroyed earlier this frame
      child.update(time, delta);
    });

    this.monasteries.getChildren().slice().forEach((child) => {
      if (!child.scene) return; // destroyed earlier this frame
      child.update(time, delta);
    });

    if (this.castle) {
      this.castle.update(time, delta);
    }

    this.trees.getChildren().slice().forEach((child) => {
      if (!child.scene) return; // destroyed earlier this frame
      child.update(time, delta);
    });

    this.sheeps.getChildren().slice().forEach((child) => {
      if (!child.scene) return; // destroyed earlier this frame
      child.update(time, delta);
    });

    this.goldMines.getChildren().slice().forEach((child) => {
      if (!child.scene) return; // destroyed earlier this frame
      child.update(time, delta);
    });
  }

  /**
   * Sets the mouse cursor, touching the DOM only when it actually changes. Everything that changes
   * the cursor must go through here so the cached value stays correct.
   */
  setCursorStyle(style) {
    if (style === this.currentCursor) return;
    this.currentCursor = style;
    this.input.manager.canvas.style.cursor = style;
  }

  /** True when a worker is selected and the pointer is over a building that is still under construction. */
  isHoveringBuildSite(pointer) {
    if (!this.selectedUnits.getChildren().some(unit => unit instanceof Worker)) return false;

    const unfinished = [this.houses, this.towers, this.barracks, this.archeries, this.monasteries]
      .flatMap(group => group.getChildren())
      .filter(building => building.currentState === 'CONSTRUCT');
    if (this.castle && this.castle.currentState === 'CONSTRUCT') unfinished.push(this.castle);
    if (unfinished.length === 0) return false;

    return this.input.manager.hitTest(pointer, unfinished, this.cameras.main).length > 0;
  }

  spawnRandomSheep() {
    const maxAttempts = 30; // Try 30 times to find a spot
    for (let i = 0; i < maxAttempts; i++) {
        // 1. Pick a random coordinate on the 32x32 pathfinding grid.
        const gridX = Phaser.Math.Between(0, this.grid.width - 1);
        const gridY = Phaser.Math.Between(0, this.grid.height - 1);

        // 2. Check if the grid cell is walkable.
        if (this.grid.isWalkableAt(gridX, gridY)) {
            // 3. Convert grid coordinates to the 64x64 tile layer coordinates.
            const tileX = Math.floor(gridX / 2);
            const tileY = Math.floor(gridY / 2);

            // 4. Check if a tile exists on the player-grass-layer at that location.
            const tile = this.playerGrassLayer.getTileAt(tileX, tileY);

            if (tile) {
                // 5. This is a valid spawn point. Calculate world coordinates.
                const worldX = gridX * 32 + 16;
                const worldY = gridY * 32 + 16;
                const sheep = new Sheep(this, worldX, worldY);
                this.sheeps.add(sheep);
                return; // Successfully spawned, exit the function.
            }
        }
    }
    console.warn("Could not find a valid location to spawn a sheep.");
  }

  updateSheepPopulation(delta) {
    const MAX_SHEEP_COUNT = BALANCE.economy.sheepMax;
    const SHEEP_RESPAWN_INTERVAL = BALANCE.economy.sheepRespawnMs;

    this.sheepRespawnTimer -= delta;

    if (this.sheepRespawnTimer <= 0) {
        this.sheepRespawnTimer = SHEEP_RESPAWN_INTERVAL;

        const currentSheepCount = this.sheeps.getLength();
        if (currentSheepCount < MAX_SHEEP_COUNT) {
            console.log(`Sheep count is ${currentSheepCount}, below max of ${MAX_SHEEP_COUNT}. Spawning a new one.`);
            this.spawnRandomSheep();
        }
    }
  }

  playNextBgmTrack() {
    // Stop any existing tracks to prevent overlap
    this.bgmPlaylist.forEach(key => this.sound.stopByKey(key));

    const trackKey = this.bgmPlaylist[this.currentBgmIndex];
    this.currentBgm = this.sound.add(trackKey, { volume: 0.2 });

    this.currentBgm.once('complete', () => {
      if (this.currentBgm) this.currentBgm.destroy();
      
      // Wait 2 seconds before playing the next track
      this.time.delayedCall(2000, () => {
        if (!this.sys.isActive()) return;
        this.currentBgmIndex = (this.currentBgmIndex + 1) % this.bgmPlaylist.length;
        this.playNextBgmTrack();
      });
    });

    this.currentBgm.play();
  }

  stopAllMusic() {
    this.sound.stopAll();
  }
}