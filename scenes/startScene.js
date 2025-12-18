
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
  }
}
