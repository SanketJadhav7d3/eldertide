import { loadEntitySpriteSheet } from '../animations/animations.js';

export default class LoadingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoadingScene' });
    this.assetsLoaded = false;
    this.minTimePassed = false;
  }

  preload() {
    const { width, height } = this.cameras.main;

    // Black background
    this.add.rectangle(0, 0, width, height, 0x000000).setOrigin(0);

    // --- Progress Bar ---
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 30, 320, 50);

    // The bar that will be scaled. We'll create it here and just update its scale.
    // This is more performant than clearing and redrawing the bar on every progress event.
    this.progressBar = this.add.graphics({ x: width / 2 - 150, y: height / 2 - 20 });
    this.progressBar.fillStyle(0xffffff, 1);
    this.progressBar.fillRect(0, 0, 300, 30);
    this.progressBar.scaleX = 0;

    // --- Loading Text ---
    const loadingText = this.add.text(width / 2, height / 2 - 50, 'Loading...', {
      fontSize: '20px',
      fill: '#ffffff'
    }).setOrigin(0.5);
    this.percentText = this.add.text(width / 2, height / 2 - 5, '0%', {
      fontSize: '18px',
      fill: '#ffffff'
    }).setOrigin(0.5);

    // --- Phase 1 Load: Just the assets for the loading screen animation ---
    // The main assets will be loaded in create() to prevent the animation from freezing.
    this.load.spritesheet("warrior-entity-pos", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Warrior/Red/Warrior_Red.png", { frameWidth: 192, frameHeight: 192 });
  }

  create() {
    const { width, height } = this.cameras.main;

    // --- Create the animation, which can now play smoothly ---
    this.anims.create({
      key: 'loading-warrior-run',
      frames: this.anims.generateFrameNumbers('warrior-entity-pos', { start: 6, end: 11 }),
      frameRate: 8,
      repeat: -1
    });
    const warrior = this.add.sprite(width / 2, height / 2 + 100, 'warrior-entity-pos').setScale(1);
    warrior.play('loading-warrior-run');

    // --- Set up listeners for the main asset load ---
    this.load.on('progress', (value) => {
      this.percentText.setText(parseInt(value * 100) + '%');
      this.progressBar.scaleX = value;
    });

    this.load.on('complete', () => {
      this.assetsLoaded = true;
      if (this.minTimePassed) {
        this.startNextScene();
      }
    });

    // Set a minimum display time for the loading screen (e.g., 2500ms)
    this.time.delayedCall(2500, () => {
      this.minTimePassed = true;
      if (this.assetsLoaded) {
        this.startNextScene();
      }
    });

    // --- Phase 2 Load: All other game assets ---
    this.loadAllAssets();
    // Manually start the loader since we are outside of preload.
    this.load.start();
  }

  startNextScene() {
    this.scene.launch('VillageScene');
    this.scene.launch('UIScene');
    this.scene.stop();
  }

  loadAllAssets() {
    // --- Map & Terrain ---
    this.load.tilemapTiledJSON("map", "./map.tmj");
    this.load.image("water-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Water/Water.png");
    this.load.image("land-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Ground/Tilemap_Flat.png");
    this.load.image("elevation-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Ground/Tilemap_Elevation.png");
    this.load.image("bridge-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Bridge/Bridge_All.png");
    this.load.image("water-grass-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Ground/Tilemap_color1.png");
    this.load.image("water-foam-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Water/Foam/Foam.png");
    this.load.image("water-rocks-tiles-01", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Water/Rocks/Rocks_01.png");
    this.load.image("water-rocks-tiles-02", "Tiny Swords/Tiny Swords (Update 010)/Terrain/Water/Rocks/Rocks_02.png");
    this.load.image("water-rocks-tiles-03", "Tiny Swords/Tiny Swords (Update 010)/Terrain/Water/Rocks/Rocks_03.png");
    this.load.image("water-rocks-tiles-04", "Tiny Swords/Tiny Swords (Update 010)/Terrain/Water/Rocks/Rocks_04.png");

    // --- Decorations ---
    for (let i = 1; i <= 18; i++) {
      const num = i.toString().padStart(2, '0');
      this.load.image(`deco-${num}-tiles`, `./Tiny Swords/Tiny Swords (Update 010)/Deco/${num}.png`);
    }

    // --- Structures ---
    this.load.image("castle-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Castle/Castle_Blue.png");
    this.load.image("castle-construct-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Castle/Castle_Construction.png");
    this.load.image("castle-destroyed-tiles", "Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Castle/Castle_Destroyed.png");
    this.load.image("tower-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Tower/Tower_Blue.png");
    this.load.image("tower-construct-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Tower/Tower_Construction.png");
    this.load.image("tower-destroyed-tiles", "Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Tower/Tower_Destroyed.png");
    this.load.image("house-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/House/House_Blue.png");
    this.load.image("house-construct-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/House/House_Construction.png");
    this.load.image("house-destroyed-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/House/House_Destroyed.png");
    this.load.image('barracks-tiles', './Tiny Swords/Tiny Swords (Update 010)/Buildings/Blue Buildings/Barracks.png');
    this.load.image("barracks-construct-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Buildings/Constructed/barracks-constructed.png");
    this.load.image("barracks-destroyed-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Buildings/Destroyed/barracks_destroyed.png");
    this.load.image('archery-tiles', './Tiny Swords/Tiny Swords (Update 010)/Buildings/Blue Buildings/Archery.png');
    this.load.image("archery-construct-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Buildings/Constructed/archery-construction.png");
    this.load.image("archery-destroyed-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Buildings/Destroyed/archery_destroyed.png");
    this.load.image('monastery-tiles', 'Tiny Swords/Tiny Swords (Update 010)/Buildings/Blue Buildings/Monastery.png');
    this.load.image("monastery-construct-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Buildings/Constructed/monastry-constructed.png");
    this.load.image("monastery-destroyed-tiles", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Monastery/Monastery_Destroyed.png");

    // --- Resources ---
    this.load.image('gold-mine', './Tiny Swords/Tiny Swords (Update 010)/Resources/Gold Mine/GoldMine_Active.png');
    this.load.image('wood-icon', './Tiny Swords/Tiny Swords (Update 010)/Resources/Resources/W_Idle.png');
    this.load.image('gold-icon', './Tiny Swords/Tiny Swords (Update 010)/Resources/Resources/G_Idle_(NoShadow).png');
    this.load.image('meat-icon', './Tiny Swords/Tiny Swords (Update 010)/Resources/Resources/M_Idle_(NoShadow).png');

    // --- UI Elements ---
    this.load.image("cursor-img", "./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/01.png");
    this.load.image("hammer-cursor", "./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/hammer-pointer-2.png");
    this.load.image("grabbing-cursor", "./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/02.png");
    this.load.image("corner-tl", "./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/03.png");
    this.load.image('corner-tr', './Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/04.png');
    this.load.image('corner-bl', './Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/05.png');
    this.load.image('corner-br', './Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/06.png');
    this.load.image('next-button', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons Assets/next_button.png');
    this.load.image('next-button-hover', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons Assets/next_button_hover.png');
    this.load.image('next-button-pressed', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons Assets/next_button_pressed.png');
    this.load.image('startButton', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons/Button_Blue_3Slides.png');
    this.load.image('startButtonHover', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons/Button_Hover_3Slides.png');
    this.load.image('startButtonPressed', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons/Button_Blue_3Slides_Pressed.png');
    this.load.image('settings-button', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons/settings_button.png');
    this.load.image('settings-button-hover', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons/settings_button_hover.png');
    this.load.image('settings-button-pressed', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons/settings_button_Pressed.png');
    this.load.image('ribbon-header-left-side-bar', './Tiny Swords/Tiny Swords (Update 010)/UI/ribbon-header-left-side-bar.png');
    this.load.image('build-panel', './Tiny Swords/Tiny Swords (Update 010)/UI/menu banner.png');
    this.load.image('production-panel', './Tiny Swords/UI/production banner.png');
    this.load.image('resource-banner', './Tiny Swords/UI/resources banner.png');
    this.load.image('tower-icon', './Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Tower/Tower_Blue.png');
    this.load.image('house-icon', './Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/House/House_Blue.png');
    this.load.image('castle-icon', './Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Castle/Castle_Blue.png');
    this.load.image('barracks-icon', './Tiny Swords/Tiny Swords (Update 010)/Buildings/Blue Buildings/Barracks.png');
    this.load.image('archery-icon', './Tiny Swords/Tiny Swords (Update 010)/Buildings/Blue Buildings/Archery.png');
    this.load.image('monastery-icon', './Tiny Swords/Tiny Swords (Update 010)/Buildings/Blue Buildings/Monastery.png');
    this.load.image('warrior-icon', './Tiny Swords/Tiny Swords (Update 010)/Factions/Knights/Troops/Warrior/Warrior_Blue.png');

    // --- Tutorial Assets ---
    this.load.image('tutorial-panel', './Tiny Swords/UI/tutorial-banner.png');
    this.load.spritesheet('tutorial-drag-select', './Tiny Swords/gif_assets/basic-moments.png', { frameWidth: 418, frameHeight: 314 });
    this.load.spritesheet('tutorial-build', './Tiny Swords/gif_assets/building-tut.png', { frameWidth: 1174, frameHeight: 918 });
    this.load.spritesheet('tutorial-extract', './Tiny Swords/gif_assets/resources.png', { frameWidth: 492, frameHeight: 492 });
    this.load.spritesheet('tutorial-protect', './Tiny Swords/gif_assets/protect.png', { frameWidth: 548, frameHeight: 522 });
    this.load.image('build-menu-static-image', './Tiny Swords/Tiny Swords (Update 010)/UI/menu banner.png');

    // --- Spritesheets & Animations ---
    loadEntitySpriteSheet(this); // This loads all entity spritesheets

    // --- Audio ---
    this.load.audio('warrior-trained-sound', './Tiny Swords/audio/entity-trained.wav');
  }
}