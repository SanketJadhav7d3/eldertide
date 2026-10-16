
export default class StartScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StartScene' });
  }

  preload() {
    this.load.image('water-background', './Tiny Swords/Tiny Swords (Update 010)/Terrain/Water/Water.png');
    this.load.image('startButton', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons/Button_Blue_3Slides.png'); // Placeholder button
    this.load.image('startButtonHover', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons/Button_Hover_3Slides.png'); // Placeholder button hover
    this.load.image('startButtonPressed', './Tiny Swords/Tiny Swords (Update 010)/UI/Buttons/Button_Blue_3Slides_Pressed.png'); // Placeholder button pressed
    this.load.image('cloudSprite', './Tiny Swords/Tiny Swords (Update 010)/Clouds/cloud 1.png'); // Placeholder button pressed
    this.load.image('gameTitleImage', './Tiny Swords/Tiny Swords (Update 010)/Game Title/Game Title.png'); // Placeholder button pressed

  }

  create() {
    // Add water background
    const background = this.add.image(this.cameras.main.centerX, this.cameras.main.centerY, 'water-background');
    background.setDisplaySize(this.cameras.main.width, this.cameras.main.height);

    this.add.sprite(this.cameras.main.centerX, this.cameras.main.centerY - 100, 'gameTitleImage').setScale(0.5);

    // Add start button
    const startButton = this.add.image(this.cameras.main.centerX, this.cameras.main.centerY + 250, 'startButton')
      .setInteractive()
      .setScale(1.3);

    startButton.on('pointerover', () => {
      startButton.setTexture('startButtonHover');
    });

    startButton.on('pointerout', () => {
      startButton.setTexture('startButton');
    });

    startButton.on('pointerdown', () => {
      startButton.setTexture('startButtonPressed');
    });

    startButton.on('pointerup', () => {
      this.scene.start('LoadingScene');
    });

    this.createEditorButton(this.cameras.main.centerX, this.cameras.main.centerY + 340);
  }

  /** Opens the map editor. Drawn in code because the art pack has no blank button. */
  createEditorButton(x, y) {
    const width = 230;
    const height = 54;
    const background = this.add.graphics();
    const draw = (fill, border) => {
      background.clear();
      background.fillStyle(border, 1);
      background.fillRoundedRect(x - width / 2, y - height / 2, width, height, 12);
      background.fillStyle(fill, 1);
      background.fillRoundedRect(x - width / 2 + 5, y - height / 2 + 5, width - 10, height - 10, 8);
    };
    draw(0x6fa8a8, 0xe9dcc0);

    this.add.text(x, y, 'MAP EDITOR', { fontFamily: 'Arial, sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#7a1f2b' }).setOrigin(0.5);

    const zone = this.add.zone(x, y, width, height).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => draw(0x8cc3c3, 0xe9dcc0));
    zone.on('pointerout', () => draw(0x6fa8a8, 0xe9dcc0));
    zone.on('pointerdown', () => draw(0x5a9090, 0xe9dcc0));
    zone.on('pointerup', () => this.scene.start('EditorScene'));
  }
}
