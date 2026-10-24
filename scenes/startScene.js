import { listMaps, rememberedMap, rememberMap, DEFAULT_MAP } from '../mapLoader.js';
import { readReplayFile } from './replayScene.js';

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
      // LoadingScene loads whichever map is picked in the selector.
      this.registry.remove('replay');
      this.registry.set('mapPath', this.selectedMap().path);
      this.scene.start('LoadingScene');
    });

    this.createMapSelector(this.cameras.main.centerX, this.cameras.main.centerY + 180);
    this.createEditorButton(this.cameras.main.centerX - 125, this.cameras.main.centerY + 340);
    this.createReplayButton(this.cameras.main.centerX + 125, this.cameras.main.centerY + 340);
  }

  /** "◀ map name ▶": picks which map to play (map.tmj or any maps/*.tmj). */
  createMapSelector(x, y) {
    const width = 360;
    const height = 46;
    const box = this.add.graphics();
    box.fillStyle(0xe9dcc0, 1).fillRoundedRect(x - width / 2, y - height / 2, width, height, 12);
    box.fillStyle(0x2f5b5b, 1).fillRoundedRect(x - width / 2 + 4, y - height / 2 + 4, width - 8, height - 8, 9);

    const style = { fontFamily: 'Arial, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f3ead2' };
    this.mapLabel = this.add.text(x, y, 'Map: loading...', style).setOrigin(0.5);

    const arrow = (dx, label, step) => {
      const t = this.add.text(x + dx, y, label, { ...style, fontSize: '22px' }).setOrigin(0.5);
      const zone = this.add.zone(x + dx, y, 44, height).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => t.setColor('#ffd24a'));
      zone.on('pointerout', () => t.setColor('#f3ead2'));
      zone.on('pointerup', () => this.stepMap(step));
    };
    arrow(-width / 2 + 24, '◀', -1);
    arrow(width / 2 - 24, '▶', 1);
    this.input.keyboard.on('keydown-LEFT', () => this.stepMap(-1));
    this.input.keyboard.on('keydown-RIGHT', () => this.stepMap(1));

    this.maps = [{ path: DEFAULT_MAP, name: 'Default map' }];
    this.mapIndex = 0;
    const wanted = rememberedMap();
    listMaps().then(maps => {
      if (!this.sys.isActive()) return;
      this.maps = maps;
      this.mapIndex = Math.max(0, maps.findIndex(m => m.path === wanted));
      this.showMap();
    });
    this.showMap();
  }

  selectedMap() {
    return this.maps[this.mapIndex] ?? { path: DEFAULT_MAP };
  }

  stepMap(step) {
    if (this.maps.length < 2) return;
    this.mapIndex = (this.mapIndex + step + this.maps.length) % this.maps.length;
    rememberMap(this.selectedMap().path);
    this.showMap();
  }

  showMap() {
    const name = this.selectedMap().name;
    const short = name.length > 18 ? `${name.slice(0, 17)}…` : name;
    this.mapLabel.setText(this.maps.length > 1 ? `${short}  (${this.mapIndex + 1}/${this.maps.length})` : short);
  }

  /** Opens the map editor. */
  createEditorButton(x, y) {
    this.createTextButton(x, y, 'MAP EDITOR', () => this.scene.start('EditorScene'));
  }

  /**
   * Opens a replay of a game played in the RL simulator (rl/eldertide_rl/replay.py): picks the file,
   * then LoadingScene loads its map and hands over to ReplayScene.
   */
  createReplayButton(x, y) {
    const message = this.add.text(x, y + 44, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#ffe0e0',
      stroke: '#7a1f2b', strokeThickness: 4, align: 'center', wordWrap: { width: 420 },
    }).setOrigin(0.5, 0);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gz,.json,application/json,application/gzip';
    input.style.display = 'none';
    document.body.appendChild(input);
    this.events.once('shutdown', () => input.remove());
    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      message.setText('Reading replay...');
      try {
        const replay = await readReplayFile(file);
        if (!this.sys.isActive()) return;
        this.registry.set('replay', replay);
        this.registry.set('mapPath', replay.map);
        this.scene.start('LoadingScene');
      } catch (error) {
        console.error(error);
        message.setText(error.message);
      }
    });
    // Browsers open a file dialog only while handling a real click, and Phaser runs its pointer handlers
    // later, from its own loop, so the dialog is opened from a native click on the canvas instead.
    const zone = this.createTextButton(x, y, 'WATCH REPLAY', () => {});
    const canvas = this.game.canvas;
    const onClick = event => {
      const box = canvas.getBoundingClientRect();
      const px = (event.clientX - box.left) * (canvas.width / box.width);
      const py = (event.clientY - box.top) * (canvas.height / box.height);
      if (zone.getBounds().contains(px, py)) input.click();
    };
    canvas.addEventListener('click', onClick);
    this.events.once('shutdown', () => canvas.removeEventListener('click', onClick));
  }

  /** A button drawn in code, because the art pack has no blank button. */
  createTextButton(x, y, label, onClick) {
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

    this.add.text(x, y, label, { fontFamily: 'Arial, sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#7a1f2b' }).setOrigin(0.5);

    const zone = this.add.zone(x, y, width, height).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => draw(0x8cc3c3, 0xe9dcc0));
    zone.on('pointerout', () => draw(0x6fa8a8, 0xe9dcc0));
    zone.on('pointerdown', () => draw(0x5a9090, 0xe9dcc0));
    zone.on('pointerup', () => {
      draw(0x8cc3c3, 0xe9dcc0);
      onClick();
    });
    return zone;
  }
}
