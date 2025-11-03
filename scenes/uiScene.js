export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  preload() {
    // Load UI assets
    this.load.image('left-side-bar', './Tiny Swords/Tiny Swords (Update 010)/UI/menu banner.png');
    this.load.image('ribbon-header-left-side-bar', './Tiny Swords/Tiny Swords (Update 010)/UI/ribbon-header-left-side-bar.png');
    this.load.image('fullscreen-button', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons/full_screen.png');
    this.load.image('fullscreen-pressed', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons/full_screen_pressed.png');
    this.load.image('fullscreen-hover', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons/full_screen_hover.png');
    this.load.image('tower-icon', './Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Tower/Tower_Blue.png');
    this.load.image('house-icon', './Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/House/House_Blue.png');
    this.load.image('castle-icon', './Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Buildings/Castle/Castle_Blue.png');
  }

  create() {
    this.cameras.main.setZoom(0.75);

    // The UI scene's camera is independent of the game scene's camera.
    // We can position elements relative to the screen.
    const sideBar = this.add.sprite(-830, -100, 'left-side-bar').setOrigin(0, 0);
    const ribbon = this.add.sprite(-880, -50, 'ribbon-header-left-side-bar').setOrigin(0, 0);

    // Actions Menu (initially hidden)
    this.actionsMenu = this.add.container(-250, 150); // Positioned for when the sidebar is open
    this.actionsMenu.setVisible(false);

    // A flag to track the menu state
    this.isMenuOpen = false;

    // Make the ribbon interactive
    ribbon.setInteractive({ useHandCursor: true });

    // Add a pointer down event to toggle the menu
    ribbon.on('pointerdown', () => {
      this.isMenuOpen = !this.isMenuOpen;
      const targetXSideBar = this.isMenuOpen ? -830 : -300;
      const targetXRibbon = this.isMenuOpen ? -880 : -350;

      this.tweens.add({
        targets: sideBar,
        x: targetXSideBar,
        duration: 300,
        ease: 'Power2'
      });

      this.tweens.add({
        targets: ribbon,
        x: targetXRibbon,
        duration: 300,
        ease: 'Power2'
      });
    });

    // Listen for selection events from VillageScene
    const gameEvents = this.game.events;
    gameEvents.on('selection-changed', this.handleSelectionChange, this);
    this.game.events.on('action-started', () => this.handleActionStarted(ribbon));
    
    // Fullscreen button
    const screenWidth = this.cameras.main.width;
    const screenHeight = this.cameras.main.height;

    const fullscreenButton = this.add.sprite(screenWidth + 260, -70, 'fullscreen-button')
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        fullscreenButton.setTexture('fullscreen-pressed');
        if (this.scale.isFullscreen) {
          this.scale.stopFullscreen();
        } else {
          this.scale.startFullscreen();
        }
      })
      .on('pointerover', () => {
        fullscreenButton.setTexture('fullscreen-hover');
      })
      .on('pointerout', () => {
        fullscreenButton.setTexture('fullscreen-button');
      })
      .on('pointerup', () => {
        // On release, return to hover state if pointer is still over, otherwise pointerout will handle it
        fullscreenButton.setTexture('fullscreen-hover');
      });

    fullscreenButton.setDepth(11);

  }

  handleActionStarted(ribbon) {
    // An action has begun, so hide the menu and close the sidebar
    this.actionsMenu.setVisible(false);
    if (this.isMenuOpen) {
      ribbon.emit('pointerdown'); // Programmatically click the ribbon to close it
    }
  }

  createActionButton(x, y, icon, text, action, target) {
    const buttonContainer = this.add.container(x, y);
    const buttonSprite = this.add.sprite(0, 0, icon).setScale(0.5).setInteractive({ useHandCursor: true });
    const buttonText = this.add.text(0, 50, text, { fontSize: '18px', fill: '#fff' }).setOrigin(0.5, 0);

    buttonSprite.on('pointerdown', () => {
      this.game.events.emit('start-action', { action, target });
    });

    buttonContainer.add([buttonSprite, buttonText]);
    return buttonContainer;
  }

  populateWorkerActions() {
    this.actionsMenu.removeAll(true); // Clear previous buttons

    // Define actions for a worker
    const actions = [
      { icon: 'tower-icon', text: 'Build Tower', action: 'build', target: 'tower' },
      { icon: 'house-icon', text: 'Build House', action: 'build', target: 'house' },
      { icon: 'castle-icon', text: 'Build Castle', action: 'build', target: 'castle' },
      // { icon: 'axe-icon', text: 'Cut Wood', action: 'gather', target: 'tree' }, // Example for later
      // { icon: 'pickaxe-icon', text: 'Mine Gold', action: 'gather', target: 'goldmine' } // Example for later
    ];

    // Create and position buttons in a grid
    const columns = 2;
    const buttonSpacingX = 100;
    const buttonSpacingY = 120;

    actions.forEach((action, index) => {
      const x = (index % columns) * buttonSpacingX;
      const y = Math.floor(index / columns) * buttonSpacingY;
      const button = this.createActionButton(x, y, action.icon, action.text, action.action, action.target);
      this.actionsMenu.add(button);
    });
  }

  handleSelectionChange(selectedUnits) {
    const allWorkers = selectedUnits.length > 0 && selectedUnits.every(unit => unit.texture.key === 'worker-entity');

    if (allWorkers) {
      this.populateWorkerActions();
      this.actionsMenu.setVisible(true);
    } else {
      this.actionsMenu.setVisible(false);
    }
  }
}