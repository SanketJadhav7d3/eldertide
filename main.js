
import VillageScene from './villageScene.js';


var config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scene: [VillageScene]
};


Window.game = new Phaser.Game(config);

window.addEventListener('keydown', function(event) {
  // Check if the key pressed was 'Enter'
  if (event.key === 'R') {
    console.log('Enter key pressed!');
    let gameScene = window.game.scene.getScene('VillageScene');
    if (gameScene.sys.isPaused()) {
      gameScene.sys.resume();
    } else {
      gameScene.sys.pause();
    }
  } });
