
import VillageScene from './villageScene.js';
import StartScene from './scenes/startScene.js';
import LoadingScene from './scenes/LoadingScene.js';
import UIScene from './scenes/uiScene.js';
import AnimatedTiles from './plugins/animatedTilesPlugin.js';

var config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: true
    }
  },  
  scene: [StartScene, LoadingScene, VillageScene, UIScene] ,
  plugins: {
    scene: [
      { key: 'AnimatedTiles', plugin: AnimatedTiles, mapping: 'animatedTiles' }
    ]
  }
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
