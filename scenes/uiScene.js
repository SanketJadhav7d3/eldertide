import { House, Barracks, Tower, Castle, Archery, Monastery } from '../entities/structureEntity.js';


export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
    this.isMenuOpen = false;
    this.buildMenuContainer = null; // A single container for the entire menu
    this.woodText = null;
    this.buildIcons = {}; // To store references to the icon images and their data
  }

  init() {
    console.log("UIScene init — adding listener for village-scene-ready");
    // --- Resource Display & Logic ---
    // Set up the listener in init() to avoid a race condition.
    // This ensures the UIScene is listening *before* the VillageScene can emit the event.
    // The listener now accepts the 'payload' object from the event.

    // get village scene
    const villageScene = this.scene.get('VillageScene');


    this.game.events.once('village-scene-ready', (payload) => {
      console.log('VillageScene is ready. Creating resource banner.');
      // Now that the VillageScene is ready, we can create the UI elements
      // that depend on its managers.
      this.setupResourceHandling(payload.resourceManager);
    });
  }

  preload() {
    // Preload assets for UI elements
    this.load.image('build-button', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons/Button_Blue.png');
      this.load.image('ribbon-header-left-side-bar', './Tiny Swords/Tiny Swords (Update 010)/UI/ribbon-header-left-side-bar.png');
    this.load.image('tower-icon', './Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Tower/Tower_Blue.png');
    this.load.image('house-icon', './Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/House/House_Blue.png');
    this.load.image('castle-icon', './Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Castle/Castle_Blue.png');
    this.load.image('barracks-icon', './Tiny Swords/Tiny Swords (Update 010)/Buildings/Blue Buildings/Barracks.png');
    this.load.image('archery-icon', './Tiny Swords/Tiny Swords (Update 010)/Buildings/Blue Buildings/Archery.png');
    this.load.image('monastery-icon', './Tiny Swords/Tiny Swords (Update 010)/Buildings/Blue Buildings/Monastery.png');
    this.load.image('build-panel', './Tiny Swords/Tiny Swords (Update 010)/UI/menu banner.png');

    // --- Load assets for the resource banner ---
    this.load.image('resource-banner', './Tiny Swords/UI/resources banner.png'); // Using an existing banner asset as a placeholder
    this.load.image('wood-icon', './Tiny Swords/Tiny Swords (Update 010)/Resources/Resources/W_Idle.png');
    this.load.image('gold-icon', './Tiny Swords/Tiny Swords (Update 010)/Resources/Resources/G_Idle_(NoShadow).png');
    this.load.image('meat-icon', './Tiny Swords/Tiny Swords (Update 010)/Resources/Resources/M_Idle_(NoShadow).png');
  }

  create() {
    // Set the default cursor style using a custom image. Hotspot is at (5, 5).
    this.input.manager.canvas.style.cursor = `url('./Tiny Swords/Tiny Swords (Update 010)/UI/Pointers/01.png') 5 5, auto`;


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

    // Listen for selection changes from the main game scene
    const villageScene = this.scene.get('VillageScene');
    villageScene.events.on('selection-changed', this.onSelectionChange, this);

    // Listen for an action to start to close the menu
    this.game.events.on('action-started', () => {
        if (this.isMenuOpen) {
            this.toggleBuildMenu();
        }
    });

    // Initial state: disabled
    this.disableBuildButton();
  }

  onSelectionChange(selectedUnits) {
    // Check if any of the selected units are workers
    const hasWorker = selectedUnits.some(unit => unit.constructor.name === 'Worker');

    if (hasWorker) {
      this.enableBuildButton();
    } else {
      this.disableBuildButton();
    }
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

  setupResourceHandling(resourceManager) {
    const resourceBanner = this.add.sprite(this.cameras.main.width - 220, 70, 'resource-banner').setScale(0.6);

    const woodIcon = this.add.sprite(resourceBanner.x - 120 - 20, resourceBanner.y - 20, 'wood-icon').setScale(0.8);
    this.woodText = this.add.text(woodIcon.x + 30, woodIcon.y - 3, resourceManager.get('wood'), { fontSize: '32px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 });

    const goldIcon = this.add.sprite(resourceBanner.x - 20, resourceBanner.y - 20, 'gold-icon').setScale(0.8);
    this.goldText = this.add.text(goldIcon.x + 30, goldIcon.y - 3, resourceManager.get('gold'), { fontSize: '32px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 });

    const meatIcon = this.add.sprite(resourceBanner.x + 120 - 20, resourceBanner.y - 20, 'meat-icon').setScale(0.8);
    this.meatText = this.add.text(meatIcon.x + 30, meatIcon.y - 3, resourceManager.get('meat'), { fontSize: '32px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 });

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
}