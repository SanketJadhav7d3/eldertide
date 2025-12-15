import { House, Barracks, Tower, Castle, Archery, Monastery } from '../entities/structureEntity.js';


export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
    this.isMenuOpen = false;
    this.buildMenuContainer = null; // A single container for the entire menu
    this.woodText = null;
    this.resourceManager = null;
    this.productionMenuContainer = null;
    this.modalBackground = null;
    this.selectedBarracks = null;
    this.productionQueueText = null;
    this.productionProgressText = null;
    this.tutorialContainer = null;
    this.tutorialGif = null;
    this.tutorialText = null;
    this.tutorialNextButton = null;
    this.tutorialNextButtonText = null;
    this.currentTutorialSlideIndex = 0;
    this.tutorialSlides = [
      {
        text: "Welcome to Tiny Swords!\n\n- Click and drag to select units.\n- Right-click on the ground to move them.\n- Right-click on an enemy to attack.",
        animKey: 'tutorial-drag-select-anim', // This slide uses an animation
        scale: 1.2,
      },
      {
        text: "To build structures, first select a Worker.\n\nThis will activate the build menu on the left.\n\nClick an icon to enter build mode and place your new building.",
        animKey: 'tutorial-build-anim', // This slide uses an animation
        scale: 0.5 
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
    ];
    this.buildIcons = {}; // To store references to the icon images and their data
    this.waveTimerText = null;
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
      // Position icons relative to the container
      const item = this.add.image(350, 180 + (index * 110), option.icon)
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
    const settingsButton = this.add.image(this.cameras.main.width - 50, 50, 'settings-button')
      .setInteractive()
      .setScrollFactor(0)
      .setDepth(1000);

    settingsButton.on('pointerover', () => {
      settingsButton.setTexture('settings-button-hover');
    });

    settingsButton.on('pointerout', () => {
      settingsButton.setTexture('settings-button');
    });

    settingsButton.on('pointerdown', () => {
      settingsButton.setTexture('settings-button-pressed');
    });

    settingsButton.on('pointerup', () => {
      // We let pointerout/over handle the texture change after the click action
      console.log('Settings button clicked. Implement settings menu/scene here.');
      // Example: this.scene.launch('SettingsScene');
    });

    // --- Create a modal background for pop-up menus ---
    // This covers the whole screen and closes the menu when clicked.
    this.modalBackground = this.add.graphics();
    this.modalBackground.fillStyle(0x000000, 0.5);
    this.modalBackground.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
    this.modalBackground.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.cameras.main.width, this.cameras.main.height), Phaser.Geom.Rectangle.Contains);
    this.modalBackground.on('pointerdown', () => this.closeProductionMenu());
    this.modalBackground.setVisible(false).setDepth(5000); // High depth to be on top of most UI

    // --- Create the Production Menu (initially hidden) ---
    this.productionMenuContainer = this.add.container(0, 0).setVisible(false).setDepth(5001);

    // Use the 'build-panel' image for a consistent UI style.
    // Make it interactive to "catch" clicks and prevent them from passing through to the modal background.
    const prodPanel = this.add.image(0, 0, 'production-panel').setOrigin(0, 0).setInteractive();
    prodPanel.on('pointerdown', (pointer) => {
      pointer.stopPropagation(); // Stop the click from reaching the modal background
    });
    this.productionMenuContainer.add(prodPanel);

    // Use an animated sprite instead of a static icon for a more dynamic UI.
    const trainWarriorSprite = this.add.sprite(100, 100, 'warrior-entity-pos').setInteractive();
    trainWarriorSprite.play('warrior-idle-anim');

    //trainWarriorSprite.setScale(0.8); // Adjust scale to fit the panel
    trainWarriorSprite.on('pointerdown', () => {
      if (this.selectedBarracks) {
        const cost = Barracks.WARRIOR_STATS.cost;
        if (this.resourceManager.hasEnough(cost)) {
          this.resourceManager.spend(cost);
          this.selectedBarracks.addToProductionQueue(1);
        } else {
          console.log("Not enough resources to train a warrior!");
        }
      }
    });

    // Text for queue count and progress
    // Repositioned to fit the new panel layout.
    const productionTextStyle = { fontSize: '24px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 };
    const progressTextStyle = { fontSize: '20px', fill: '#cccccc', stroke: '#000000', strokeThickness: 4 };
    this.productionQueueText = this.add.text(180, 100, '', productionTextStyle);
    this.productionProgressText = this.add.text(200, 140, '', progressTextStyle);

    this.productionMenuContainer.add([trainWarriorSprite, this.productionQueueText, this.productionProgressText]);

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
    const buttonY = tutorialPanel.displayHeight / 2 - 60;
    this.tutorialNextButton = this.add.image(0, buttonY, 'build-button')
      .setInteractive()
      .setScale(0.8);

    const buttonTextStyle = { fontSize: '32px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 };
    this.tutorialNextButtonText = this.add.text(0, buttonY, 'Next', buttonTextStyle).setOrigin(0.5);

    this.tutorialNextButton.on('pointerdown', () => {
      this.showNextTutorialSlide();
    });

    this.tutorialContainer.add([tutorialPanel, this.tutorialGif, this.tutorialText, this.tutorialNextButton, this.tutorialNextButtonText]);
    this.tutorialContainer.setPosition(this.cameras.main.centerX, this.cameras.main.centerY);

    // Listen for selection changes from the main game scene
    villageScene.events.on('selection-changed', this.onSelectionChange, this);

    // Listen for when a barracks is specifically selected
    villageScene.events.on('barracks-selected', this.onBarracksSelected, this);

    // Listen for an action to start to close the menu
    this.game.events.on('action-started', () => {
        if (this.isMenuOpen) {
            this.toggleBuildMenu();
        }
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
        this.closeProductionMenu();
      }
      // If an object was clicked, the 'selection-changed' event will handle closing the menu
      // if the new selection isn't the current barracks.
    });

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

  onSelectionChange(selectedUnits) {
    // Check if any of the selected units are workers
    const hasWorker = selectedUnits.some(unit => unit.constructor.name === 'Worker');

    if (hasWorker) {
      this.enableBuildButton();
    } else {
      this.disableBuildButton();
    }

    // If the new selection is not our currently selected barracks, close its menu.
    if (selectedUnits.length !== 1 || selectedUnits[0] !== this.selectedBarracks) {
      this.closeProductionMenu();
    }
  }

  onBarracksSelected(barracks) {
    this.selectedBarracks = barracks;

    // Show the modal background
    this.modalBackground.setVisible(true);

    // Center the production menu on the screen and make it visible
    // The menu's dimensions are now based on the scaled background image.
    const menuWidth = this.productionMenuContainer.getAt(0).displayWidth;
    const menuHeight = this.productionMenuContainer.getAt(0).displayHeight;
    this.productionMenuContainer.setPosition(this.cameras.main.centerX - (menuWidth / 2), this.cameras.main.centerY - (menuHeight / 2) - 50);
    this.productionMenuContainer.setVisible(true);
  }

  closeProductionMenu() {
    this.selectedBarracks = null;
    this.modalBackground.setVisible(false);
    this.productionMenuContainer.setVisible(false);
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

    // Show the initial tutorial once the game is ready
    this.showTutorial('world');
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

      // 3. Recalculate and apply the horizontal layout
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
    }

    // If it's the last slide, change the button text to indicate the game will start
    if (this.currentTutorialSlideIndex === this.tutorialSlides.length - 1) {
      this.tutorialNextButtonText.setText('Start Game');
    } else {
      this.tutorialNextButtonText.setText('Next');
    }
  }

  closeTutorial() {
    this.modalBackground.setVisible(false);
    this.tutorialContainer.setVisible(false);

    // Revert modal's close behavior to default (for production menu)
    this.modalBackground.off('pointerdown');
    this.modalBackground.on('pointerdown', () => this.closeProductionMenu());

    // Resume the game
    this.scene.get('VillageScene').scene.resume();
  }

  setupResourceHandling(resourceManager) {
    const bannerX = this.cameras.main.centerX;
    const bannerY = 70;
    this.add.sprite(bannerX, bannerY, 'resource-banner').setScale(0.6);

    const iconY = bannerY;
    const spacing = 120; // Spacing between resource groups
    const textStyle = { fontSize: '32px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 };

    // Wood (left)
    const woodIcon = this.add.sprite(bannerX - spacing - 30, iconY - 20, 'wood-icon').setScale(0.8);
    this.woodText = this.add.text(woodIcon.x + 30, iconY - 10, String(resourceManager.get('wood')), textStyle).setOrigin(0, 0.5);

    // Gold (center)
    const goldIcon = this.add.sprite(bannerX - 30, iconY - 20 , 'gold-icon').setScale(0.8);
    this.goldText = this.add.text(goldIcon.x + 30, iconY - 10, String(resourceManager.get('gold')), textStyle).setOrigin(0, 0.5);

    // Meat (right)
    const meatIcon = this.add.sprite(bannerX + spacing - 30, iconY - 20, 'meat-icon').setScale(0.8);
    this.meatText = this.add.text(meatIcon.x + 30, iconY - 10, String(resourceManager.get('meat')), textStyle).setOrigin(0, 0.5);

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

  update(time, delta) {
    // Keep the production menu updated if it's open
    if (this.productionMenuContainer.visible && this.selectedBarracks) {
      // If the barracks gets destroyed while selected, close the menu
      if (!this.selectedBarracks.active) {
        this.closeProductionMenu();
        return;
      }

      const queue = this.selectedBarracks.productionQueue;
      this.productionQueueText.setText(`Queue: ${queue.length}`);

      if (queue.length > 0) {
        const timeRemaining = (Barracks.WARRIOR_STATS.buildTime - this.selectedBarracks.productionProgress) / 1000;
        this.productionProgressText.setText(`${timeRemaining.toFixed(1)}s`);
      } else {
        this.productionProgressText.setText('');
      }
    }
  }
}