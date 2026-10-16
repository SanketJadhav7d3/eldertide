import { House, Barracks, Tower, Castle, Archery, Monastery } from '../entities/structureEntity.js';


export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
    this.isMenuOpen = false;
    this.buildMenuContainer = null; // A single container for the entire menu
    this.woodText = null;
    this.resourceManager = null;
    this.modalBackground = null;
    // Training menus keyed by building type (barracks / archery / castle); see createProductionMenu().
    this.productionMenus = {};
    this.tutorialContainer = null;
    this.tutorialGif = null;
    this.tutorialText = null;
    this.tutorialNextButton = null;
    this.tutorialNextButtonText = null;
    this.currentTutorialSlideIndex = 0;
    this.tutorialSlides = [
      {
        text: "Welcome to Eldertide!\n\n- Click and drag to select units.\n- Right-click on the ground to move them.\n- Right-click on an enemy to attack.",
        animKey: 'tutorial-drag-select-anim', // This slide uses an animation
        scale: 1.2,
      },
      {
        text: "To build structures, first select a Worker.\n\nThis will activate the build menu on the left.\n\nClick an icon to enter build mode and place your new building.",
        animKey: 'tutorial-build-anim', // This slide uses an animation
        scale: 0.5 
      },
      {
        text: "Changed your mind?\n\nRight-click or press the 'ESC' key to cancel placing a building.",
        // This slide is text-only.
      },
      {
        text: "To gather resources, select your Workers and right-click on a resource node.\n\n- Trees provide Wood.\n- Sheep provide Meat.\n- Gold Mines provide Gold.",
        animKey: 'tutorial-extract-anim', // This slide uses an animation
        scale: 1
      },
      {
        text: "Enemy forces will attack in waves. Defend your village by training an army and building towers. Each wave will be stronger than the last!",
        animKey: 'tutorial-protect-anim', // This slide uses an animation
        scale: 1
      },
      {
        text: "One last thing: This is a prototype!\n\nIf you can't select an entity or if the arrows start flying out of the screen, just remember: it's not a bug, it's an 'unplanned feature'. Enjoy the chaos!",
        // This slide is text-only.
      },
    ];
    this.buildIcons = {}; // To store references to the icon images and their data
    this.waveTimerText = null;
    this.endGameContainer = null;
  }

  init() {}

  preload() {
    // All assets are now loaded in LoadingScene.js
  }

  create() {
    // Set the default cursor style using a custom image. Hotspot is at (5, 5).
    this.input.manager.canvas.style.cursor = `url('./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/01.png') 5 5, auto`;

    // Create the warrior animation now that the spritesheet is loaded.
    // The key 'warrior-idle-anim' is already used by createAnimations, so we should ensure it's consistent.
    // It's better to use the shared animation creation function.
    // createAnimations(this); // This would also work if you want all animations.
    this.anims.create({
      key: 'warrior-idle-anim',
      frames: this.anims.generateFrameNumbers('warrior-entity-pos', { start: 0, end: 5 }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'worker-idle-anim',
      frames: this.anims.generateFrameNumbers('worker-entity', { start: 0, end: 5 }),
      frameRate: 10,
      repeat: -1
    });

    // Create the animations for the tutorial from the loaded spritesheets
    this.anims.create({
      key: 'tutorial-drag-select-anim',
      frames: this.anims.generateFrameNumbers('tutorial-drag-select', { start: 0, end: -1 }),
      frameRate: 24,
      repeat: -1
    });

    this.anims.create({
      key: 'tutorial-build-anim',
      frames: this.anims.generateFrameNumbers('tutorial-build', { start: 0, end: -1 }),
      frameRate: 24,
      repeat: -1
    });

    this.anims.create({
      key: 'tutorial-extract-anim',
      frames: this.anims.generateFrameNumbers('tutorial-extract', { start: 0, end: -1 }),
      frameRate: 24,
      repeat: -1
    });

    this.anims.create({
      key: 'tutorial-protect-anim',
      frames: this.anims.generateFrameNumbers('tutorial-protect', { start: 0, end: -1 }),
      frameRate: 24,
      repeat: -1
    });

    // --- Get a reference to the main game scene ---
    const villageScene = this.scene.get('VillageScene');

    // --- Create a container for the entire build menu ---
    // We create it at its "closed" position.
    this.buildMenuContainer = this.add.container(-580, 0).setDepth(-1);

    // --- Add elements to the container ---
    // Positions are now relative to the container's origin (0,0)
    const buildMenuPanel = this.add.sprite(170, 10, 'build-panel').setOrigin(0, 0).setScale(0.8);
    const ribbon = this.add.sprite(0, 50, 'ribbon-header-left-side-bar').setOrigin(0, 0).setInteractive();
    this.buildMenuContainer.add([buildMenuPanel, ribbon]);

    // Add a pointer down event to toggle the menu, as you requested
    ribbon.on('pointerdown', () => {
      if (ribbon.alpha === 1) { // Only toggle if the ribbon is enabled
        this.toggleBuildMenu();
      }
    });
    const menuOptions = [
      { key: 'castle', icon: 'castle-icon', class: Castle },
      { key: 'house', icon: 'house-icon', class: House },
      { key: 'tower', icon: 'tower-icon', class: Tower },
      { key: 'barracks', icon: 'barracks-icon', class: Barracks },
      { key: 'archery', icon: 'archery-icon', class: Archery },
      { key: 'monastery', icon: 'monastery-icon', class: Monastery },
    ];

    menuOptions.forEach((option, index) => {
      const itemY = 180 + (index * 110);
      // Position icons relative to the container
      const item = this.add.image(280, itemY, option.icon)
        .setInteractive()
        .setScale(0.6);

      item.on('pointerdown', (pointer) => {
        // Only allow building if the icon is not tinted (i.e., affordable)
        if (pointer.leftButtonDown() && item.tint === 0xffffff) {
          // Emit an event to the VillageScene to start the action
          this.game.events.emit('start-action', { action: 'build', target: option.key });
          this.toggleBuildMenu(); // Close menu after selection
        }
      });
      this.buildMenuContainer.add(item);

      // --- Add cost display ---
      const cost = option.class.COST;
      const costContainer = this.add.container(0, 0); // Create a temporary container for cost elements
      const costTextStyle = { fontSize: '24px', fill: '#fff', stroke: '#000', strokeThickness: 4 };
      const iconScale = 0.8;
      const verticalSpacing = 40;
      const yOffset = 50;
      let currentY = 0;

      if (cost.wood) {
        const woodIcon = this.add.image(10, currentY + yOffset, 'wood-icon').setScale(iconScale).setOrigin(0, 0.5);
        const woodText = this.add.text(95, currentY + yOffset + 10, cost.wood, costTextStyle).setOrigin(0, 0.5);
        costContainer.add([woodIcon, woodText]);
        currentY += verticalSpacing;
      }
      if (cost.gold) {
        const goldIcon = this.add.image(10, currentY + yOffset, 'gold-icon').setScale(iconScale).setOrigin(0, 0.5);
        const goldText = this.add.text(95, currentY + yOffset + 10, cost.gold, costTextStyle).setOrigin(0, 0.5);
        costContainer.add([goldIcon, goldText]);
        currentY += verticalSpacing;
      }
      if (cost.meat) {
        const meatIcon = this.add.image(10, currentY + yOffset, 'meat-icon').setScale(iconScale).setOrigin(0, 0.5);
        const meatText = this.add.text(95, currentY + yOffset + 10, cost.meat, costTextStyle).setOrigin(0, 0.5);
        costContainer.add([meatIcon, meatText]);
      }

      // Position the cost container adjacent to the main building icon
      const costContainerHeight = costContainer.getBounds().height;
      costContainer.setPosition(item.x + 80, itemY - (costContainerHeight / 2));

      this.buildMenuContainer.add(costContainer);

      // Store the icon and its associated class for cost checking
      this.buildIcons[option.key] = { icon: item, class: option.class };
    });

    // --- Create the Wave Timer Text ---
    this.waveTimerText = this.add.text(this.cameras.main.width / 2, 30, '', {
      fontSize: '24px',
      fill: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);

    // --- Add settings button ---
    this.settingsButton = this.add.image(this.cameras.main.width - 50, 50, 'settings-button')
      .setInteractive()
      .setScrollFactor(0)
      .setDepth(8000);

    this.settingsButton.on('pointerover', () => {
      this.settingsButton.setTexture('settings-button-hover');
    });

    this.settingsButton.on('pointerout', () => {
      this.settingsButton.setTexture('settings-button');
    });

    this.settingsButton.on('pointerdown', () => {
      this.settingsButton.setTexture('settings-button-pressed');
    });

    this.settingsButton.on('pointerup', () => {
      const villageScene = this.scene.get('VillageScene');
      if (villageScene.sys.isPaused()) {
        villageScene.sys.resume();
        this.pauseOverlay.setVisible(false);
      } else {
        villageScene.sys.pause();
        this.pauseOverlay.setVisible(true);
      }
    });

    // --- Add Fullscreen Button ---
    // Positioned to the left of the settings button (110px from the right)
    this.fullscreenButton = this.add.image(this.cameras.main.width - 110, 50, 'fullscreen-button')
      .setInteractive()
      .setScrollFactor(0)
      .setDepth(8000);

    this.fullscreenButton.on('pointerover', () => {
      this.fullscreenButton.setTexture('fullscreen-hover-button');
    });

    this.fullscreenButton.on('pointerout', () => {
      this.fullscreenButton.setTexture('fullscreen-button');
    });

    this.fullscreenButton.on('pointerdown', () => {
      this.fullscreenButton.setTexture('fullscreen-pressed-button');
    });

    this.fullscreenButton.on('pointerup', () => {
      this.fullscreenButton.setTexture('fullscreen-hover-button');
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
      } else {
        this.scale.startFullscreen();
      }
    });

    // --- Create Pause Overlay ---
    this.pauseOverlay = this.add.container(0, 0).setVisible(false).setDepth(7000);
    this.pauseBg = this.add.graphics();
    this.pauseBg.fillStyle(0x000000, 0.6);
    this.pauseBg.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
    
    this.pauseText = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, 
      "GAME PAUSED\n\n(The Goblins are currently filling out their\ntax returns. Even in a prototype,\nthere's no escaping the bureaucracy.)\n\n[ Click the settings button to resume ]", {
      fontSize: '32px',
      fill: '#ffffff',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5);
    this.pauseOverlay.add([this.pauseBg, this.pauseText]);

    // --- Create a modal background for pop-up menus ---
    // This covers the whole screen and closes the menu when clicked.
    this.modalBackground = this.add.graphics();
    this.modalBackground.fillStyle(0x000000, 0.5);
    this.modalBackground.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
    this.modalBackground.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.cameras.main.width, this.cameras.main.height), Phaser.Geom.Rectangle.Contains);
    this.modalBackground.on('pointerdown', () => {
      this.closeAllProductionMenus();
    });
    this.modalBackground.setVisible(false).setDepth(5000); // High depth to be on top of most UI

    // --- Create the training menus (initially hidden) ---
    this.textStyles = {
      queue: { fontSize: '22px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 },
      progress: { fontSize: '18px', fill: '#cccccc', stroke: '#000000', strokeThickness: 4 },
      hint: { fontSize: '14px', fill: '#dddddd', stroke: '#000000', strokeThickness: 3 },
    };

    // Barracks: warrior and lancer, laid out on the large production panel.
    this.createProductionMenu('barracks', {
      panel: 'production-panel',
      panelScale: 1,
      icons: [
        { x: 100, y: 100, texture: 'warrior-entity-pos', anim: 'warrior-idle-anim', unit: 'warrior' },
        { x: 100, y: 300, texture: 'lancer-idle', anim: 'lancer-idle-anim', unit: 'lancer' },
      ],
      queueText: { x: 250, y: 190, originX: 0.5 },
      progressText: { x: 250, y: 220, originX: 0.5 },
      hint: { x: 250, y: 250, originX: 0.5 },
    });

    // Archery range and castle: one unit each, on the small panel (x values are 'center+N',
    // relative to a quarter of the panel's width).
    const smallPanelMenu = (texture, anim, unit) => ({
      panel: 'archer-build-panel',
      panelScale: 0.5,
      icons: [{ x: 'center+10', y: 100, texture, anim, unit }],
      queueText: { x: 'center+100', y: 90, originX: 0 },
      progressText: { x: 'center+80', y: 120, originX: 0 },
      hint: { x: 'center+80', y: 155, originX: 0 },
    });
    this.createProductionMenu('archery', smallPanelMenu('archer-entity', 'archer-idle-anim', 'archer'));
    this.createProductionMenu('castle', smallPanelMenu('worker-entity', 'worker-idle-anim', 'worker'));

    // --- Create Tutorial Modal ---
    this.tutorialContainer = this.add.container(0, 0).setVisible(false).setDepth(5001);
    const tutorialPanel = this.add.image(0, 0, 'tutorial-panel').setOrigin(0.5, 0.5).setScale(1.2);

    // --- Add Tutorial GIF ---
    // Horizontally stack GIF and text
    // The sprite is created here, but its texture, animation, scale, and position
    // will be set dynamically in updateTutorialContent.
    this.tutorialGif = this.add.sprite(0, 0, 'tutorial-drag-select').setVisible(false);

    const tutorialTextStyle = {
      fontSize: '28px',
      fill: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'left',
      wordWrap: { width: 450 } // textBlockWidth
    };
    // Text is also created here, but positioned dynamically.
    this.tutorialText = this.add.text(0, 0, '', tutorialTextStyle).setOrigin(0, 0.5);

    // --- Tutorial Next Button ---
    const buttonY = tutorialPanel.displayHeight / 2 - 100;
    this.tutorialNextButton = this.add.image(0, buttonY, 'next-button')
      .setInteractive();

    const buttonTextStyle = { fontSize: '40px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 };
    this.tutorialNextButtonText = this.add.text(0, buttonY, '', buttonTextStyle).setOrigin(0.5);

    this.tutorialNextButton.on('pointerover', () => {
      if (this.currentTutorialSlideIndex === this.tutorialSlides.length - 1) {
        this.tutorialNextButton.setTexture('startButtonHover');
      } else {
        this.tutorialNextButton.setTexture('next-button-hover');
      }
    });

    this.tutorialNextButton.on('pointerdown', () => {
      if (this.currentTutorialSlideIndex === this.tutorialSlides.length - 1) {
        this.tutorialNextButton.setTexture('startButtonPressed');
      } else {
        this.tutorialNextButton.setTexture('next-button-pressed');
      }
    });

    this.tutorialNextButton.on('pointerout', () => {
      // When the pointer leaves, always revert to the default texture
      if (this.currentTutorialSlideIndex === this.tutorialSlides.length - 1) {
        this.tutorialNextButton.setTexture('startButton');
      } else {
        this.tutorialNextButton.setTexture('next-button');
      }
    });

    this.tutorialNextButton.on('pointerup', () => {
      // On release, the pointer is still over the button, so show the hover texture.
      if (this.currentTutorialSlideIndex === this.tutorialSlides.length - 1) {
        this.tutorialNextButton.setTexture('startButtonHover');
      } else {
        this.tutorialNextButton.setTexture('next-button-hover');
      }
      this.showNextTutorialSlide();
    });

    this.tutorialContainer.add([tutorialPanel, this.tutorialGif, this.tutorialText, this.tutorialNextButton, this.tutorialNextButtonText]);
    this.tutorialContainer.setPosition(this.cameras.main.centerX, this.cameras.main.centerY);

    // Listen for selection changes from the main game scene
    villageScene.events.on('selection-changed', this.onSelectionChange, this);

    // Listen for when a barracks is specifically selected
    villageScene.events.on('barracks-selected', this.onBarracksSelected, this);

    // Listen for when an archery is selected
    villageScene.events.on('archery-selected', this.onArcherySelected, this);

    // Listen for when a castle is selected
    villageScene.events.on('castle-selected', this.onCastleSelected, this);

    // Listen for an action to start to close the menu
    const onActionStarted = () => {
        if (this.isMenuOpen) {
            this.toggleBuildMenu();
        }
    };
    this.game.events.on('action-started', onActionStarted);

    // Remove listeners on shutdown so a restart doesn't register them twice.
    this.events.once('shutdown', () => {
      this.game.events.off('action-started', onActionStarted);
      this.game.events.off('village-scene-ready', this.handleVillageSceneReady, this);
      villageScene.events.off('selection-changed', this.onSelectionChange, this);
      villageScene.events.off('barracks-selected', this.onBarracksSelected, this);
      villageScene.events.off('archery-selected', this.onArcherySelected, this);
      villageScene.events.off('castle-selected', this.onCastleSelected, this);
      villageScene.events.off('waveTimerUpdate');
      this.scale.off('resize', this.handleResize, this);
    });

    // Listen for clicks on the ground to close the production menu
    villageScene.input.on('pointerdown', (pointer) => {
      // Check if the click was not on an interactive object (like a unit or building)
      // This is a simple way to detect a "deselect" click.
      // The `topOnly` flag ensures we only get the topmost interactive object.
      // We must provide hitTest with a flat array of GameObjects, not groups.
      const allInteractiveObjects = [
        ...villageScene.playerArmy.workers.getChildren(),
        ...villageScene.playerArmy.warriors.getChildren(),
        ...villageScene.playerArmy.lancers.getChildren(),
        ...villageScene.playerArmy.archers.getChildren(),
        ...villageScene.enemyArmy.goblins.getChildren(),
        ...villageScene.trees.getChildren(),
        ...villageScene.houses.getChildren(),
        ...villageScene.towers.getChildren(),
        ...villageScene.barracks.getChildren(),
        ...villageScene.archeries.getChildren(),
        ...villageScene.monasteries.getChildren(),
        ...villageScene.sheeps.getChildren(),
      ];
      if (villageScene.castle) {
        allInteractiveObjects.push(villageScene.castle);
      }
      const objects = villageScene.input.manager.hitTest(pointer, allInteractiveObjects, villageScene.cameras.main);
      if (objects.length === 0) {
        this.closeAllProductionMenus();
      }
      // If an object was clicked, the 'selection-changed' event will handle closing the menu
      // if the new selection isn't the current barracks.
    });

    // Listen for resize events to adjust UI layout
    this.scale.on('resize', this.handleResize, this);

    // Initial state: disabled
    this.disableBuildButton();

    // --- Final Setup ---
    // This logic ensures that we connect to the VillageScene regardless of initialization order.

    // Check if the village scene is already running and has emitted its ready event.
    // We can check for a property that we know is set at the end of its create method.
    if (villageScene && villageScene.resourceManager) {
      this.handleVillageSceneReady({ scene: villageScene, resourceManager: villageScene.resourceManager });
    } else {
      // If not, set up a listener to wait for it.
      this.game.events.once('village-scene-ready', this.handleVillageSceneReady, this);
    }
  }

  /**
   * Builds one training menu: a panel with an icon per trainable unit plus queue/progress/hint text.
   * Left-click an icon to train that unit; right-click to cancel the latest queued one.
   */
  createProductionMenu(key, config) {
    const container = this.add.container(0, 0).setVisible(false).setDepth(5001);

    // The panel is interactive so clicks on it don't reach the modal background and close the menu.
    const panel = this.add.image(0, 0, config.panel).setOrigin(0, 0).setInteractive().setScale(config.panelScale);
    panel.on('pointerdown', (pointer) => pointer.stopPropagation());
    container.add(panel);

    const resolveX = (x) => (typeof x === 'string' ? panel.displayWidth / 4 + Number(x.split('+')[1]) : x);

    config.icons.forEach(icon => {
      const sprite = this.add.sprite(resolveX(icon.x), icon.y, icon.texture).setInteractive().setScale(0.8);
      sprite.play(icon.anim);
      sprite.on('pointerdown', (pointer) => this.handleTrainClick(pointer, key, icon.unit));
      container.add(sprite);
    });

    const queueText = this.add.text(resolveX(config.queueText.x), config.queueText.y, '', this.textStyles.queue)
      .setOrigin(config.queueText.originX, 0.5);
    const progressText = this.add.text(resolveX(config.progressText.x), config.progressText.y, '', this.textStyles.progress)
      .setOrigin(config.progressText.originX, 0.5);
    const hint = this.add.text(resolveX(config.hint.x), config.hint.y,
      'Left-click: train' + String.fromCharCode(10) + 'Right-click: cancel', this.textStyles.hint)
      .setOrigin(config.hint.originX, 0.5);
    container.add([queueText, progressText, hint]);

    this.productionMenus[key] = { container, panel, queueText, progressText, building: null };
  }

  openProductionMenu(key, building) {
    this.closeAllProductionMenus();

    const menu = this.productionMenus[key];
    menu.building = building;
    this.modalBackground.setVisible(true);

    // Centre the menu on the screen.
    const { displayWidth, displayHeight } = menu.panel;
    menu.container.setPosition(
      this.cameras.main.centerX - displayWidth / 2,
      this.cameras.main.centerY - displayHeight / 2 - 50
    );
    menu.container.setVisible(true);
  }

  closeProductionMenu(key) {
    const menu = this.productionMenus[key];
    menu.building = null;
    menu.container.setVisible(false);
    // The dimmed background stays while any other menu is still open.
    if (!Object.values(this.productionMenus).some(m => m.container.visible)) {
      this.modalBackground.setVisible(false);
    }
  }

  closeAllProductionMenus() {
    Object.keys(this.productionMenus).forEach(key => this.closeProductionMenu(key));
  }

  /** Keeps the queue/progress text of the open menu up to date; closes it if its building is gone. */
  updateProductionMenus() {
    for (const key of Object.keys(this.productionMenus)) {
      const menu = this.productionMenus[key];
      if (!menu.container.visible || !menu.building) continue;

      const building = menu.building;
      if (!building.active) {
        this.closeProductionMenu(key);
        continue;
      }

      const queue = building.productionQueue;
      menu.queueText.setText(`Queue: ${queue.length}`);
      if (queue.length > 0) {
        const { buildTime } = building.getUnitStats(queue[0]);
        const timeRemaining = (buildTime - building.productionProgress) / 1000;
        menu.progressText.setText(`Training: ${timeRemaining.toFixed(1)}s`);
      } else {
        menu.progressText.setText('');
      }
    }
  }

  handleTrainClick(pointer, key, unitType) {
    const building = this.productionMenus[key].building;
    if (!building || !building.active) return;
    if (pointer.rightButtonDown()) {
      building.cancelQueuedUnit(unitType);
    } else if (pointer.leftButtonDown()) {
      if (!building.queueUnit(unitType)) {
        console.log(`Not enough resources to train a ${unitType}!`);
      }
    }
  }

  onSelectionChange(selectedUnits) {
    // Check if any of the selected units are workers
    const hasWorker = selectedUnits.some(unit => unit.constructor.name === 'Worker');

    if (hasWorker) {
      this.enableBuildButton();
    } else {
      this.disableBuildButton();
    }

    // A menu stays open only while its building is the sole selection; anything else closes it.
    for (const key of Object.keys(this.productionMenus)) {
      const building = this.productionMenus[key].building;
      if (building && (selectedUnits.length !== 1 || selectedUnits[0] !== building)) {
        this.closeProductionMenu(key);
      }
    }
  }

  onBarracksSelected(barracks) {
    this.openProductionMenu('barracks', barracks);
  }

  onArcherySelected(archery) {
    this.openProductionMenu('archery', archery);
  }

  onCastleSelected(castle) {
    this.openProductionMenu('castle', castle);
  }

  enableBuildButton() {
    // The ribbon is the second element in the container
    this.buildMenuContainer.getAt(1).setAlpha(1.0).clearTint();
  }

  disableBuildButton() {
    // If the menu is open, close it first
    if (this.isMenuOpen) {
      this.toggleBuildMenu();
    }
    // Make the ribbon "dull"
    this.buildMenuContainer.getAt(1).setAlpha(0.5).setTint(0x888888);
  }

  toggleBuildMenu() {
    this.isMenuOpen = !this.isMenuOpen;

    // When OPEN, the ribbon's target is -180. When CLOSED, it's -580.
    const targetX = this.isMenuOpen ? -150 : -580;

    // Animate the entire container
    this.tweens.add({
      targets: this.buildMenuContainer,
      x: targetX,
      duration: 300,
      ease: 'Power2'
    });
  }

  handleVillageSceneReady(payload) {
    console.log('VillageScene is ready. Setting up UI that depends on it.');
    // Now that the VillageScene is ready, we can create the UI elements
    // that depend on its managers. Store the resource manager for later use.
    this.resourceManager = payload.resourceManager;
    this.setupResourceHandling(payload.resourceManager);

    // Listen for the timer update event from the WaveManager (via VillageScene)
    payload.scene.events.on('waveTimerUpdate', (text) => {
      if (this.waveTimerText) this.waveTimerText.setText(text);
    });

    // --- Create End Game Modal ---
    this.endGameContainer = this.add.container(this.cameras.main.centerX, this.cameras.main.centerY).setVisible(false).setDepth(6000);

    const endGameText = this.add.text(0, -50, '', { fontSize: '64px', fill: '#ffffff', stroke: '#000000', strokeThickness: 6 }).setOrigin(0.5);

    const restartButton = this.add.image(0, 100, 'play-again-button')
      .setInteractive()
      .setScale(1.3);

    restartButton.on('pointerover', () => restartButton.setTexture('play-again-button-hover'));
    restartButton.on('pointerout', () => restartButton.setTexture('play-again-button'));
    restartButton.on('pointerdown', () => restartButton.setTexture('play-again-button-pressed'));
    restartButton.on('pointerup', () => {
      // Stop current game scenes
      this.scene.get('VillageScene').scene.stop();
      this.scene.stop('UIScene');
      // Go back to the start scene to begin a new game
      this.scene.start('StartScene');
    });

    this.endGameContainer.add([endGameText, restartButton]);

    // Show the initial tutorial once the game is ready
    this.showTutorial('world');
  }

  showEndGameScreen(isWin) {
    // Make sure other modals are closed
    this.closeAllProductionMenus();
    if (this.isMenuOpen) {
      this.toggleBuildMenu();
    }
    if (this.tutorialContainer.visible) {
        this.closeTutorial();
    }

    // Show a dark background that can't be clicked to close
    // We need to re-create the graphics object to clear previous `fillStyle` calls
    // if we want a different opacity.
    if (this.modalBackground) {
      this.modalBackground.destroy();
    }
    this.modalBackground = this.add.graphics();
    this.modalBackground.fillStyle(0x000000, 0.7);
    this.modalBackground.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
    this.modalBackground.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.cameras.main.width, this.cameras.main.height), Phaser.Geom.Rectangle.Contains);
    this.modalBackground.on('pointerdown', (pointer) => {
      pointer.stopPropagation(); // Prevent clicks from passing through
    });
    this.modalBackground.setVisible(true).setDepth(5000);


    const text = isWin ? 'You are Victorious!' : 'Game Over';
    const color = isWin ? '#00ff00' : '#ff0000';

    const endGameText = this.endGameContainer.getAt(0); // Assuming text is the first element
    endGameText.setText(text);
    endGameText.setFill(color);

    this.endGameContainer.setVisible(true);
  }

  showTutorial(tutorialKey) {
    // For now, we only have one tutorial.
    if (tutorialKey === 'world') {
      this.currentTutorialSlideIndex = 0; // Reset to the first slide
      this.updateTutorialContent();

      // Show the modal and tutorial container
      this.tutorialContainer.setVisible(true);
      this.modalBackground.setVisible(true);

      // The modal background now only blocks input, it doesn't close the tutorial.
      this.modalBackground.off('pointerdown');

      // Pause the game scene while the tutorial is open
      this.scene.get('VillageScene').scene.pause();
    }
  }

  showNextTutorialSlide() {
    this.currentTutorialSlideIndex++;

    // If we've gone past the last slide, close the tutorial
    if (this.currentTutorialSlideIndex >= this.tutorialSlides.length) {
      this.closeTutorial();
    } else {
      // Otherwise, update the content for the next slide
      this.updateTutorialContent();
    }
  }

  updateTutorialContent() {
    const slide = this.tutorialSlides[this.currentTutorialSlideIndex];
    this.tutorialText.setText(slide.text);

    // Update the visual (animation or static image) and its layout for the current slide
    if (this.tutorialGif) {
      // 1. Set scale first to get the correct displayWidth for layout calculations
      this.tutorialGif.setScale(slide.scale || 1);

      // 2. Set the content (animation or image)
      if (slide.animKey) {
        this.tutorialGif.setVisible(true);
        this.tutorialGif.play(slide.animKey);
      } else if (slide.imageKey) {
        this.tutorialGif.setVisible(true);
        this.tutorialGif.stop(); // Stop any previous animation
        this.tutorialGif.setTexture(slide.imageKey);
      } else {
        this.tutorialGif.setVisible(false);
      }

      // 3. Recalculate and apply layout based on whether there's a visual
      if (this.tutorialGif.visible) {
        // Reset text origin for slides with visuals
        this.tutorialText.setOrigin(0, 0.5);
        const textBlockWidth = 450;
        const horizontalSpacing = 40;
        // Use displayWidth which accounts for the new scale
        const totalContentWidth = this.tutorialGif.displayWidth + horizontalSpacing + textBlockWidth;

        // Position GIF on the left, centered within the container
        this.tutorialGif.x = -totalContentWidth / 2 + this.tutorialGif.displayWidth / 2;
        this.tutorialGif.y = -40; // Move content up to make space for the button

        // Position text to the right of the GIF
        const textX = this.tutorialGif.x + this.tutorialGif.displayWidth / 2 + horizontalSpacing;
        this.tutorialText.setPosition(textX, -40);
      } else {
        // Center the text if there's no visual
        this.tutorialText.setOrigin(0.5, 0.5);
        this.tutorialText.setPosition(0, -40);
      }
    }

    // If it's the last slide, change the button to the 'start' button and add text
    if (this.currentTutorialSlideIndex === this.tutorialSlides.length - 1) {
      this.tutorialNextButton.setTexture('startButton').setScale(1);
    } else {
      this.tutorialNextButton.setTexture('next-button').setScale(1);
      this.tutorialNextButtonText.setText('');
    }
  }

  closeTutorial() {
    this.modalBackground.setVisible(false);
    this.tutorialContainer.setVisible(false);

    // Revert modal's close behavior to default (for production menu)
    this.modalBackground.off('pointerdown');
    this.modalBackground.on('pointerdown', () => {
      this.closeAllProductionMenus();
    });


    // Resume the game
    this.scene.get('VillageScene').scene.resume();
  }

  setupResourceHandling(resourceManager) {
    this.resourceBannerContainer = this.add.container(this.cameras.main.centerX, 0);

    const bannerY = 70;
    const banner = this.add.sprite(0, bannerY, 'resource-banner').setScale(0.6);
    this.resourceBannerContainer.add(banner);

    const iconY = bannerY;
    const spacing = 120; // Spacing between resource groups
    const textStyle = { fontSize: '32px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 };

    // Wood (left)
    const woodIcon = this.add.sprite(-spacing - 30, iconY - 20, 'wood-icon').setScale(0.8);
    this.woodText = this.add.text(woodIcon.x + 30, iconY - 10, String(resourceManager.get('wood')), textStyle).setOrigin(0, 0.5);
    this.resourceBannerContainer.add([woodIcon, this.woodText]);

    // Gold (center)
    const goldIcon = this.add.sprite(-30, iconY - 20 , 'gold-icon').setScale(0.8);
    this.goldText = this.add.text(goldIcon.x + 30, iconY - 10, String(resourceManager.get('gold')), textStyle).setOrigin(0, 0.5);
    this.resourceBannerContainer.add([goldIcon, this.goldText]);

    // Meat (right)
    const meatIcon = this.add.sprite(spacing - 30, iconY - 20, 'meat-icon').setScale(0.8);
    this.meatText = this.add.text(meatIcon.x + 30, iconY - 10, String(resourceManager.get('meat')), textStyle).setOrigin(0, 0.5);
    this.resourceBannerContainer.add([meatIcon, this.meatText]);

    // Listen for resource updates from the ResourceManager
    resourceManager.on('resourceChanged', (type, value) => {
      // Update the resource text display
      const resourceMap = {
        wood: this.woodText,
        gold: this.goldText,
        meat: this.meatText,
      };
      if (resourceMap[type]) resourceMap[type].setText(value);

      // Update the affordability of build icons
      this.updateBuildIcons(resourceManager);
    });

    // Set the initial state of the build icons
    this.updateBuildIcons(resourceManager);
  }

  updateBuildIcons(resourceManager) {
    Object.values(this.buildIcons).forEach(buildIcon => {
      if (resourceManager.hasEnough(buildIcon.class.COST)) {
        buildIcon.icon.setAlpha(1.0);
        buildIcon.icon.clearTint();
      } else {
        buildIcon.icon.setAlpha(0.5);
        buildIcon.icon.setTint(0x888888);
      }
    });
  }

  handleResize(gameSize) {
    const { width, height } = gameSize;

    // 1. Redraw Modal Background to cover the new dimensions
    if (this.modalBackground) {
      const isEndGame = this.endGameContainer && this.endGameContainer.visible;
      this.modalBackground.clear();
      this.modalBackground.fillStyle(0x000000, isEndGame ? 0.7 : 0.5);
      this.modalBackground.fillRect(0, 0, width, height);
      this.modalBackground.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    }

    // 2. Redraw Pause Overlay
    if (this.pauseBg) {
      this.pauseBg.clear();
      this.pauseBg.fillStyle(0x000000, 0.6);
      this.pauseBg.fillRect(0, 0, width, height);
    }

    // 3. Reposition UI elements
    if (this.pauseText) this.pauseText.setPosition(width / 2, height / 2);
    if (this.tutorialContainer) this.tutorialContainer.setPosition(width / 2, height / 2);
    if (this.endGameContainer) this.endGameContainer.setPosition(width / 2, height / 2);
    if (this.waveTimerText) this.waveTimerText.setX(width / 2);
    if (this.resourceBannerContainer) this.resourceBannerContainer.setX(width / 2);
    if (this.settingsButton) this.settingsButton.setX(width - 50);
    if (this.fullscreenButton) this.fullscreenButton.setX(width - 110);
  }

  update(time, delta) {
    this.updateProductionMenus();
  }
}