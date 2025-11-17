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
import Structure, { Tree, Tower, Castle, House, Towers, Barracks, Archery, Monastery } from './entities/structureEntity.js';
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
var playerArmy;
var gameLogic;
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

    // barracks (Corrected paths to be consistent with other player buildings)
    this.load.image('barracks-tiles', './Tiny Swords/Tiny Swords (Update 010)/Buildings/Blue Buildings/Barracks.png');
    this.load.image("barracks-construct-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Buildings/Constructed/barracks-constructed.png");
    this.load.image("barracks-destroyed-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Buildings/Destroyed/barracks_destroyed.png");

    // archery (Uncommented and corrected paths)
    this.load.image('archery-tiles', './Tiny Swords/Tiny Swords (Update 010)/Buildings/Blue Buildings/Archery.png');
    this.load.image("archery-construct-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Buildings/Constructed/archery-construction.png");
    this.load.image("archery-destroyed-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Buildings/Destroyed/archery_destroyed.png");

    // monastery (Uncommented and corrected paths)
    this.load.image('monastery-tiles', 'Tiny Swords/Tiny Swords (Update 010)/Buildings/Blue Buildings/Monastery.png');
    this.load.image("monastery-construct-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Monastery/Monastery_Construction.png");
    this.load.image("monastery-destroyed-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Monastery/Monastery_Destroyed.png");

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
    this.load.image("corner-tl", "./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/03.png");
    this.load.image('corner-tr', './Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/04.png');
    this.load.image('corner-bl', './Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/05.png');
    this.load.image('corner-br', './Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/06.png');

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

    // Create a graphics object for debugging physics bodies
    this.debugGraphics = this.add.graphics().setDepth(100);

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

    const bridgeLayer = map.createLayer("bridge-layer", bridgeTileset, 0, 0);

    const waterGrassLayer = map.createLayer("water-grass-layer", grassWaterTileset, 0, 0);

    this.grassLayer = grassLayer;

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

    var grid = new PF.Grid(landLayer.width / 64, landLayer.height / 64);

    for (let y = 0; y < landLayer.height / 64; y++) {
      for (let x = 0; x < landLayer.width / 64; x++) {
        // A tile is walkable if it exists on the land layer but not on the water layer.
        const landTile = landLayer.getTileAt(x, y);
        const grassTile = grassLayer.getTileAt(x, y);
        const bridgeTile = bridgeLayer.getTileAt(x, y);

        grid.setWalkableAt(x, y, (landTile || grassTile));
      }
    }

    for (let y = 0; y < landLayer.height / 64; y++) {
      for (let x = 0; x < landLayer.width / 64; x++) {
        // A tile is walkable if it exists on the land layer but not on the water layer.
        const bridgeTile = bridgeLayer.getTileAt(x, y);

        //grid.setWalkableAt(x, y, (bridgeLayer));
        if (bridgeTile) {
          grid.setWalkableAt(x, y, true);
          console.log('bridge setup', x, y);
        }
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

    this.playerArmy = new PlayerArmy(this, this.pathLayer, finder, grid);
    this.enemyArmy = new EnemyArmy(this, this.pathLayer, finder, grid);

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
            grid.setWalkableAt(x, y, false);
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
      this.monasteries
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
    const playerUnitGroups = [this.playerArmy.warriors, this.playerArmy.workers, this.playerArmy.archers];
    this.physics.add.overlap(this.enemyArmy.goblins.getChildren().map(g => g.attackRange), playerUnitGroups);
    this.physics.add.overlap(this.enemyArmy.goblins.getChildren().map(g => g.range), playerUnitGroups);

    // Set up attack overlaps for goblins against all player structures
    const playerStructureGroups = [this.houses, this.towers, this.barracks, this.archeries, this.monasteries];
    this.physics.add.overlap(this.enemyArmy.goblins.getChildren().map(g => g.attackRange), playerStructureGroups);

    // Also add overlap for the castle if it exists
    if (castle) {
      this.physics.add.overlap(this.enemyArmy.goblins.getChildren().map(g => g.attackRange), castle);
      this.physics.add.overlap(this.enemyArmy.goblins.getChildren().map(g => g.range), castle);
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
  }

  handleStartAction(details) {
    const { action, target } = details;

    if (action === 'build') {
      this.enterBuildMode(target);
    }
    // else if (action === 'gather') { ... } // Future logic for gathering
  }

  enterBuildMode(structureType) {
    if (['tower', 'house', 'castle', 'barracks', 'archery', 'monastery'].includes(structureType)) {
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
    const landTile = this.landLayer.getTileAt(tileX, tileY); // Check for a tile specifically on the land layer

    if (landTile) { // Only allow building if a tile exists on the land layer
      // Let the UI know the action has started so it can close the menu
      this.game.events.emit('action-started');

      if (structureType === 'tower') {
        // Create the tower in a "construction" state
        const newTower = new Tower(this, landTile.getCenterX(), landTile.getCenterY(), 100, 100);
        newTower.currentState = 'CONSTRUCT';
        this.towers.add(newTower);
        newStructure = newTower;
      } else if (structureType === 'house') {
        const newHouse = new House(this, landTile.getCenterX(), landTile.getCenterY(), 100, 100, 'house-construct-tiles');
        // newHouse.currentState = 'CONSTRUCT'; // Already set in constructor
        this.houses.add(newHouse);
        newStructure = newHouse;
      }
      else if (structureType === 'castle') {
        castle = new Castle(this, landTile.getCenterX(), landTile.getCenterY(), 300, 150, 'castle-construct-tiles');
        castle.depth = 1;
        newStructure = castle;
      }

      // Add collider for the new structure with existing units
      if (newStructure) {
        this.physics.add.collider(this.playerArmy.workers, newStructure);
        this.physics.add.collider(this.playerArmy.warriors, newStructure);
      }
      else if (structureType === 'barracks') {
        const newBarracks = new Barracks(this, landTile.getCenterX(), landTile.getCenterY(), 100, 100, 'barracks-construct-tiles');
        this.barracks.add(newBarracks);
        newStructure = newBarracks;
      }
      else if (structureType === 'archery') {
        const newArchery = new Archery(this, landTile.getCenterX(), landTile.getCenterY(), 100, 100, 'archery-construct-tiles');
        this.archeries.add(newArchery);
        newStructure = newArchery;
      }
      else if (structureType === 'monastery') {
        const newMonastery = new Monastery(this, landTile.getCenterX(), landTile.getCenterY(), 100, 100, 'monastery-construct-tiles');
        this.monasteries.add(newMonastery);
        newStructure = newMonastery;
      }

      // Command selected workers to build
      this.selectedUnits.getChildren().forEach(worker => {
        if (worker.texture.key === 'worker-entity') {
          if (newStructure)
            worker.buildStructure(newStructure);
        }
      });
    } else { console.log("Cannot build here. Must be on the main land layer."); }

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
    const worldX = this.pathLayer.tileToWorldX(tileX) + this.pathLayer.tilemap.tileWidth / 2;
    const worldY = this.pathLayer.tileToWorldY(tileY) + this.pathLayer.tilemap.tileHeight / 2;

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

    if (isBuildingMode && buildingPlacementSprite) {
      const worldPoint = this.cameras.main.getWorldPoint(this.input.x, this.input.y);
      buildingPlacementSprite.x = worldPoint.x;
      buildingPlacementSprite.y = worldPoint.y;
    }

    inputController.update(time, delta);

    gameLogic.update(time, delta);

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