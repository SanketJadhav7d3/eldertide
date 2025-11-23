export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
    this.isMenuOpen = false;
    this.buildMenuContainer = null; // A single container for the entire menu
    this.woodText = null;
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
    // --- Resource Display ---
    // align it to the right side
    const resourceBanner = this.add.sprite(this.cameras.main.width - 220, 70, 'resource-banner').setScale(0.6);

    const woodIcon = this.add.sprite(resourceBanner.x - 120 - 20, resourceBanner.y - 20, 'wood-icon').setScale(0.8);
    this.woodText = this.add.text(woodIcon.x + 50, woodIcon.y+5, '0', { fontSize: '32px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 });

    // add other resource images as well
    const goldIcon = this.add.sprite(resourceBanner.x - 20, resourceBanner.y - 20, 'gold-icon').setScale(0.8);
    this.goldText = this.add.text(goldIcon.x + 50, goldIcon.y+5, '0', { fontSize: '32px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 });

    const meatIcon = this.add.sprite(resourceBanner.x + 120 - 20, resourceBanner.y - 20, 'meat-icon').setScale(0.8);
    this.meatText = this.add.text(meatIcon.x + 50, meatIcon.y+5, '0', { fontSize: '32px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 });

    // --- Create a container for the entire build menu ---
    // We create it at its "closed" position.
    this.buildMenuContainer = this.add.container(-580, 0);

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
      { key: 'castle', icon: 'castle-icon' },
      { key: 'house', icon: 'house-icon' },
      { key: 'tower', icon: 'tower-icon' },
      { key: 'barracks', icon: 'barracks-icon' },
      { key: 'archery', icon: 'archery-icon' },
      { key: 'monastery', icon: 'monastery-icon' },
    ];

    menuOptions.forEach((option, index) => {
      // Position icons relative to the container
      const item = this.add.image(350, 180 + (index * 110), option.icon)
        .setInteractive()
        .setScale(0.6);

      item.on('pointerdown', (pointer) => {
        if (pointer.leftButtonDown()) {
          // Emit an event to the VillageScene to start the action
          this.game.events.emit('start-action', { action: 'build', target: option.key });
          this.toggleBuildMenu(); // Close menu after selection
        }
      });
      this.buildMenuContainer.add(item); // Add the icon to the container
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

    
    // Let the VillageScene know where the wood icon is for the animation target
    this.game.events.emit('ui-ready', { 
      woodUiPosition: { x: woodIcon.x, y: woodIcon.y }
    });

    // Listen for resource updates from the VillageScene
    villageScene.events.on('resource-updated', this.updateResourceText, this);

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

  updateResourceText(resources) {
    if (resources.wood !== undefined) {
      this.woodText.setText(resources.wood);
    }
  }
}